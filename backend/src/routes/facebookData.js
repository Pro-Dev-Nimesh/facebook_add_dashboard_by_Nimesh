const express = require('express');
const { db } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const FacebookApiService = require('../services/facebookApi');

const router = express.Router();

// Apply authentication
router.use(authenticateToken);

// Mapping of Facebook Account IDs to internal database account IDs and names
const ACCOUNT_MAPPING = {
    'act_883912415611751': { internalId: 1, name: 'Pabbly Connect One Time', type: 'connect' },
    'act_1304022760826324': { internalId: 2, name: 'Pabbly Chatflow', type: 'chatflow' },
    'act_505099201137104': { internalId: 3, name: 'Pabbly Billing One Time', type: 'psb' }
};

// Allowed account IDs - only these 3 accounts will be shown
const ALLOWED_ACCOUNTS = Object.keys(ACCOUNT_MAPPING);

// Helper: Get internal account ID from Facebook account ID
function getInternalAccountId(fbAccountId) {
    return ACCOUNT_MAPPING[fbAccountId]?.internalId || 1;
}

// Helper: Get revenue from revenue_transactions table for a date range
function getRevenueFromDB(internalAccountId, startDate, endDate) {
    try {
        const result = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as revenue, COUNT(*) as sales
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
        `).get(internalAccountId, startDate, endDate);
        return { revenue: result?.revenue || 0, sales: result?.sales || 0 };
    } catch (e) {
        console.error('Error getting revenue from DB:', e);
        return { revenue: 0, sales: 0 };
    }
}

// Helper: Get leads from leads table for a date range
function getLeadsFromDB(internalAccountId, startDate, endDate) {
    try {
        const result = db.prepare(`
            SELECT COALESCE(SUM(count), 0) as leads
            FROM leads
            WHERE account_id = ? AND date >= ? AND date <= ?
        `).get(internalAccountId, startDate, endDate);
        return result?.leads || 0;
    } catch (e) {
        console.error('Error getting leads from DB:', e);
        return 0;
    }
}

// Helper: Get date strings
function getDateStr(daysAgo = 0) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
}

// GET /api/fb/accounts - Fetch ad accounts from Facebook
router.get('/accounts', async (req, res) => {
    try {
        const fbApi = new FacebookApiService();
        const accounts = await fbApi.getAdAccounts();

        // Filter to only allowed accounts
        const filteredAccounts = accounts.filter(acc => ALLOWED_ACCOUNTS.includes(acc.id));

        res.json({
            success: true,
            data: filteredAccounts.map(acc => ({
                id: acc.id,
                account_id: acc.account_id,
                internal_id: ACCOUNT_MAPPING[acc.id]?.internalId || 1,
                name: ACCOUNT_MAPPING[acc.id]?.name || acc.name,
                type: ACCOUNT_MAPPING[acc.id]?.type || 'connect',
                status: acc.account_status === 1 ? 'active' : 'inactive',
                currency: acc.currency,
                timezone: acc.timezone_name,
                amount_spent: acc.amount_spent
            }))
        });
    } catch (error) {
        console.error('Fetch FB accounts error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch Facebook accounts'
        });
    }
});

// GET /api/fb/insights/:adAccountId - Fetch account insights
// Uses: Spend/Impressions/Clicks from Facebook, Revenue from revenue_transactions, Leads from leads table
router.get('/insights/:adAccountId', async (req, res) => {
    try {
        const { adAccountId } = req.params;
        const { startDate, endDate } = req.query;
        const internalAccountId = getInternalAccountId(adAccountId);

        const fbApi = new FacebookApiService();
        const insights = await fbApi.getAccountInsights(adAccountId, startDate, endDate);

        // Get actual date range for querying local DB
        const actualStartDate = startDate || getDateStr(30);
        const actualEndDate = endDate || getDateStr(0);

        // Get revenue from local revenue_transactions
        const revenueData = getRevenueFromDB(internalAccountId, actualStartDate, actualEndDate);

        // Get leads from local leads table
        const leads = getLeadsFromDB(internalAccountId, actualStartDate, actualEndDate);

        if (!insights) {
            return res.json({
                success: true,
                data: {
                    totalSpend: 0,
                    totalRevenue: revenueData.revenue,
                    roas: 0,
                    totalLeads: leads,
                    totalSales: revenueData.sales,
                    costPerLead: 0,
                    impressions: 0,
                    clicks: 0,
                    reach: 0
                }
            });
        }

        const spend = parseFloat(insights.spend || 0);

        res.json({
            success: true,
            data: {
                totalSpend: spend,
                totalRevenue: revenueData.revenue,
                roas: spend > 0 ? (revenueData.revenue / spend).toFixed(2) : 0,
                totalLeads: leads,
                totalSales: revenueData.sales,
                costPerLead: leads > 0 ? (spend / leads).toFixed(2) : 0,
                impressions: parseInt(insights.impressions || 0),
                clicks: parseInt(insights.clicks || 0),
                reach: parseInt(insights.reach || 0),
                cpc: parseFloat(insights.cpc || 0),
                cpm: parseFloat(insights.cpm || 0),
                ctr: parseFloat(insights.ctr || 0),
                frequency: parseFloat(insights.frequency || 0)
            }
        });
    } catch (error) {
        console.error('Fetch FB insights error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch Facebook insights'
        });
    }
});

// GET /api/fb/campaigns/:adAccountId - Fetch campaigns from LOCAL DATABASE (synced data)
router.get('/campaigns/:adAccountId', async (req, res) => {
    try {
        const { adAccountId } = req.params;
        const { status } = req.query;
        const internalAccountId = getInternalAccountId(adAccountId);

        // Query campaigns from local database
        let query = `
            SELECT
                c.id,
                c.facebook_campaign_id,
                c.name,
                c.status,
                c.budget,
                COALESCE(SUM(m.spend), 0) as spend,
                COALESCE(SUM(m.impressions), 0) as impressions,
                COALESCE(SUM(m.reach), 0) as reach,
                COALESCE(SUM(m.clicks), 0) as clicks,
                COALESCE(AVG(m.frequency), 0) as frequency
            FROM campaigns c
            LEFT JOIN campaign_daily_metrics m ON c.id = m.campaign_id
            WHERE c.account_id = ?
        `;

        const params = [internalAccountId];

        if (status && status !== 'all') {
            query += ' AND c.status = ?';
            params.push(status.toLowerCase());
        }

        query += ' GROUP BY c.id ORDER BY spend DESC';

        const campaigns = db.prepare(query).all(...params);

        const formattedCampaigns = campaigns.map(c => ({
            id: c.facebook_campaign_id || c.id,
            name: c.name,
            status: c.status?.toUpperCase() || 'ACTIVE',
            budget: c.budget || 0,
            spend: c.spend || 0,
            sales: 0,
            revenue: 0,
            roas: '0.00',
            impressions: c.impressions || 0,
            clicks: c.clicks || 0,
            reach: c.reach || 0,
            frequency: parseFloat(c.frequency || 0).toFixed(1),
            outboundClicks: c.clicks || 0,
            cpc: c.clicks > 0 ? (c.spend / c.clicks).toFixed(2) : 0,
            ctr: c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : 0
        }));

        res.json({
            success: true,
            data: formattedCampaigns
        });
    } catch (error) {
        console.error('Fetch campaigns error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch campaigns'
        });
    }
});

// GET /api/fb/adsets/:adAccountId - Fetch ad sets from LOCAL DATABASE (synced data)
router.get('/adsets/:adAccountId', async (req, res) => {
    try {
        const { adAccountId } = req.params;
        const { status, campaignId } = req.query;
        const internalAccountId = getInternalAccountId(adAccountId);

        // Query ad sets from local database
        let query = `
            SELECT
                a.id,
                a.facebook_adset_id,
                a.name,
                a.status,
                a.budget,
                c.name as campaign_name,
                c.facebook_campaign_id,
                COALESCE(SUM(m.spend), 0) as spend,
                COALESCE(SUM(m.impressions), 0) as impressions,
                COALESCE(SUM(m.reach), 0) as reach,
                COALESCE(SUM(m.clicks), 0) as clicks,
                COALESCE(AVG(m.frequency), 0) as frequency
            FROM ad_sets a
            LEFT JOIN campaigns c ON a.campaign_id = c.id
            LEFT JOIN adset_daily_metrics m ON a.id = m.adset_id
            WHERE a.account_id = ?
        `;

        const params = [internalAccountId];

        if (status && status !== 'all') {
            query += ' AND a.status = ?';
            params.push(status.toLowerCase());
        }

        if (campaignId && campaignId !== 'all') {
            query += ' AND c.facebook_campaign_id = ?';
            params.push(campaignId);
        }

        query += ' GROUP BY a.id ORDER BY spend DESC';

        const adsets = db.prepare(query).all(...params);

        const formattedAdsets = adsets.map(a => ({
            id: a.facebook_adset_id || a.id,
            name: a.name,
            status: a.status?.toUpperCase() || 'ACTIVE',
            campaign_id: a.facebook_campaign_id,
            campaign_name: a.campaign_name || 'Unknown',
            budget: a.budget || 0,
            spend: a.spend || 0,
            sales: 0,
            revenue: 0,
            roas: '0.00',
            impressions: a.impressions || 0,
            clicks: a.clicks || 0,
            reach: a.reach || 0,
            frequency: parseFloat(a.frequency || 0).toFixed(1),
            outboundClicks: a.clicks || 0,
            cpc: a.clicks > 0 ? (a.spend / a.clicks).toFixed(2) : 0,
            ctr: a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) : 0
        }));

        res.json({
            success: true,
            data: formattedAdsets
        });
    } catch (error) {
        console.error('Fetch adsets error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch ad sets'
        });
    }
});

// GET /api/fb/ads/:adAccountId - Fetch ads from LOCAL DATABASE (synced data)
router.get('/ads/:adAccountId', async (req, res) => {
    try {
        const { adAccountId } = req.params;
        const { status, campaignId, adsetId } = req.query;
        const internalAccountId = getInternalAccountId(adAccountId);

        // Query ads from local database
        let query = `
            SELECT
                ad.id,
                ad.facebook_ad_id,
                ad.name,
                ad.status,
                c.name as campaign_name,
                c.facebook_campaign_id,
                a.name as adset_name,
                a.facebook_adset_id,
                COALESCE(SUM(m.spend), 0) as spend,
                COALESCE(SUM(m.impressions), 0) as impressions,
                COALESCE(SUM(m.reach), 0) as reach,
                COALESCE(SUM(m.clicks), 0) as clicks,
                COALESCE(AVG(m.frequency), 0) as frequency
            FROM ads ad
            LEFT JOIN campaigns c ON ad.campaign_id = c.id
            LEFT JOIN ad_sets a ON ad.adset_id = a.id
            LEFT JOIN ad_daily_metrics m ON ad.id = m.ad_id
            WHERE ad.account_id = ?
        `;

        const params = [internalAccountId];

        if (status && status !== 'all') {
            query += ' AND ad.status = ?';
            params.push(status.toLowerCase());
        }

        if (campaignId && campaignId !== 'all') {
            query += ' AND c.facebook_campaign_id = ?';
            params.push(campaignId);
        }

        if (adsetId && adsetId !== 'all') {
            query += ' AND a.facebook_adset_id = ?';
            params.push(adsetId);
        }

        query += ' GROUP BY ad.id ORDER BY spend DESC';

        const ads = db.prepare(query).all(...params);

        const formattedAds = ads.map(ad => ({
            id: ad.facebook_ad_id || ad.id,
            name: ad.name,
            status: ad.status?.toUpperCase() || 'ACTIVE',
            campaign_id: ad.facebook_campaign_id,
            campaign_name: ad.campaign_name || 'Unknown',
            adset_id: ad.facebook_adset_id,
            adset_name: ad.adset_name || 'Unknown',
            spend: ad.spend || 0,
            sales: 0,
            revenue: 0,
            roas: '0.00',
            impressions: ad.impressions || 0,
            clicks: ad.clicks || 0,
            reach: ad.reach || 0,
            frequency: parseFloat(ad.frequency || 0).toFixed(1),
            outboundClicks: ad.clicks || 0,
            cpc: ad.clicks > 0 ? (ad.spend / ad.clicks).toFixed(2) : 0,
            ctr: ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : 0
        }));

        res.json({
            success: true,
            data: formattedAds
        });
    } catch (error) {
        console.error('Fetch ads error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch ads'
        });
    }
});

// GET /api/fb/countries/:adAccountId - Fetch country data from LOCAL DATABASE (synced data)
router.get('/countries/:adAccountId', async (req, res) => {
    try {
        const { adAccountId } = req.params;
        const internalAccountId = getInternalAccountId(adAccountId);

        const countryNames = {
            'us': 'United States', 'gb': 'United Kingdom', 'in': 'India',
            'de': 'Germany', 'ca': 'Canada', 'au': 'Australia', 'br': 'Brazil',
            'fr': 'France', 'mx': 'Mexico', 'es': 'Spain', 'it': 'Italy',
            'jp': 'Japan', 'nl': 'Netherlands', 'ph': 'Philippines', 'id': 'Indonesia'
        };

        // Query country data from local database
        const countryData = db.prepare(`
            SELECT
                country_name,
                country_code,
                COALESCE(SUM(spend), 0) as spend,
                COALESCE(SUM(revenue), 0) as revenue,
                COALESCE(SUM(sales), 0) as sales
            FROM country_performance
            WHERE account_id = ?
            GROUP BY country_code
            ORDER BY spend DESC
            LIMIT 10
        `).all(internalAccountId);

        const formattedCountries = countryData.map(c => ({
            country_code: c.country_code,
            country: c.country_name || countryNames[c.country_code] || c.country_code?.toUpperCase(),
            flag: c.country_code,
            spend: c.spend || 0,
            sales: c.sales || 0,
            revenue: c.revenue || 0,
            roas: c.spend > 0 && c.revenue > 0 ? (c.revenue / c.spend).toFixed(2) : '0.00'
        }));

        res.json({
            success: true,
            data: formattedCountries
        });
    } catch (error) {
        console.error('Fetch countries error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch country data'
        });
    }
});

// POST /api/fb/sync-accounts - Sync Facebook accounts to database
router.post('/sync-accounts', async (req, res) => {
    try {
        const fbApi = new FacebookApiService();
        const accounts = await fbApi.getAdAccounts();

        // Insert/update accounts in database
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO ad_accounts
            (facebook_account_id, name, type, status, access_token, user_id)
            VALUES (?, ?, 'facebook', ?, ?, ?)
        `);

        const insertedAccounts = [];
        for (const acc of accounts) {
            stmt.run(
                acc.id,
                acc.name,
                acc.account_status === 1 ? 'active' : 'inactive',
                process.env.FACEBOOK_ACCESS_TOKEN,
                req.user.id
            );
            insertedAccounts.push({
                facebook_account_id: acc.id,
                name: acc.name,
                status: acc.account_status === 1 ? 'active' : 'inactive'
            });
        }

        res.json({
            success: true,
            message: `Synced ${insertedAccounts.length} accounts`,
            data: insertedAccounts
        });
    } catch (error) {
        console.error('Sync accounts error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to sync accounts'
        });
    }
});

// GET /api/fb/time-metrics/:adAccountId - Get metrics for Today, This Week, This Month
// Uses: Spend from Facebook API, Revenue from revenue_transactions, Leads from leads table
router.get('/time-metrics/:adAccountId', async (req, res) => {
    try {
        const { adAccountId } = req.params;
        const internalAccountId = getInternalAccountId(adAccountId);
        const fbApi = new FacebookApiService();

        // Calculate date ranges
        const todayStr = getDateStr(0);
        const weekAgoStr = getDateStr(7);
        const monthAgoStr = getDateStr(30);

        // Fetch spend from Facebook for all three periods in parallel
        const [todayInsights, weekInsights, monthInsights] = await Promise.all([
            fbApi.getAccountInsights(adAccountId, todayStr, todayStr),
            fbApi.getAccountInsights(adAccountId, weekAgoStr, todayStr),
            fbApi.getAccountInsights(adAccountId, monthAgoStr, todayStr)
        ]);

        // Get revenue and leads from local database
        const todayRevenue = getRevenueFromDB(internalAccountId, todayStr, todayStr);
        const weekRevenue = getRevenueFromDB(internalAccountId, weekAgoStr, todayStr);
        const monthRevenue = getRevenueFromDB(internalAccountId, monthAgoStr, todayStr);

        const todayLeads = getLeadsFromDB(internalAccountId, todayStr, todayStr);
        const weekLeads = getLeadsFromDB(internalAccountId, weekAgoStr, todayStr);
        const monthLeads = getLeadsFromDB(internalAccountId, monthAgoStr, todayStr);

        const formatMetrics = (fbInsights, revenueData, leads) => {
            const spend = fbInsights ? parseFloat(fbInsights.spend || 0) : 0;
            const revenue = revenueData.revenue;
            return {
                spend: spend,
                revenue: revenue,
                roas: spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0,
                leads: leads,
                cpl: leads > 0 ? parseFloat((spend / leads).toFixed(2)) : 0
            };
        };

        res.json({
            success: true,
            data: {
                today: formatMetrics(todayInsights, todayRevenue, todayLeads),
                thisWeek: formatMetrics(weekInsights, weekRevenue, weekLeads),
                thisMonth: formatMetrics(monthInsights, monthRevenue, monthLeads)
            }
        });
    } catch (error) {
        console.error('Fetch time metrics error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch time metrics'
        });
    }
});

// GET /api/fb/sales/:adAccountId - Get recent sales from Data Management (revenue_transactions)
router.get('/sales/:adAccountId', async (req, res) => {
    try {
        const { adAccountId } = req.params;
        const { startDate, endDate, timePeriod } = req.query;
        const internalAccountId = getInternalAccountId(adAccountId);

        // Determine date range based on timePeriod
        let actualStartDate, actualEndDate;
        const todayStr = getDateStr(0);

        switch (timePeriod) {
            case 'today':
                actualStartDate = todayStr;
                actualEndDate = todayStr;
                break;
            case 'thisWeek':
                actualStartDate = getDateStr(7);
                actualEndDate = todayStr;
                break;
            case 'thisMonth':
                actualStartDate = getDateStr(30);
                actualEndDate = todayStr;
                break;
            default: // 'all' or undefined
                actualStartDate = startDate || getDateStr(365);
                actualEndDate = endDate || todayStr;
        }

        // Get sales from local revenue_transactions table
        const salesData = db.prepare(`
            SELECT
                r.id,
                r.transaction_id,
                r.customer_email,
                r.product,
                r.country,
                r.country_code,
                r.amount,
                r.created_at,
                r.notes
            FROM revenue_transactions r
            WHERE r.account_id = ? AND DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?
            ORDER BY r.created_at DESC
            LIMIT 50
        `).all(internalAccountId, actualStartDate, actualEndDate);

        const formattedSales = salesData.map(s => ({
            id: s.id,
            time: s.created_at,
            campaign: 'N/A', // Will be populated when you link sales to campaigns
            adSet: 'N/A',
            adName: s.product || 'Direct Sale',
            country: s.country || 'Unknown',
            countryCode: s.country_code,
            amount: s.amount.toFixed(2),
            transactionId: s.transaction_id,
            email: s.customer_email
        }));

        res.json({
            success: true,
            data: formattedSales
        });
    } catch (error) {
        console.error('Fetch sales error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch sales data'
        });
    }
});

module.exports = router;
