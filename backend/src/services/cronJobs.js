const cron = require('node-cron');
const axios = require('axios');
const { db } = require('../models/database');

// Facebook API configuration
const FB_API_VERSION = 'v18.0';
const FB_API_BASE = `https://graph.facebook.com/${FB_API_VERSION}`;

// Rate limiting: Max 50 API calls per day per account
const MAX_DAILY_API_CALLS = 50;

/**
 * Check if account has remaining API calls for today
 */
const hasRemainingApiCalls = (accountId) => {
    const today = new Date().toISOString().split('T')[0];

    const status = db.prepare(`
        SELECT total_api_calls_today, api_calls_reset_at
        FROM sync_status WHERE account_id = ?
    `).get(accountId);

    if (!status) return true;

    // Reset if it's a new day
    if (status.api_calls_reset_at !== today) {
        db.prepare(`
            UPDATE sync_status
            SET total_api_calls_today = 0, api_calls_reset_at = ?
            WHERE account_id = ?
        `).run(today, accountId);
        return true;
    }

    return status.total_api_calls_today < MAX_DAILY_API_CALLS;
};

/**
 * Increment API call counter
 */
const incrementApiCalls = (accountId, count = 1) => {
    const today = new Date().toISOString().split('T')[0];

    db.prepare(`
        UPDATE sync_status
        SET total_api_calls_today = COALESCE(total_api_calls_today, 0) + ?,
            api_calls_reset_at = ?
        WHERE account_id = ?
    `).run(count, today, accountId);
};

/**
 * Sync yesterday's data for an account
 * This is the daily incremental sync - only fetches previous day's data
 */
const syncDailyData = async (accountId) => {
    console.log(`[CRON] Starting daily sync for account ${accountId}`);

    try {
        // Check rate limits
        if (!hasRemainingApiCalls(accountId)) {
            console.log(`[CRON] Account ${accountId} has reached daily API limit`);
            return { success: false, error: 'Daily API limit reached' };
        }

        // Get account details
        const account = db.prepare(`
            SELECT * FROM ad_accounts WHERE id = ? AND status = 'active'
        `).get(accountId);

        if (!account || !account.access_token) {
            console.log(`[CRON] Account ${accountId} not found or not active`);
            return { success: false, error: 'Account not found or inactive' };
        }

        // Update sync status to in_progress
        db.prepare(`
            UPDATE sync_status
            SET last_sync_status = 'in_progress'
            WHERE account_id = ?
        `).run(accountId);

        // Calculate yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        // In production, make actual Facebook API calls
        // For demo, we'll simulate with random data
        console.log(`[CRON] Syncing data for ${dateStr}`);

        // Simulate API call (in production, use actual Facebook API)
        // const response = await axios.get(`${FB_API_BASE}/${account.facebook_account_id}/insights`, {
        //     params: {
        //         access_token: account.access_token,
        //         fields: 'spend,impressions,clicks,cpc,cpm,ctr,reach,actions',
        //         time_range: JSON.stringify({ since: dateStr, until: dateStr }),
        //         level: 'campaign'
        //     }
        // });

        // Increment API call counter
        incrementApiCalls(accountId, 4); // campaigns, adsets, ads, account level

        // Update last sync time
        db.prepare(`
            UPDATE sync_status
            SET last_daily_sync_at = CURRENT_TIMESTAMP,
                last_sync_status = 'success',
                last_sync_error = NULL
            WHERE account_id = ?
        `).run(accountId);

        db.prepare(`
            UPDATE ad_accounts
            SET last_synced = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(accountId);

        console.log(`[CRON] Daily sync completed for account ${accountId}`);
        return { success: true };

    } catch (error) {
        console.error(`[CRON] Sync error for account ${accountId}:`, error.message);

        db.prepare(`
            UPDATE sync_status
            SET last_sync_status = 'failed',
                last_sync_error = ?
            WHERE account_id = ?
        `).run(error.message, accountId);

        return { success: false, error: error.message };
    }
};

/**
 * Run initial historical sync for a new account
 * Fetches last 1 year of data
 */
const runInitialSync = async (accountId) => {
    console.log(`[CRON] Starting initial sync for account ${accountId}`);

    try {
        const account = db.prepare(`
            SELECT * FROM ad_accounts WHERE id = ?
        `).get(accountId);

        if (!account || !account.access_token) {
            return { success: false, error: 'Account not found or no token' };
        }

        // Initialize sync status
        db.prepare(`
            INSERT OR REPLACE INTO sync_status
            (account_id, initial_sync_complete, last_sync_status, sync_frequency)
            VALUES (?, 0, 'in_progress', 'daily')
        `).run(accountId);

        // Calculate date range (1 year ago to yesterday)
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);

        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        console.log(`[CRON] Syncing historical data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

        // In production, this would make paginated Facebook API calls
        // For demo, we'll mark as complete
        // The actual implementation would:
        // 1. Fetch all campaigns
        // 2. Fetch all ad sets
        // 3. Fetch all ads
        // 4. Fetch daily insights for each level
        // 5. Store in respective tables

        // Mark initial sync as complete
        db.prepare(`
            UPDATE sync_status
            SET initial_sync_complete = 1,
                initial_sync_completed_at = CURRENT_TIMESTAMP,
                last_sync_status = 'success',
                next_scheduled_sync = datetime('now', '+1 day')
            WHERE account_id = ?
        `).run(accountId);

        db.prepare(`
            UPDATE ad_accounts
            SET initial_sync_complete = 1, last_synced = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(accountId);

        console.log(`[CRON] Initial sync completed for account ${accountId}`);
        return { success: true };

    } catch (error) {
        console.error(`[CRON] Initial sync error for account ${accountId}:`, error.message);

        db.prepare(`
            UPDATE sync_status
            SET last_sync_status = 'failed',
                last_sync_error = ?
            WHERE account_id = ?
        `).run(error.message, accountId);

        return { success: false, error: error.message };
    }
};

/**
 * Check and generate alerts based on thresholds
 */
const checkAlertThresholds = async () => {
    console.log('[CRON] Checking alert thresholds');

    try {
        const thresholds = db.prepare(`
            SELECT at.*, aa.name as account_name
            FROM alert_thresholds at
            JOIN ad_accounts aa ON at.account_id = aa.id
            WHERE at.is_active = 1
        `).all();

        for (const threshold of thresholds) {
            // Get recent metric value (last 24 hours)
            let metricValue = 0;

            switch (threshold.metric) {
                case 'spend':
                    const spendResult = db.prepare(`
                        SELECT SUM(spend) as value
                        FROM campaign_daily_metrics
                        WHERE account_id = ? AND date = date('now', '-1 day')
                    `).get(threshold.account_id);
                    metricValue = spendResult?.value || 0;
                    break;

                case 'cpc':
                    const cpcResult = db.prepare(`
                        SELECT AVG(cpc) as value
                        FROM campaign_daily_metrics
                        WHERE account_id = ? AND date = date('now', '-1 day')
                    `).get(threshold.account_id);
                    metricValue = cpcResult?.value || 0;
                    break;

                case 'ctr':
                    const ctrResult = db.prepare(`
                        SELECT AVG(ctr) as value
                        FROM campaign_daily_metrics
                        WHERE account_id = ? AND date = date('now', '-1 day')
                    `).get(threshold.account_id);
                    metricValue = ctrResult?.value || 0;
                    break;

                case 'roas':
                    const roasResult = db.prepare(`
                        SELECT AVG(roas) as value
                        FROM campaign_daily_metrics
                        WHERE account_id = ? AND date = date('now', '-1 day')
                    `).get(threshold.account_id);
                    metricValue = roasResult?.value || 0;
                    break;

                default:
                    continue;
            }

            // Check threshold
            let triggered = false;
            switch (threshold.operator) {
                case '>':
                    triggered = metricValue > threshold.threshold_value;
                    break;
                case '<':
                    triggered = metricValue < threshold.threshold_value;
                    break;
                case '>=':
                    triggered = metricValue >= threshold.threshold_value;
                    break;
                case '<=':
                    triggered = metricValue <= threshold.threshold_value;
                    break;
                case '=':
                    triggered = metricValue === threshold.threshold_value;
                    break;
            }

            if (triggered) {
                // Check if alert already exists for today
                const existingAlert = db.prepare(`
                    SELECT id FROM alerts
                    WHERE account_id = ? AND type = 'threshold'
                    AND message LIKE ? AND date(created_at) = date('now')
                `).get(threshold.account_id, `%${threshold.metric}%`);

                if (!existingAlert) {
                    // Create alert
                    db.prepare(`
                        INSERT INTO alerts (account_id, type, priority, message, status)
                        VALUES (?, 'threshold', 'high', ?, 'active')
                    `).run(
                        threshold.account_id,
                        `${threshold.metric.toUpperCase()} alert: ${metricValue.toFixed(2)} ${threshold.operator} ${threshold.threshold_value} for ${threshold.account_name}`
                    );
                    console.log(`[CRON] Alert created for ${threshold.metric} on account ${threshold.account_id}`);
                }
            }
        }

    } catch (error) {
        console.error('[CRON] Alert threshold check error:', error.message);
    }
};

/**
 * Clean up old data (optional - keep last 13 months)
 */
const cleanupOldData = async () => {
    console.log('[CRON] Running data cleanup');

    try {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 13);
        const cutoffStr = cutoffDate.toISOString().split('T')[0];

        // Delete old daily metrics
        const campaignDeleted = db.prepare(`
            DELETE FROM campaign_daily_metrics WHERE date < ?
        `).run(cutoffStr);

        const adsetDeleted = db.prepare(`
            DELETE FROM adset_daily_metrics WHERE date < ?
        `).run(cutoffStr);

        const adDeleted = db.prepare(`
            DELETE FROM ad_daily_metrics WHERE date < ?
        `).run(cutoffStr);

        console.log(`[CRON] Cleanup complete. Deleted: campaigns(${campaignDeleted.changes}), adsets(${adsetDeleted.changes}), ads(${adDeleted.changes})`);

    } catch (error) {
        console.error('[CRON] Cleanup error:', error.message);
    }
};

/**
 * Initialize cron jobs
 */
const initializeCronJobs = () => {
    console.log('[CRON] Initializing cron jobs...');

    // Daily sync - runs at 2 AM every day
    cron.schedule('0 2 * * *', async () => {
        console.log('[CRON] Running daily sync job');

        // Get all active accounts that have completed initial sync
        const accounts = db.prepare(`
            SELECT aa.id
            FROM ad_accounts aa
            JOIN sync_status ss ON aa.id = ss.account_id
            WHERE aa.status = 'active'
            AND ss.initial_sync_complete = 1
        `).all();

        for (const account of accounts) {
            await syncDailyData(account.id);
            // Add delay between accounts to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    });

    // Alert threshold check - runs every 4 hours
    cron.schedule('0 */4 * * *', () => {
        console.log('[CRON] Running alert threshold check');
        checkAlertThresholds();
    });

    // Weekly cleanup - runs on Sunday at 3 AM
    cron.schedule('0 3 * * 0', () => {
        console.log('[CRON] Running weekly cleanup');
        cleanupOldData();
    });

    // Reset daily API call counters - runs at midnight
    cron.schedule('0 0 * * *', () => {
        console.log('[CRON] Resetting daily API call counters');
        const today = new Date().toISOString().split('T')[0];

        db.prepare(`
            UPDATE sync_status
            SET total_api_calls_today = 0, api_calls_reset_at = ?
        `).run(today);
    });

    console.log('[CRON] Cron jobs initialized successfully');
};

module.exports = {
    initializeCronJobs,
    syncDailyData,
    runInitialSync,
    checkAlertThresholds,
    cleanupOldData,
    hasRemainingApiCalls,
    incrementApiCalls
};
