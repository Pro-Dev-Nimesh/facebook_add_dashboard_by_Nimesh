const { db } = require('../models/database');

/**
 * Alert Generator Service
 * Scans campaign/adset/ad metrics against configured thresholds
 * using 30-day aggregated data and creates alerts.
 *
 * Revenue is sourced from both:
 * 1. campaign/adset/ad_daily_metrics (Facebook pixel purchase events)
 * 2. revenue_transactions table (Pabbly webhooks / manual entry)
 * The higher of the two is used to avoid missing opportunities.
 */

// Minimum ROAS threshold for opportunity detection
const OPPORTUNITY_ROAS_THRESHOLD = 2.0;

/**
 * Ensure alert_thresholds row exists for an account, creating defaults if missing.
 */
function ensureThresholds(accountId) {
    let thresholds = db.prepare('SELECT * FROM alert_thresholds WHERE account_id = ?').get(accountId);
    if (!thresholds) {
        db.prepare('INSERT OR IGNORE INTO alert_thresholds (account_id) VALUES (?)').run(accountId);
        thresholds = db.prepare('SELECT * FROM alert_thresholds WHERE account_id = ?').get(accountId);
        console.log(`[AlertGenerator] Created default thresholds for account ${accountId}`);
    }
    return thresholds;
}

/**
 * Get revenue from revenue_transactions for a specific item (campaign/adset/ad) over a date range.
 * Returns { revenue, sales } from the transactions table.
 */
function getTransactionRevenue(accountId, level, itemId, startDate, endDate) {
    try {
        let query;
        if (level === 'campaign') {
            query = `SELECT COALESCE(SUM(amount), 0) as revenue, COUNT(*) as sales
                     FROM revenue_transactions
                     WHERE account_id = ? AND campaign_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?`;
        } else if (level === 'adset') {
            query = `SELECT COALESCE(SUM(amount), 0) as revenue, COUNT(*) as sales
                     FROM revenue_transactions
                     WHERE account_id = ? AND adset_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?`;
        } else {
            query = `SELECT COALESCE(SUM(amount), 0) as revenue, COUNT(*) as sales
                     FROM revenue_transactions
                     WHERE account_id = ? AND ad_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?`;
        }
        const result = db.prepare(query).get(accountId, itemId, startDate, endDate);
        return { revenue: result?.revenue || 0, sales: result?.sales || 0 };
    } catch (e) {
        return { revenue: 0, sales: 0 };
    }
}

/**
 * Calculate effective ROAS using best available revenue data.
 * Uses the higher of daily_metrics revenue vs revenue_transactions revenue.
 */
function getEffectiveRevenue(metricRevenue, transactionRevenue) {
    return Math.max(metricRevenue || 0, transactionRevenue || 0);
}

function generateAlerts(accountId) {
    const thresholds = ensureThresholds(accountId);
    if (!thresholds) return [];

    const newAlerts = [];

    // Opportunity ROAS threshold: fixed at 2.0 (ROAS > 2 means profitable, consider scaling)
    const opportunityRoas = OPPORTUNITY_ROAS_THRESHOLD;

    // --- CAMPAIGN-LEVEL CHECKS (30-day aggregated) ---
    const campLatest = db.prepare(
        `SELECT MAX(date) as latest FROM campaign_daily_metrics WHERE account_id = ?`
    ).get(accountId);

    if (campLatest?.latest) {
        const startDate = campLatest.latest.replace(/(\d{4}-\d{2}-\d{2})/, (match) => {
            const d = new Date(match);
            d.setDate(d.getDate() - 30);
            return d.toISOString().split('T')[0];
        });
        const endDate = campLatest.latest;

        const campaigns = db.prepare(`
            SELECT c.id, c.name, c.status,
                   SUM(cdm.spend) as spend, SUM(cdm.revenue) as metric_revenue, SUM(cdm.sales) as metric_sales,
                   AVG(cdm.frequency) as frequency
            FROM campaigns c
            JOIN campaign_daily_metrics cdm ON c.id = cdm.campaign_id
            WHERE c.account_id = ? AND cdm.date >= date(?, '-30 days') AND cdm.date <= ?
            GROUP BY c.id
            HAVING SUM(cdm.spend) > 0
            ORDER BY SUM(cdm.spend) DESC
        `).all(accountId, endDate, endDate);

        for (const camp of campaigns) {
            // Get revenue from transactions table as supplement
            const txn = getTransactionRevenue(accountId, 'campaign', camp.id, startDate, endDate);
            const revenue = getEffectiveRevenue(camp.metric_revenue, txn.revenue);
            const roas = camp.spend > 0 ? revenue / camp.spend : 0;

            // Critical: ROAS below critical threshold
            if (roas < thresholds.critical_roas && camp.spend >= 100) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'low_roas',
                    priority: 'critical',
                    level: 'campaign',
                    item_name: camp.name,
                    item_id: camp.id,
                    spend: Math.round(camp.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day ROAS ${roas.toFixed(2)} is below critical threshold of ${thresholds.critical_roas}`
                });
            }
            // Warning: ROAS below min but above critical
            else if (roas < thresholds.min_campaign_roas && roas >= thresholds.critical_roas && camp.spend >= 50) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'low_roas',
                    priority: 'warning',
                    level: 'campaign',
                    item_name: camp.name,
                    item_id: camp.id,
                    spend: Math.round(camp.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day ROAS ${roas.toFixed(2)} is below minimum threshold of ${thresholds.min_campaign_roas}`
                });
            }

            // Overspend check
            if (camp.spend > thresholds.campaign_overspend && roas < thresholds.min_campaign_roas) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'overspend',
                    priority: camp.spend > thresholds.campaign_overspend * 5 ? 'critical' : 'warning',
                    level: 'campaign',
                    item_name: camp.name,
                    item_id: camp.id,
                    spend: Math.round(camp.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day spend $${camp.spend.toFixed(0)} exceeds $${thresholds.campaign_overspend} with poor ROAS of ${roas.toFixed(2)}`
                });
            }

            // High frequency
            if (camp.frequency >= thresholds.critical_frequency) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'high_frequency',
                    priority: 'critical',
                    level: 'campaign',
                    item_name: camp.name,
                    item_id: camp.id,
                    spend: Math.round(camp.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `Avg frequency ${camp.frequency.toFixed(2)} exceeds critical threshold of ${thresholds.critical_frequency}`
                });
            } else if (camp.frequency >= thresholds.high_frequency) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'high_frequency',
                    priority: 'warning',
                    level: 'campaign',
                    item_name: camp.name,
                    item_id: camp.id,
                    spend: Math.round(camp.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `Avg frequency ${camp.frequency.toFixed(2)} exceeds threshold of ${thresholds.high_frequency}`
                });
            }

            // Opportunity: High ROAS - consider scaling budget
            if (roas >= opportunityRoas && camp.spend >= 50) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'high_roas',
                    priority: 'opportunity',
                    level: 'campaign',
                    item_name: camp.name,
                    item_id: camp.id,
                    spend: Math.round(camp.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day avg ROAS is ${roas.toFixed(2)} (Spend: $${camp.spend.toFixed(0)}, Revenue: $${revenue.toFixed(0)}). Increase budget to scale revenue.`
                });
            }
        }
    }

    // --- AD SET-LEVEL CHECKS (30-day aggregated) ---
    const adsetLatest = db.prepare(
        `SELECT MAX(date) as latest FROM adset_daily_metrics WHERE account_id = ?`
    ).get(accountId);

    if (adsetLatest?.latest) {
        const startDate = adsetLatest.latest.replace(/(\d{4}-\d{2}-\d{2})/, (match) => {
            const d = new Date(match);
            d.setDate(d.getDate() - 30);
            return d.toISOString().split('T')[0];
        });
        const endDate = adsetLatest.latest;

        const adsets = db.prepare(`
            SELECT a.id, a.name,
                   SUM(adm.spend) as spend, SUM(adm.revenue) as metric_revenue, SUM(adm.sales) as metric_sales,
                   AVG(adm.frequency) as frequency
            FROM ad_sets a
            JOIN adset_daily_metrics adm ON a.id = adm.adset_id
            WHERE a.account_id = ? AND adm.date >= date(?, '-30 days') AND adm.date <= ?
            GROUP BY a.id
            HAVING SUM(adm.spend) > 0
            ORDER BY SUM(adm.spend) DESC
        `).all(accountId, endDate, endDate);

        for (const adset of adsets) {
            // Get revenue from transactions table as supplement
            const txn = getTransactionRevenue(accountId, 'adset', adset.id, startDate, endDate);
            const revenue = getEffectiveRevenue(adset.metric_revenue, txn.revenue);
            const roas = adset.spend > 0 ? revenue / adset.spend : 0;

            // Critical: ROAS below critical threshold
            if (roas < thresholds.critical_roas && adset.spend >= 50) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'low_roas',
                    priority: 'critical',
                    level: 'adset',
                    item_name: adset.name,
                    item_id: adset.id,
                    spend: Math.round(adset.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day ROAS ${roas.toFixed(2)} is below critical threshold of ${thresholds.critical_roas}`
                });
            }
            // Warning: ROAS below min but above critical
            else if (roas < thresholds.min_adset_roas && roas >= thresholds.critical_roas && adset.spend >= 50) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'low_roas',
                    priority: 'warning',
                    level: 'adset',
                    item_name: adset.name,
                    item_id: adset.id,
                    spend: Math.round(adset.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day ROAS ${roas.toFixed(2)} is below minimum threshold of ${thresholds.min_adset_roas}`
                });
            }

            // High frequency
            if (adset.frequency >= thresholds.critical_frequency) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'high_frequency',
                    priority: 'critical',
                    level: 'adset',
                    item_name: adset.name,
                    item_id: adset.id,
                    spend: Math.round(adset.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `Avg frequency ${adset.frequency.toFixed(2)} exceeds critical threshold of ${thresholds.critical_frequency}`
                });
            } else if (adset.frequency >= thresholds.high_frequency) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'high_frequency',
                    priority: 'warning',
                    level: 'adset',
                    item_name: adset.name,
                    item_id: adset.id,
                    spend: Math.round(adset.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `Avg frequency ${adset.frequency.toFixed(2)} exceeds threshold of ${thresholds.high_frequency}`
                });
            }

            // Ad set overspend with poor ROAS
            if (adset.spend > thresholds.adset_overspend && roas < thresholds.min_adset_roas) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'overspend',
                    priority: adset.spend > thresholds.adset_overspend * 5 ? 'critical' : 'warning',
                    level: 'adset',
                    item_name: adset.name,
                    item_id: adset.id,
                    spend: Math.round(adset.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day spend $${adset.spend.toFixed(0)} exceeds $${thresholds.adset_overspend} with poor ROAS of ${roas.toFixed(2)}`
                });
            }

            // Opportunity: High ROAS ad set - consider increasing budget
            if (roas >= opportunityRoas && adset.spend >= 50) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'high_roas',
                    priority: 'opportunity',
                    level: 'adset',
                    item_name: adset.name,
                    item_id: adset.id,
                    spend: Math.round(adset.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day avg ROAS is ${roas.toFixed(2)} (Spend: $${adset.spend.toFixed(0)}, Revenue: $${revenue.toFixed(0)}). Increase budget to scale revenue.`
                });
            }
        }
    }

    // --- AD-LEVEL CHECKS (30-day aggregated) ---
    const adLatest = db.prepare(
        `SELECT MAX(date) as latest FROM ad_daily_metrics WHERE account_id = ?`
    ).get(accountId);

    if (adLatest?.latest) {
        const startDate = adLatest.latest.replace(/(\d{4}-\d{2}-\d{2})/, (match) => {
            const d = new Date(match);
            d.setDate(d.getDate() - 30);
            return d.toISOString().split('T')[0];
        });
        const endDate = adLatest.latest;

        const ads = db.prepare(`
            SELECT a.id, a.name,
                   SUM(adm.spend) as spend, SUM(adm.revenue) as metric_revenue, SUM(adm.sales) as metric_sales,
                   AVG(adm.frequency) as frequency
            FROM ads a
            JOIN ad_daily_metrics adm ON a.id = adm.ad_id
            WHERE a.account_id = ? AND adm.date >= date(?, '-30 days') AND adm.date <= ?
            GROUP BY a.id
            HAVING SUM(adm.spend) > 0
            ORDER BY SUM(adm.spend) DESC
        `).all(accountId, endDate, endDate);

        for (const ad of ads) {
            // Get revenue from transactions table as supplement
            const txn = getTransactionRevenue(accountId, 'ad', ad.id, startDate, endDate);
            const revenue = getEffectiveRevenue(ad.metric_revenue, txn.revenue);
            const sales = Math.max(ad.metric_sales || 0, txn.sales || 0);
            const roas = ad.spend > 0 ? revenue / ad.spend : 0;

            // Zero sales with significant spend (check both sources)
            if (sales === 0 && revenue === 0 && ad.spend >= 500) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'zero_sales',
                    priority: ad.spend >= 1000 ? 'critical' : 'warning',
                    level: 'ad',
                    item_name: ad.name,
                    item_id: ad.id,
                    spend: Math.round(ad.spend * 100) / 100,
                    roas: 0,
                    threshold_info: `$${ad.spend.toFixed(0)} spent in 30 days with zero sales - consider pausing`
                });
            }
            // Critical ROAS for ads
            else if (roas < thresholds.critical_roas && ad.spend >= 100 && roas > 0) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'low_roas',
                    priority: 'critical',
                    level: 'ad',
                    item_name: ad.name,
                    item_id: ad.id,
                    spend: Math.round(ad.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day ROAS ${roas.toFixed(2)} is below critical threshold of ${thresholds.critical_roas}`
                });
            }

            // Opportunity: High performing ad - consider scaling
            if (roas >= opportunityRoas && ad.spend >= 50) {
                newAlerts.push({
                    account_id: accountId,
                    type: 'high_roas',
                    priority: 'opportunity',
                    level: 'ad',
                    item_name: ad.name,
                    item_id: ad.id,
                    spend: Math.round(ad.spend * 100) / 100,
                    roas: Math.round(roas * 100) / 100,
                    threshold_info: `30-day avg ROAS is ${roas.toFixed(2)} (Spend: $${ad.spend.toFixed(0)}, Revenue: $${revenue.toFixed(0)}). Top performing ad - increase budget to scale.`
                });
            }
        }
    }

    // Deduplicate: avoid multiple alerts for the same item+type
    const seen = new Set();
    const dedupedAlerts = newAlerts.filter(alert => {
        const key = `${alert.level}-${alert.item_id}-${alert.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return dedupedAlerts;
}

/**
 * Regenerate alerts for an account:
 * 1. Clear old non-resolved alerts (keep resolved/dismissed for history)
 * 2. Generate new alerts from current data
 * 3. Insert new alerts
 */
function regenerateAlerts(accountId) {
    // Delete old investigating/in_progress alerts (they'll be regenerated)
    db.prepare(`
        DELETE FROM alerts
        WHERE account_id = ? AND status IN ('investigating', 'in_progress')
    `).run(accountId);

    const alerts = generateAlerts(accountId);

    const insertStmt = db.prepare(`
        INSERT INTO alerts (account_id, type, priority, level, item_name, item_id, spend, roas, threshold_info, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'investigating')
    `);

    const insertMany = db.transaction((alertList) => {
        for (const alert of alertList) {
            insertStmt.run(
                alert.account_id,
                alert.type,
                alert.priority,
                alert.level,
                alert.item_name,
                alert.item_id,
                alert.spend,
                alert.roas,
                alert.threshold_info
            );
        }
    });

    insertMany(alerts);

    const opportunities = alerts.filter(a => a.priority === 'opportunity');
    console.log(`[AlertGenerator] Generated ${alerts.length} alerts (${opportunities.length} opportunities) for account ${accountId}`);
    return alerts;
}

/**
 * Regenerate alerts for ALL accounts
 */
function regenerateAllAlerts() {
    const accounts = db.prepare('SELECT id FROM ad_accounts').all();
    let totalAlerts = 0;
    let totalOpportunities = 0;

    for (const account of accounts) {
        const alerts = regenerateAlerts(account.id);
        totalAlerts += alerts.length;
        totalOpportunities += alerts.filter(a => a.priority === 'opportunity').length;
    }

    console.log(`[AlertGenerator] Total: ${totalAlerts} alerts (${totalOpportunities} opportunities) across ${accounts.length} accounts`);
    return totalAlerts;
}

module.exports = { generateAlerts, regenerateAlerts, regenerateAllAlerts };
