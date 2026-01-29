const express = require('express');
const { db } = require('../models/database');
const { authenticateToken, checkAccountAccess } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/dashboard/metrics/:accountId
router.get('/metrics/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { timeRange = 'last30days' } = req.query;

        // Calculate date range
        const dateRange = getDateRange(timeRange);

        // Get aggregated metrics from campaign_daily_metrics (spend, leads)
        const metrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as total_spend,
                COALESCE(SUM(leads), 0) as total_leads
            FROM campaign_daily_metrics
            WHERE account_id = ? AND date >= ? AND date <= ?
        `).get(accountId, dateRange.start, dateRange.end);

        // Get revenue and sales from revenue_transactions (sales data from Data Management)
        const revenueData = db.prepare(`
            SELECT
                COALESCE(SUM(amount), 0) as total_revenue,
                COUNT(*) as total_sales
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
        `).get(accountId, dateRange.start, dateRange.end);

        const totalRevenue = revenueData.total_revenue;
        const totalSales = revenueData.total_sales;

        // Calculate ROAS using revenue from sales data
        const roas = metrics.total_spend > 0
            ? (totalRevenue / metrics.total_spend).toFixed(2)
            : '0.00';

        // Calculate cost per lead
        const costPerLead = metrics.total_leads > 0
            ? (metrics.total_spend / metrics.total_leads).toFixed(2)
            : '0.00';

        // Get previous period for comparison
        const prevDateRange = getPreviousDateRange(timeRange);
        const prevMetrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as total_spend,
                COALESCE(SUM(leads), 0) as total_leads
            FROM campaign_daily_metrics
            WHERE account_id = ? AND date >= ? AND date <= ?
        `).get(accountId, prevDateRange.start, prevDateRange.end);

        // Get previous period revenue from revenue_transactions
        const prevRevenueData = db.prepare(`
            SELECT
                COALESCE(SUM(amount), 0) as total_revenue,
                COUNT(*) as total_sales
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
        `).get(accountId, prevDateRange.start, prevDateRange.end);

        // Calculate changes
        const changes = {
            spend: calculateChange(metrics.total_spend, prevMetrics.total_spend),
            revenue: calculateChange(totalRevenue, prevRevenueData.total_revenue),
            sales: calculateChange(totalSales, prevRevenueData.total_sales),
            leads: calculateChange(metrics.total_leads, prevMetrics.total_leads)
        };

        // Get sync status
        const syncStatus = db.prepare(`
            SELECT last_daily_sync_at, last_sync_status
            FROM sync_status WHERE account_id = ?
        `).get(accountId);

        res.json({
            success: true,
            data: {
                totalSpend: metrics.total_spend.toFixed(2),
                totalRevenue: totalRevenue.toFixed(2),
                roas,
                totalLeads: metrics.total_leads,
                totalSales: totalSales,
                costPerLead,
                pixelStatus: 'active',
                changes,
                lastSynced: syncStatus?.last_daily_sync_at || null,
                syncStatus: syncStatus?.last_sync_status || 'pending'
            }
        });
    } catch (error) {
        console.error('Get metrics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get metrics'
        });
    }
});

// GET /api/dashboard/time-metrics/:accountId
router.get('/time-metrics/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const today = new Date().toISOString().split('T')[0];

        // Get today's spend and leads from campaign_daily_metrics
        const dailySpendMetrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as spend,
                COALESCE(SUM(leads), 0) as leads
            FROM campaign_daily_metrics
            WHERE account_id = ? AND date = ?
        `).get(accountId, today);

        // Get today's revenue from revenue_transactions (sales data)
        const dailyRevenue = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as revenue
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) = ?
        `).get(accountId, today);

        // Get this week's metrics (last 7 days)
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        const weekStartStr = weekStart.toISOString().split('T')[0];

        const weekSpendMetrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as spend,
                COALESCE(SUM(leads), 0) as leads
            FROM campaign_daily_metrics
            WHERE account_id = ? AND date >= ?
        `).get(accountId, weekStartStr);

        // Get this week's revenue from revenue_transactions
        const weekRevenue = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as revenue
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ?
        `).get(accountId, weekStartStr);

        // Get this month's metrics
        const monthStart = new Date();
        monthStart.setDate(1);
        const monthStartStr = monthStart.toISOString().split('T')[0];

        const monthSpendMetrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as spend,
                COALESCE(SUM(leads), 0) as leads
            FROM campaign_daily_metrics
            WHERE account_id = ? AND date >= ?
        `).get(accountId, monthStartStr);

        // Get this month's revenue from revenue_transactions
        const monthRevenue = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as revenue
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ?
        `).get(accountId, monthStartStr);

        const formatMetrics = (spendData, revenueData) => ({
            spend: spendData.spend.toFixed(2),
            revenue: revenueData.revenue.toFixed(2),
            roas: spendData.spend > 0 ? (revenueData.revenue / spendData.spend).toFixed(2) : '0.00',
            leads: spendData.leads,
            cpl: spendData.leads > 0 ? (spendData.spend / spendData.leads).toFixed(2) : '0.00'
        });

        res.json({
            success: true,
            data: {
                daily: formatMetrics(dailySpendMetrics, dailyRevenue),
                weekly: formatMetrics(weekSpendMetrics, weekRevenue),
                monthly: formatMetrics(monthSpendMetrics, monthRevenue)
            }
        });
    } catch (error) {
        console.error('Get time metrics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get time metrics'
        });
    }
});

// GET /api/dashboard/campaigns/:accountId
router.get('/campaigns/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { status = 'all', search = '', timeRange = 'last30days' } = req.query;

        const dateRange = getDateRange(timeRange);

        let query = `
            SELECT
                c.id,
                c.name,
                c.status,
                c.budget,
                COALESCE(SUM(m.spend), 0) as spend,
                COALESCE(SUM(m.leads), 0) as leads,
                COALESCE(SUM(m.impressions), 0) as impressions,
                COALESCE(SUM(m.reach), 0) as reach,
                COALESCE(SUM(m.clicks), 0) as clicks,
                COALESCE(AVG(m.frequency), 0) as frequency
            FROM campaigns c
            LEFT JOIN campaign_daily_metrics m ON c.id = m.campaign_id
                AND m.date >= ? AND m.date <= ?
            WHERE c.account_id = ?
        `;

        const params = [dateRange.start, dateRange.end, accountId];

        if (status !== 'all') {
            query += ' AND c.status = ?';
            params.push(status);
        }

        if (search) {
            query += ' AND c.name LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' GROUP BY c.id ORDER BY spend DESC';

        const campaigns = db.prepare(query).all(...params);

        // Get revenue and sales from revenue_transactions for each campaign
        const revenueQuery = db.prepare(`
            SELECT
                campaign_id,
                COALESCE(SUM(amount), 0) as revenue,
                COUNT(*) as sales
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
            GROUP BY campaign_id
        `);
        const revenueData = revenueQuery.all(accountId, dateRange.start, dateRange.end);
        const revenueMap = new Map(revenueData.map(r => [r.campaign_id, { revenue: r.revenue, sales: r.sales }]));

        // Format response
        const formattedCampaigns = campaigns.map(c => {
            const revData = revenueMap.get(c.id) || { revenue: 0, sales: 0 };
            return {
                id: c.id,
                name: c.name,
                status: c.status,
                budget: `$${c.budget.toFixed(2)}`,
                spend: `$${c.spend.toFixed(2)}`,
                revenue: `$${revData.revenue.toFixed(2)}`,
                sales: revData.sales,
                roas: c.spend > 0 ? (revData.revenue / c.spend).toFixed(2) : '0.00',
                frequency: c.frequency.toFixed(1),
                outboundClicks: c.clicks.toLocaleString(),
                reach: c.reach.toLocaleString(),
                impressions: c.impressions.toLocaleString()
            };
        });

        res.json({
            success: true,
            data: formattedCampaigns,
            total: formattedCampaigns.length
        });
    } catch (error) {
        console.error('Get campaigns error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get campaigns'
        });
    }
});

// GET /api/dashboard/adsets/:accountId
router.get('/adsets/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { status = 'all', campaignId = 'all', search = '', timeRange = 'last30days' } = req.query;

        const dateRange = getDateRange(timeRange);

        let query = `
            SELECT
                a.id,
                a.name,
                a.status,
                a.budget,
                c.name as campaign_name,
                COALESCE(SUM(m.spend), 0) as spend,
                COALESCE(SUM(m.leads), 0) as leads,
                COALESCE(SUM(m.impressions), 0) as impressions,
                COALESCE(SUM(m.reach), 0) as reach,
                COALESCE(SUM(m.clicks), 0) as clicks,
                COALESCE(AVG(m.frequency), 0) as frequency
            FROM ad_sets a
            JOIN campaigns c ON a.campaign_id = c.id
            LEFT JOIN adset_daily_metrics m ON a.id = m.adset_id
                AND m.date >= ? AND m.date <= ?
            WHERE a.account_id = ?
        `;

        const params = [dateRange.start, dateRange.end, accountId];

        if (status !== 'all') {
            query += ' AND a.status = ?';
            params.push(status);
        }

        if (campaignId !== 'all') {
            query += ' AND a.campaign_id = ?';
            params.push(campaignId);
        }

        if (search) {
            query += ' AND a.name LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' GROUP BY a.id ORDER BY spend DESC';

        const adSets = db.prepare(query).all(...params);

        // Get revenue and sales from revenue_transactions for each adset
        const revenueQuery = db.prepare(`
            SELECT
                adset_id,
                COALESCE(SUM(amount), 0) as revenue,
                COUNT(*) as sales
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
            GROUP BY adset_id
        `);
        const revenueData = revenueQuery.all(accountId, dateRange.start, dateRange.end);
        const revenueMap = new Map(revenueData.map(r => [r.adset_id, { revenue: r.revenue, sales: r.sales }]));

        const formattedAdSets = adSets.map(a => {
            const revData = revenueMap.get(a.id) || { revenue: 0, sales: 0 };
            return {
                id: a.id,
                name: a.name,
                campaignName: a.campaign_name,
                status: a.status,
                budget: `$${a.budget.toFixed(2)}`,
                spend: `$${a.spend.toFixed(2)}`,
                revenue: `$${revData.revenue.toFixed(2)}`,
                sales: revData.sales,
                roas: a.spend > 0 ? (revData.revenue / a.spend).toFixed(2) : '0.00',
                frequency: a.frequency.toFixed(1),
                outboundClicks: a.clicks.toLocaleString(),
                reach: a.reach.toLocaleString(),
                impressions: a.impressions.toLocaleString()
            };
        });

        res.json({
            success: true,
            data: formattedAdSets,
            total: formattedAdSets.length
        });
    } catch (error) {
        console.error('Get ad sets error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get ad sets'
        });
    }
});

// GET /api/dashboard/ads/:accountId
router.get('/ads/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { status = 'all', campaignId = 'all', adSetId = 'all', search = '', timeRange = 'last30days' } = req.query;

        const dateRange = getDateRange(timeRange);

        let query = `
            SELECT
                ad.id,
                ad.name,
                ad.status,
                ad.creative_url,
                c.name as campaign_name,
                a.name as adset_name,
                COALESCE(SUM(m.spend), 0) as spend,
                COALESCE(SUM(m.leads), 0) as leads,
                COALESCE(SUM(m.impressions), 0) as impressions,
                COALESCE(SUM(m.reach), 0) as reach,
                COALESCE(SUM(m.clicks), 0) as clicks,
                COALESCE(AVG(m.frequency), 0) as frequency
            FROM ads ad
            JOIN ad_sets a ON ad.adset_id = a.id
            JOIN campaigns c ON ad.campaign_id = c.id
            LEFT JOIN ad_daily_metrics m ON ad.id = m.ad_id
                AND m.date >= ? AND m.date <= ?
            WHERE ad.account_id = ?
        `;

        const params = [dateRange.start, dateRange.end, accountId];

        if (status !== 'all') {
            query += ' AND ad.status = ?';
            params.push(status);
        }

        if (campaignId !== 'all') {
            query += ' AND ad.campaign_id = ?';
            params.push(campaignId);
        }

        if (adSetId !== 'all') {
            query += ' AND ad.adset_id = ?';
            params.push(adSetId);
        }

        if (search) {
            query += ' AND ad.name LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' GROUP BY ad.id ORDER BY spend DESC';

        const ads = db.prepare(query).all(...params);

        // Get revenue and sales from revenue_transactions for each ad
        const revenueQuery = db.prepare(`
            SELECT
                ad_id,
                COALESCE(SUM(amount), 0) as revenue,
                COUNT(*) as sales
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
            GROUP BY ad_id
        `);
        const revenueData = revenueQuery.all(accountId, dateRange.start, dateRange.end);
        const revenueMap = new Map(revenueData.map(r => [r.ad_id, { revenue: r.revenue, sales: r.sales }]));

        const formattedAds = ads.map(ad => {
            const revData = revenueMap.get(ad.id) || { revenue: 0, sales: 0 };
            return {
                id: ad.id,
                name: ad.name,
                campaignName: ad.campaign_name,
                adSetName: ad.adset_name,
                status: ad.status,
                creativeUrl: ad.creative_url,
                spend: `$${ad.spend.toFixed(2)}`,
                revenue: `$${revData.revenue.toFixed(2)}`,
                sales: revData.sales,
                roas: ad.spend > 0 ? (revData.revenue / ad.spend).toFixed(2) : '0.00',
                frequency: ad.frequency.toFixed(1),
                outboundClicks: ad.clicks.toLocaleString(),
                reach: ad.reach.toLocaleString(),
                impressions: ad.impressions.toLocaleString()
            };
        });

        res.json({
            success: true,
            data: formattedAds,
            total: formattedAds.length
        });
    } catch (error) {
        console.error('Get ads error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get ads'
        });
    }
});

// GET /api/dashboard/countries/:accountId
router.get('/countries/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { search = '', timeRange = 'last30days' } = req.query;

        const dateRange = getDateRange(timeRange);

        // Get spend from country_performance
        let spendQuery = `
            SELECT
                country_name,
                country_code,
                SUM(spend) as spend
            FROM country_performance
            WHERE account_id = ? AND date >= ? AND date <= ?
        `;

        const spendParams = [accountId, dateRange.start, dateRange.end];

        if (search) {
            spendQuery += ' AND country_name LIKE ?';
            spendParams.push(`%${search}%`);
        }

        spendQuery += ' GROUP BY country_code ORDER BY spend DESC';

        const countrySpend = db.prepare(spendQuery).all(...spendParams);

        // Get revenue and sales from revenue_transactions by country
        const revenueQuery = db.prepare(`
            SELECT
                country,
                country_code,
                COALESCE(SUM(amount), 0) as revenue,
                COUNT(*) as sales
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
            GROUP BY country_code
        `);
        const revenueData = revenueQuery.all(accountId, dateRange.start, dateRange.end);
        const revenueMap = new Map(revenueData.map(r => [r.country_code, { revenue: r.revenue, sales: r.sales }]));

        const formattedCountries = countrySpend.map(c => {
            const revData = revenueMap.get(c.country_code) || { revenue: 0, sales: 0 };
            return {
                name: c.country_name,
                flag: c.country_code,
                spend: `$${c.spend.toFixed(2)}`,
                revenue: `$${revData.revenue.toFixed(2)}`,
                sales: revData.sales,
                roas: c.spend > 0 ? (revData.revenue / c.spend).toFixed(2) : '0.00'
            };
        });

        res.json({
            success: true,
            data: formattedCountries,
            total: formattedCountries.length
        });
    } catch (error) {
        console.error('Get countries error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get countries'
        });
    }
});

// GET /api/dashboard/sales/:accountId (Sales by Ad Creative)
router.get('/sales/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { search = '', timeRange = 'all' } = req.query;

        let query = `
            SELECT
                r.id,
                r.transaction_id,
                r.customer_email,
                r.product,
                r.country,
                r.country_code,
                r.amount,
                r.created_at,
                ad.name as ad_name,
                ad.creative_url,
                a.name as adset_name,
                c.name as campaign_name
            FROM revenue_transactions r
            LEFT JOIN ads ad ON r.ad_id = ad.id
            LEFT JOIN ad_sets a ON r.adset_id = a.id
            LEFT JOIN campaigns c ON r.campaign_id = c.id
            WHERE r.account_id = ?
        `;

        const params = [accountId];

        if (timeRange !== 'all') {
            const dateRange = getDateRange(timeRange);
            query += ' AND DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?';
            params.push(dateRange.start, dateRange.end);
        }

        if (search) {
            query += ' AND (r.product LIKE ? OR c.name LIKE ? OR a.name LIKE ? OR ad.name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY r.created_at DESC LIMIT 100';

        const sales = db.prepare(query).all(...params);

        const formattedSales = sales.map(s => ({
            id: s.id,
            adName: s.ad_name || 'Direct Sale',
            campaignName: s.campaign_name || 'N/A',
            adSetName: s.adset_name || 'N/A',
            creativeUrl: s.creative_url,
            country: s.country,
            countryCode: s.country_code,
            amount: `$${s.amount.toFixed(2)}`,
            dateTime: s.created_at
        }));

        res.json({
            success: true,
            data: formattedSales,
            total: formattedSales.length
        });
    } catch (error) {
        console.error('Get sales error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sales'
        });
    }
});

// GET /api/dashboard/accounts
router.get('/accounts', (req, res) => {
    try {
        const accounts = db.prepare(`
            SELECT
                a.id,
                a.name,
                a.type,
                a.status,
                a.last_synced,
                a.initial_sync_complete,
                (SELECT COUNT(*) FROM campaigns WHERE account_id = a.id AND status = 'active') as active_campaigns
            FROM ad_accounts a
            WHERE a.user_id = ?
        `).all(req.user.id);

        res.json({
            success: true,
            data: accounts
        });
    } catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get accounts'
        });
    }
});

// Helper functions
function getDateRange(timeRange) {
    const end = new Date();
    const start = new Date();

    switch (timeRange) {
        case 'today':
            break;
        case 'last7days':
            start.setDate(start.getDate() - 7);
            break;
        case 'last30days':
            start.setDate(start.getDate() - 30);
            break;
        case 'last90days':
            start.setDate(start.getDate() - 90);
            break;
        case 'thismonth':
            start.setDate(1);
            break;
        case 'lastmonth':
            start.setMonth(start.getMonth() - 1);
            start.setDate(1);
            end.setDate(0); // Last day of previous month
            break;
        default:
            start.setDate(start.getDate() - 30);
    }

    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
}

function getPreviousDateRange(timeRange) {
    const current = getDateRange(timeRange);
    const startDate = new Date(current.start);
    const endDate = new Date(current.end);
    const diff = endDate - startDate;

    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setTime(prevStart.getTime() - diff);

    return {
        start: prevStart.toISOString().split('T')[0],
        end: prevEnd.toISOString().split('T')[0]
    };
}

function calculateChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return (((current - previous) / previous) * 100).toFixed(1);
}

module.exports = router;
