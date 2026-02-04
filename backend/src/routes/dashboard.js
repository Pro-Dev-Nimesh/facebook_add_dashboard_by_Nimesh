const express = require('express');
const { db } = require('../models/database');
const { authenticateToken, checkAccountAccess } = require('../middleware/auth');

const router = express.Router();

// Format date as YYYY-MM-DD in local timezone (avoids UTC shift with toISOString)
function formatLocalDate(date) {
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/dashboard/metrics/:accountId
router.get('/metrics/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { timeRange = 'last30days' } = req.query;

        // Calculate date range
        const dateRange = getDateRange(timeRange);

        // Get aggregated spend from country_performance (more up-to-date than campaign_daily_metrics)
        const metrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as total_spend
            FROM country_performance
            WHERE account_id = ? AND date >= ? AND date <= ?
        `).get(accountId, dateRange.start, dateRange.end);

        // Get leads from leads table (manual/automation entry, NOT Meta)
        const leadsData = db.prepare(`
            SELECT COALESCE(SUM(count), 0) as total_leads
            FROM leads
            WHERE account_id = ? AND date >= ? AND date <= ?
        `).get(accountId, dateRange.start, dateRange.end);
        const totalLeads = leadsData.total_leads;

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

        // Calculate cost per lead (using leads from leads table)
        const costPerLead = totalLeads > 0
            ? (metrics.total_spend / totalLeads).toFixed(2)
            : '0.00';

        // Get previous period for comparison
        const prevDateRange = getPreviousDateRange(timeRange);
        const prevMetrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as total_spend
            FROM country_performance
            WHERE account_id = ? AND date >= ? AND date <= ?
        `).get(accountId, prevDateRange.start, prevDateRange.end);

        // Get previous period leads from leads table
        const prevLeadsData = db.prepare(`
            SELECT COALESCE(SUM(count), 0) as total_leads
            FROM leads
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
            leads: calculateChange(totalLeads, prevLeadsData.total_leads)
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
                totalLeads: totalLeads,
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
        const today = formatLocalDate(new Date());

        // Get today's spend from country_performance (more up-to-date than campaign_daily_metrics)
        const dailySpendMetrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as spend
            FROM country_performance
            WHERE account_id = ? AND date = ?
        `).get(accountId, today);

        // Get today's leads from leads table (manual/automation)
        const dailyLeads = db.prepare(`
            SELECT COALESCE(SUM(count), 0) as leads
            FROM leads WHERE account_id = ? AND date = ?
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
        const weekStartStr = formatLocalDate(weekStart);

        const weekSpendMetrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as spend
            FROM country_performance
            WHERE account_id = ? AND date >= ?
        `).get(accountId, weekStartStr);

        const weekLeads = db.prepare(`
            SELECT COALESCE(SUM(count), 0) as leads
            FROM leads WHERE account_id = ? AND date >= ?
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
        const monthStartStr = formatLocalDate(monthStart);

        const monthSpendMetrics = db.prepare(`
            SELECT
                COALESCE(SUM(spend), 0) as spend
            FROM country_performance
            WHERE account_id = ? AND date >= ?
        `).get(accountId, monthStartStr);

        const monthLeads = db.prepare(`
            SELECT COALESCE(SUM(count), 0) as leads
            FROM leads WHERE account_id = ? AND date >= ?
        `).get(accountId, monthStartStr);

        // Get this month's revenue from revenue_transactions
        const monthRevenue = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as revenue
            FROM revenue_transactions
            WHERE account_id = ? AND DATE(created_at) >= ?
        `).get(accountId, monthStartStr);

        const formatMetrics = (spendData, revenueData, leadsData) => ({
            spend: spendData.spend.toFixed(2),
            revenue: revenueData.revenue.toFixed(2),
            roas: spendData.spend > 0 ? (revenueData.revenue / spendData.spend).toFixed(2) : '0.00',
            leads: leadsData.leads,
            cpl: leadsData.leads > 0 ? (spendData.spend / leadsData.leads).toFixed(2) : '0.00'
        });

        res.json({
            success: true,
            data: {
                daily: formatMetrics(dailySpendMetrics, dailyRevenue, dailyLeads),
                weekly: formatMetrics(weekSpendMetrics, weekRevenue, weekLeads),
                monthly: formatMetrics(monthSpendMetrics, monthRevenue, monthLeads)
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
                COALESCE(SUM(m.revenue), 0) as revenue,
                COALESCE(SUM(m.sales), 0) as sales,
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

        // Format response - revenue and sales come from Meta (campaign_daily_metrics)
        const formattedCampaigns = campaigns.map(c => ({
            id: c.id,
            name: c.name,
            status: c.status,
            budget: `$${c.budget.toFixed(2)}`,
            spend: `$${c.spend.toFixed(2)}`,
            revenue: `$${c.revenue.toFixed(2)}`,
            sales: c.sales,
            roas: c.spend > 0 ? (c.revenue / c.spend).toFixed(2) : '0.00',
            frequency: c.frequency.toFixed(1),
            outboundClicks: c.clicks.toLocaleString(),
            reach: c.reach.toLocaleString(),
            impressions: c.impressions.toLocaleString()
        }));

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
                COALESCE(SUM(m.revenue), 0) as revenue,
                COALESCE(SUM(m.sales), 0) as sales,
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

        // Format response - revenue and sales come from Meta (adset_daily_metrics)
        const formattedAdSets = adSets.map(a => ({
            id: a.id,
            name: a.name,
            campaignName: a.campaign_name,
            status: a.status,
            budget: `$${a.budget.toFixed(2)}`,
            spend: `$${a.spend.toFixed(2)}`,
            revenue: `$${a.revenue.toFixed(2)}`,
            sales: a.sales,
            roas: a.spend > 0 ? (a.revenue / a.spend).toFixed(2) : '0.00',
            frequency: a.frequency.toFixed(1),
            outboundClicks: a.clicks.toLocaleString(),
            reach: a.reach.toLocaleString(),
            impressions: a.impressions.toLocaleString()
        }));

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
                COALESCE(SUM(m.revenue), 0) as revenue,
                COALESCE(SUM(m.sales), 0) as sales,
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

        // Format response - revenue and sales come from Meta (ad_daily_metrics)
        const formattedAds = ads.map(ad => ({
            id: ad.id,
            name: ad.name,
            campaignName: ad.campaign_name,
            adSetName: ad.adset_name,
            status: ad.status,
            creativeUrl: ad.creative_url,
            spend: `$${ad.spend.toFixed(2)}`,
            revenue: `$${ad.revenue.toFixed(2)}`,
            sales: ad.sales,
            roas: ad.spend > 0 ? (ad.revenue / ad.spend).toFixed(2) : '0.00',
            frequency: ad.frequency.toFixed(1),
            outboundClicks: ad.clicks.toLocaleString(),
            reach: ad.reach.toLocaleString(),
            impressions: ad.impressions.toLocaleString()
        }));

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

// GET /api/dashboard/sales/:accountId (Individual sale records)
// Each sale appears as a separate row. If an ad brings 3 sales on one day, 3 rows appear.
// Shows per-ad period totals (spend, revenue, ROAS) alongside each individual sale amount.
router.get('/sales/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { search = '', timeRange, startDate: qStart, endDate: qEnd } = req.query;

        const dateRange = (qStart && qEnd)
            ? { start: qStart, end: qEnd }
            : getDateRange(timeRange || 'last7days');

        // Step 1: Get daily records where sales > 0 in the date range
        let query = `
            SELECT
                m.date,
                m.spend as day_spend,
                m.revenue as day_revenue,
                m.sales as day_sales,
                ad.id as ad_id,
                ad.name as ad_name,
                ad.creative_url,
                c.name as campaign_name,
                a.name as adset_name
            FROM ad_daily_metrics m
            JOIN ads ad ON m.ad_id = ad.id
            JOIN campaigns c ON ad.campaign_id = c.id
            JOIN ad_sets a ON ad.adset_id = a.id
            WHERE m.account_id = ? AND m.date >= ? AND m.date <= ? AND m.sales > 0
        `;
        const params = [accountId, dateRange.start, dateRange.end];

        if (search) {
            query += ' AND (ad.name LIKE ? OR c.name LIKE ? OR a.name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY m.date DESC, m.revenue DESC';
        const saleRecords = db.prepare(query).all(...params);

        // Step 2: Get per-ad totals for the entire selected period (for ROAS calculation)
        const adTotals = db.prepare(`
            SELECT
                m.ad_id,
                COALESCE(SUM(m.spend), 0) as total_spend,
                COALESCE(SUM(m.revenue), 0) as total_revenue,
                COALESCE(SUM(m.sales), 0) as total_sales
            FROM ad_daily_metrics m
            WHERE m.account_id = ? AND m.date >= ? AND m.date <= ?
            GROUP BY m.ad_id
        `).all(accountId, dateRange.start, dateRange.end);

        const adTotalsMap = {};
        adTotals.forEach(t => { adTotalsMap[t.ad_id] = t; });

        // Step 2b: Get ad-country data for country attribution
        // For each ad+date with sales, find which countries had sales
        const adCountryData = db.prepare(`
            SELECT ad_id, date, country_code, country_name, sales, revenue
            FROM ad_country_daily_metrics
            WHERE account_id = ? AND date >= ? AND date <= ? AND sales > 0
            ORDER BY sales DESC, revenue DESC
        `).all(accountId, dateRange.start, dateRange.end);

        // Build a map: ad_id+date -> [{country_code, country_name, sales, revenue}, ...]
        const adCountryMap = {};
        adCountryData.forEach(row => {
            const key = `${row.ad_id}_${row.date}`;
            if (!adCountryMap[key]) adCountryMap[key] = [];
            adCountryMap[key].push(row);
        });

        // Step 3: Expand into individual sale rows with country attribution
        const expandedSales = [];
        saleRecords.forEach(r => {
            const perSaleAmount = r.day_sales > 0 ? (r.day_revenue / r.day_sales) : 0;
            const adTotal = adTotalsMap[r.ad_id] || { total_spend: 0, total_revenue: 0, total_sales: 0 };
            const roas = adTotal.total_spend > 0 ? (adTotal.total_revenue / adTotal.total_spend) : 0;

            // Get country breakdown for this ad on this date
            const countryKey = `${r.ad_id}_${r.date}`;
            const countries = adCountryMap[countryKey] || [];

            // Distribute sales across countries
            // If country data exists, assign each expanded sale to a country
            let salesLeft = r.day_sales;
            let countryIdx = 0;

            for (let i = 0; i < r.day_sales; i++) {
                let country = null;
                let countryCode = null;

                if (countries.length > 0) {
                    // Assign sales to countries based on their sales count
                    while (countryIdx < countries.length && countries[countryIdx]._assigned >= countries[countryIdx].sales) {
                        countryIdx++;
                    }
                    if (countryIdx < countries.length) {
                        country = countries[countryIdx].country_name;
                        countryCode = countries[countryIdx].country_code;
                        countries[countryIdx]._assigned = (countries[countryIdx]._assigned || 0) + 1;
                    }
                }

                expandedSales.push({
                    date: r.date,
                    campaignName: r.campaign_name,
                    adSetName: r.adset_name,
                    adName: r.ad_name,
                    creativeUrl: r.creative_url,
                    adTotalSpend: adTotal.total_spend,
                    adTotalRevenue: adTotal.total_revenue,
                    roas: parseFloat(roas.toFixed(2)),
                    saleAmount: parseFloat(perSaleAmount.toFixed(2)),
                    country: country,
                    countryCode: countryCode,
                    source: 'meta_pixel'
                });
            }
        });

        // Step 4: Include manual revenue_transactions
        let rtQuery = `
            SELECT
                rt.created_at as date,
                rt.amount as revenue,
                rt.ad_id,
                COALESCE(ad.name, 'Manual Entry') as ad_name,
                ad.creative_url,
                COALESCE(c.name, rt.product) as campaign_name,
                COALESCE(a.name, 'N/A') as adset_name,
                rt.country,
                rt.country_code,
                rt.source as entry_source
            FROM revenue_transactions rt
            LEFT JOIN ads ad ON rt.ad_id = ad.id
            LEFT JOIN campaigns c ON rt.campaign_id = c.id
            LEFT JOIN ad_sets a ON rt.adset_id = a.id
            WHERE rt.account_id = ? AND DATE(rt.created_at) >= ? AND DATE(rt.created_at) <= ?
        `;
        const rtParams = [accountId, dateRange.start, dateRange.end];

        if (search) {
            rtQuery += ' AND (COALESCE(ad.name, rt.product) LIKE ? OR COALESCE(c.name, \'\') LIKE ?)';
            rtParams.push(`%${search}%`, `%${search}%`);
        }

        rtQuery += ' ORDER BY rt.created_at DESC';
        const rtRecords = db.prepare(rtQuery).all(...rtParams);

        rtRecords.forEach(r => {
            // For manual entries with an ad_id, get that ad's period totals
            const adTotal = r.ad_id ? (adTotalsMap[r.ad_id] || { total_spend: 0, total_revenue: 0 }) : { total_spend: 0, total_revenue: 0 };
            const roas = adTotal.total_spend > 0 ? (adTotal.total_revenue / adTotal.total_spend) : 0;

            // Try to derive country_code from country name if missing
            let cc = r.country_code || null;
            if (!cc && r.country) {
                const nameToCode = { 'china': 'cn', 'brazil': 'br', 'india': 'in', 'united states': 'us', 'united kingdom': 'gb', 'germany': 'de', 'france': 'fr', 'japan': 'jp', 'australia': 'au', 'canada': 'ca', 'mexico': 'mx', 'spain': 'es', 'italy': 'it', 'netherlands': 'nl', 'south korea': 'kr', 'russia': 'ru', 'singapore': 'sg', 'israel': 'il', 'taiwan': 'tw', 'thailand': 'th', 'indonesia': 'id', 'vietnam': 'vn', 'philippines': 'ph', 'malaysia': 'my', 'turkey': 'tr', 'poland': 'pl', 'sweden': 'se', 'norway': 'no', 'denmark': 'dk', 'finland': 'fi', 'switzerland': 'ch', 'austria': 'at', 'belgium': 'be', 'portugal': 'pt', 'ireland': 'ie', 'new zealand': 'nz', 'south africa': 'za', 'argentina': 'ar', 'colombia': 'co', 'chile': 'cl', 'peru': 'pe', 'egypt': 'eg', 'saudi arabia': 'sa', 'uae': 'ae', 'united arab emirates': 'ae', 'pakistan': 'pk', 'bangladesh': 'bd', 'nigeria': 'ng', 'kenya': 'ke', 'ukraine': 'ua', 'czech republic': 'cz', 'romania': 'ro', 'hungary': 'hu', 'greece': 'gr' };
                cc = nameToCode[r.country.toLowerCase()] || null;
            }

            expandedSales.push({
                date: r.date,
                campaignName: r.campaign_name,
                adSetName: r.adset_name,
                adName: r.ad_name,
                creativeUrl: r.creative_url,
                adTotalSpend: adTotal.total_spend,
                adTotalRevenue: adTotal.total_revenue,
                roas: parseFloat(roas.toFixed(2)),
                saleAmount: parseFloat(r.revenue || 0),
                country: r.country || null,
                countryCode: cc,
                source: r.entry_source || 'manual'
            });
        });

        // Sort all by date descending (latest first)
        expandedSales.sort((a, b) => b.date.localeCompare(a.date));

        // Summary stats
        const totalSalesCount = expandedSales.length;
        const totalSaleAmount = expandedSales.reduce((sum, s) => sum + (s.saleAmount || 0), 0);
        const uniqueAds = [...new Set(expandedSales.map(s => s.adName))];
        const totalAdSpend = adTotals.reduce((sum, t) => sum + t.total_spend, 0);

        res.json({
            success: true,
            data: expandedSales,
            total: totalSalesCount,
            summary: {
                totalSales: totalSalesCount,
                totalSaleAmount,
                totalAdSpend,
                overallRoas: totalAdSpend > 0 ? parseFloat((totalSaleAmount / totalAdSpend).toFixed(2)) : 0,
                uniqueAdsCount: uniqueAds.length
            }
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
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
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
        start: formatLocalDate(start),
        end: formatLocalDate(end)
    };
}

function getPreviousDateRange(timeRange) {
    const current = getDateRange(timeRange);
    const startDate = new Date(current.start + 'T00:00:00');
    const endDate = new Date(current.end + 'T00:00:00');
    const diff = endDate - startDate;

    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setTime(prevStart.getTime() - diff);

    return {
        start: formatLocalDate(prevStart),
        end: formatLocalDate(prevEnd)
    };
}

function calculateChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return (((current - previous) / previous) * 100).toFixed(1);
}

module.exports = router;
