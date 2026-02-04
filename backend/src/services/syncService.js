const { db } = require('../models/database');
const FacebookApiService = require('./facebookApi');

// Format date as YYYY-MM-DD in local timezone (avoids UTC shift with toISOString)
function formatLocalDate(date) {
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

// Use Node.js built-in Intl API to resolve ANY country code to full name
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function getCountryName(code) {
    if (!code) return 'Unknown';
    try {
        return regionNames.of(code.toUpperCase()) || code.toUpperCase();
    } catch (e) {
        return code.toUpperCase();
    }
}

// Account mapping
const ACCOUNT_MAPPING = {
    'act_883912415611751': { internalId: 1, name: 'Pabbly Connect One Time', type: 'connect' },
    'act_1304022760826324': { internalId: 2, name: 'Pabbly Chatflow', type: 'chatflow' },
    'act_505099201137104': { internalId: 3, name: 'Pabbly Billing One Time', type: 'psb' }
};

class SyncService {
    constructor() {
        this.fbApi = new FacebookApiService();
    }

    // Get internal account ID from Facebook account ID
    getInternalAccountId(fbAccountId) {
        return ACCOUNT_MAPPING[fbAccountId]?.internalId || 1;
    }

    // Sync campaigns for an account
    async syncCampaigns(fbAccountId) {
        const internalAccountId = this.getInternalAccountId(fbAccountId);
        console.log(`[SYNC] Syncing campaigns for account ${fbAccountId} (internal: ${internalAccountId})`);

        try {
            const campaigns = await this.fbApi.getCampaigns(fbAccountId);
            console.log(`[SYNC] Found ${campaigns.length} campaigns`);

            // Prepare statements for INSERT/UPDATE pattern
            const findCampaign = db.prepare('SELECT id FROM campaigns WHERE facebook_campaign_id = ?');
            const insertCampaign = db.prepare(`
                INSERT INTO campaigns (account_id, facebook_campaign_id, name, status, budget)
                VALUES (?, ?, ?, ?, ?)
            `);
            const updateCampaign = db.prepare(`
                UPDATE campaigns SET name = ?, status = ?, budget = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            const findMetric = db.prepare('SELECT id FROM campaign_daily_metrics WHERE campaign_id = ? AND date = ?');
            const insertMetric = db.prepare(`
                INSERT INTO campaign_daily_metrics
                (account_id, campaign_id, date, spend, revenue, sales, leads, impressions, reach, clicks, frequency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const updateMetric = db.prepare(`
                UPDATE campaign_daily_metrics SET spend = ?, revenue = ?, sales = ?, leads = ?, impressions = ?, reach = ?, clicks = ?, frequency = ?
                WHERE campaign_id = ? AND date = ?
            `);

            let syncedCount = 0;

            for (const campaign of campaigns) {
                // insights is now an array of daily records (from time_increment: 1)
                const dailyInsights = Array.isArray(campaign.insights) ? campaign.insights : (campaign.insights ? [campaign.insights] : []);
                const status = campaign.status?.toLowerCase() === 'active' ? 'active' : 'paused';
                const budget = parseFloat(campaign.daily_budget || campaign.lifetime_budget || 0) / 100;

                // Check if campaign exists
                let dbCampaign = findCampaign.get(campaign.id);

                if (dbCampaign) {
                    updateCampaign.run(campaign.name, status, budget, dbCampaign.id);
                } else {
                    const result = insertCampaign.run(
                        internalAccountId,
                        campaign.id,
                        campaign.name,
                        status,
                        budget
                    );
                    dbCampaign = { id: result.lastInsertRowid };
                }

                // Store metrics for each day
                for (const insights of dailyInsights) {
                    const date = insights.date_start || formatLocalDate(new Date());
                    const metaRevenue = this.fbApi.getPurchaseValue(insights.action_values);
                    const metaSales = this.fbApi.getPurchases(insights.actions);
                    const metaLeads = this.fbApi.getLeads(insights.actions);

                    const existingMetric = findMetric.get(dbCampaign.id, date);
                    if (existingMetric) {
                        updateMetric.run(
                            parseFloat(insights.spend || 0),
                            metaRevenue,
                            metaSales,
                            metaLeads,
                            parseInt(insights.impressions || 0),
                            parseInt(insights.reach || 0),
                            parseInt(insights.clicks || 0),
                            parseFloat(insights.frequency || 0),
                            dbCampaign.id,
                            date
                        );
                    } else {
                        insertMetric.run(
                            internalAccountId,
                            dbCampaign.id,
                            date,
                            parseFloat(insights.spend || 0),
                            metaRevenue,
                            metaSales,
                            metaLeads,
                            parseInt(insights.impressions || 0),
                            parseInt(insights.reach || 0),
                            parseInt(insights.clicks || 0),
                            parseFloat(insights.frequency || 0)
                        );
                    }
                }
                syncedCount++;
            }

            console.log(`[SYNC] Synced ${syncedCount} campaigns`);
            return { success: true, count: syncedCount };
        } catch (error) {
            console.error('[SYNC] Campaign sync error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Sync ad sets for an account
    async syncAdSets(fbAccountId) {
        const internalAccountId = this.getInternalAccountId(fbAccountId);
        console.log(`[SYNC] Syncing ad sets for account ${fbAccountId}`);

        try {
            const adsets = await this.fbApi.getAdSets(fbAccountId);
            console.log(`[SYNC] Found ${adsets.length} ad sets`);

            // Prepare statements for INSERT/UPDATE pattern
            const findCampaign = db.prepare('SELECT id FROM campaigns WHERE facebook_campaign_id = ?');
            const findAdSet = db.prepare('SELECT id FROM ad_sets WHERE facebook_adset_id = ?');
            const insertAdSet = db.prepare(`
                INSERT INTO ad_sets (account_id, campaign_id, facebook_adset_id, name, status, budget)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const updateAdSet = db.prepare(`
                UPDATE ad_sets SET name = ?, status = ?, budget = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            const findMetric = db.prepare('SELECT id FROM adset_daily_metrics WHERE adset_id = ? AND date = ?');
            const insertMetric = db.prepare(`
                INSERT INTO adset_daily_metrics
                (account_id, adset_id, date, spend, revenue, sales, leads, impressions, reach, clicks, frequency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const updateMetric = db.prepare(`
                UPDATE adset_daily_metrics SET spend = ?, revenue = ?, sales = ?, leads = ?, impressions = ?, reach = ?, clicks = ?, frequency = ?
                WHERE adset_id = ? AND date = ?
            `);

            let syncedCount = 0;

            for (const adset of adsets) {
                // insights is now an array of daily records (from time_increment: 1)
                const dailyInsights = Array.isArray(adset.insights) ? adset.insights : (adset.insights ? [adset.insights] : []);
                const status = adset.status?.toLowerCase() === 'active' ? 'active' : 'paused';
                const budget = parseFloat(adset.daily_budget || adset.lifetime_budget || 0) / 100;

                // Get campaign internal ID
                const dbCampaign = findCampaign.get(adset.campaign_id);
                if (!dbCampaign) {
                    console.log(`[SYNC] Campaign not found for adset ${adset.id}, skipping`);
                    continue;
                }

                // Check if adset exists
                let dbAdSet = findAdSet.get(adset.id);

                if (dbAdSet) {
                    updateAdSet.run(adset.name, status, budget, dbAdSet.id);
                } else {
                    const result = insertAdSet.run(
                        internalAccountId,
                        dbCampaign.id,
                        adset.id,
                        adset.name,
                        status,
                        budget
                    );
                    dbAdSet = { id: result.lastInsertRowid };
                }

                // Store metrics for each day
                for (const insights of dailyInsights) {
                    const date = insights.date_start || formatLocalDate(new Date());
                    const metaRevenue = this.fbApi.getPurchaseValue(insights.action_values);
                    const metaSales = this.fbApi.getPurchases(insights.actions);
                    const metaLeads = this.fbApi.getLeads(insights.actions);

                    const existingMetric = findMetric.get(dbAdSet.id, date);
                    if (existingMetric) {
                        updateMetric.run(
                            parseFloat(insights.spend || 0),
                            metaRevenue,
                            metaSales,
                            metaLeads,
                            parseInt(insights.impressions || 0),
                            parseInt(insights.reach || 0),
                            parseInt(insights.clicks || 0),
                            parseFloat(insights.frequency || 0),
                            dbAdSet.id,
                            date
                        );
                    } else {
                        insertMetric.run(
                            internalAccountId,
                            dbAdSet.id,
                            date,
                            parseFloat(insights.spend || 0),
                            metaRevenue,
                            metaSales,
                            metaLeads,
                            parseInt(insights.impressions || 0),
                            parseInt(insights.reach || 0),
                            parseInt(insights.clicks || 0),
                            parseFloat(insights.frequency || 0)
                        );
                    }
                }
                syncedCount++;
            }

            console.log(`[SYNC] Synced ${syncedCount} ad sets`);
            return { success: true, count: syncedCount };
        } catch (error) {
            console.error('[SYNC] AdSet sync error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Sync ads for an account
    async syncAds(fbAccountId) {
        const internalAccountId = this.getInternalAccountId(fbAccountId);
        console.log(`[SYNC] Syncing ads for account ${fbAccountId}`);

        try {
            const ads = await this.fbApi.getAds(fbAccountId);
            console.log(`[SYNC] Found ${ads.length} ads`);

            // Prepare statements for INSERT/UPDATE pattern
            const findCampaign = db.prepare('SELECT id FROM campaigns WHERE facebook_campaign_id = ?');
            const findAdSet = db.prepare('SELECT id FROM ad_sets WHERE facebook_adset_id = ?');
            const findAd = db.prepare('SELECT id FROM ads WHERE facebook_ad_id = ?');
            const insertAd = db.prepare(`
                INSERT INTO ads (account_id, campaign_id, adset_id, facebook_ad_id, name, status, creative_url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const updateAd = db.prepare(`
                UPDATE ads SET name = ?, status = ?, creative_url = COALESCE(?, creative_url), updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            const findMetric = db.prepare('SELECT id FROM ad_daily_metrics WHERE ad_id = ? AND date = ?');
            const insertMetric = db.prepare(`
                INSERT INTO ad_daily_metrics
                (account_id, ad_id, date, spend, revenue, sales, leads, impressions, reach, clicks, frequency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const updateMetric = db.prepare(`
                UPDATE ad_daily_metrics SET spend = ?, revenue = ?, sales = ?, leads = ?, impressions = ?, reach = ?, clicks = ?, frequency = ?
                WHERE ad_id = ? AND date = ?
            `);

            let syncedCount = 0;

            for (const ad of ads) {
                // insights is now an array of daily records (from time_increment: 1)
                const dailyInsights = Array.isArray(ad.insights) ? ad.insights : (ad.insights ? [ad.insights] : []);
                const status = ad.status?.toLowerCase() === 'active' ? 'active' : 'paused';

                // Get campaign and adset internal IDs
                const dbCampaign = findCampaign.get(ad.campaign_id);
                const dbAdSet = findAdSet.get(ad.adset_id);

                if (!dbCampaign || !dbAdSet) {
                    console.log(`[SYNC] Campaign or AdSet not found for ad ${ad.id}, skipping`);
                    continue;
                }

                // Fetch creative URL from Facebook
                let creativeUrl = null;
                const creativeId = ad.creative?.id;
                if (creativeId) {
                    try {
                        creativeUrl = await this.fbApi.getAdCreativeUrl(creativeId);
                    } catch (e) {
                        console.log(`[SYNC] Could not fetch creative URL for ad ${ad.id}:`, e.message);
                    }
                }

                // Check if ad exists
                let dbAd = findAd.get(ad.id);

                if (dbAd) {
                    updateAd.run(ad.name, status, creativeUrl, dbAd.id);
                } else {
                    const result = insertAd.run(
                        internalAccountId,
                        dbCampaign.id,
                        dbAdSet.id,
                        ad.id,
                        ad.name,
                        status,
                        creativeUrl
                    );
                    dbAd = { id: result.lastInsertRowid };
                }

                // Store metrics for each day
                for (const insights of dailyInsights) {
                    const date = insights.date_start || formatLocalDate(new Date());
                    const metaRevenue = this.fbApi.getPurchaseValue(insights.action_values);
                    const metaSales = this.fbApi.getPurchases(insights.actions);
                    const metaLeads = this.fbApi.getLeads(insights.actions);

                    const existingMetric = findMetric.get(dbAd.id, date);
                    if (existingMetric) {
                        updateMetric.run(
                            parseFloat(insights.spend || 0),
                            metaRevenue,
                            metaSales,
                            metaLeads,
                            parseInt(insights.impressions || 0),
                            parseInt(insights.reach || 0),
                            parseInt(insights.clicks || 0),
                            parseFloat(insights.frequency || 0),
                            dbAd.id,
                            date
                        );
                    } else {
                        insertMetric.run(
                            internalAccountId,
                            dbAd.id,
                            date,
                            parseFloat(insights.spend || 0),
                            metaRevenue,
                            metaSales,
                            metaLeads,
                            parseInt(insights.impressions || 0),
                            parseInt(insights.reach || 0),
                            parseInt(insights.clicks || 0),
                            parseFloat(insights.frequency || 0)
                        );
                    }
                }
                syncedCount++;
            }

            console.log(`[SYNC] Synced ${syncedCount} ads`);
            return { success: true, count: syncedCount };
        } catch (error) {
            console.error('[SYNC] Ads sync error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Sync country data for an account (daily breakdown)
    async syncCountries(fbAccountId) {
        const internalAccountId = this.getInternalAccountId(fbAccountId);
        console.log(`[SYNC] Syncing country data for account ${fbAccountId}`);

        try {
            const countryData = await this.fbApi.getCountryInsights(fbAccountId);
            console.log(`[SYNC] Found ${countryData.length} country-day records`);

            // Prepare statements for INSERT/UPDATE pattern
            const findCountry = db.prepare('SELECT id FROM country_performance WHERE account_id = ? AND country_code = ? AND date = ?');
            const insertCountry = db.prepare(`
                INSERT INTO country_performance (account_id, country_name, country_code, date, spend, revenue, sales)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const updateCountry = db.prepare(`
                UPDATE country_performance SET spend = ? WHERE id = ?
            `);

            let syncedCount = 0;

            for (const country of countryData) {
                const countryCode = country.country?.toLowerCase() || 'unknown';
                const countryName = getCountryName(country.country);
                // Use date_start from daily breakdown (Facebook returns YYYY-MM-DD)
                const date = country.date_start || formatLocalDate(new Date());

                const existingCountry = findCountry.get(internalAccountId, countryCode, date);
                if (existingCountry) {
                    updateCountry.run(parseFloat(country.spend || 0), existingCountry.id);
                } else {
                    insertCountry.run(
                        internalAccountId,
                        countryName,
                        countryCode,
                        date,
                        parseFloat(country.spend || 0),
                        0, // Revenue from local data (revenue_transactions)
                        0  // Sales from local data (revenue_transactions)
                    );
                }
                syncedCount++;
            }

            console.log(`[SYNC] Synced ${syncedCount} country-day records`);
            return { success: true, count: syncedCount };
        } catch (error) {
            console.error('[SYNC] Country sync error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Sync ad-level country metrics (which countries each ad's sales came from)
    async syncAdCountryMetrics(fbAccountId) {
        const internalAccountId = this.getInternalAccountId(fbAccountId);
        console.log(`[SYNC] Syncing ad country metrics for account ${fbAccountId}`);

        try {
            // Build a map of facebook_ad_id -> internal ad id
            const adMap = {};
            const reverseAdMap = {};
            const allAds = db.prepare('SELECT id, facebook_ad_id FROM ads WHERE account_id = ?').all(internalAccountId);
            allAds.forEach(a => {
                if (a.facebook_ad_id) {
                    adMap[a.facebook_ad_id] = a.id;
                    reverseAdMap[a.id] = a.facebook_ad_id;
                }
            });

            const upsert = db.prepare(`
                INSERT INTO ad_country_daily_metrics (account_id, ad_id, country_code, country_name, date, spend, revenue, sales)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ad_id, country_code, date) DO UPDATE SET
                    spend = excluded.spend,
                    revenue = excluded.revenue,
                    sales = excluded.sales
            `);

            let syncedCount = 0;

            // Method 1: Bulk query (account-level with level=ad, breakdowns=country)
            const adCountryData = await this.fbApi.getAdCountryInsights(fbAccountId);
            console.log(`[SYNC] Bulk query returned ${adCountryData.length} ad-country-day records`);

            for (const row of adCountryData) {
                const fbAdId = row.ad_id;
                const internalAdId = adMap[fbAdId];
                if (!internalAdId) continue;

                const countryCode = (row.country || 'unknown').toLowerCase();
                const countryName = getCountryName(row.country);
                const date = row.date_start || formatLocalDate(new Date());
                const spend = parseFloat(row.spend || 0);
                const sales = this.fbApi.getPurchases(row.actions);
                const revenue = this.fbApi.getPurchaseValue(row.action_values);

                if (spend > 0 || sales > 0) {
                    upsert.run(internalAccountId, internalAdId, countryCode, countryName, date, spend, revenue, sales);
                    syncedCount++;
                }
            }

            // Method 2: If bulk returned 0, fallback to per-ad queries for ads with sales
            if (adCountryData.length === 0) {
                console.log(`[SYNC] Bulk query empty, falling back to per-ad country queries`);
                const adsWithSales = db.prepare(`
                    SELECT DISTINCT ad_id FROM ad_daily_metrics
                    WHERE account_id = ? AND sales > 0
                `).all(internalAccountId);

                console.log(`[SYNC] Found ${adsWithSales.length} ads with sales to query individually`);

                for (const adRow of adsWithSales) {
                    const fbAdId = reverseAdMap[adRow.ad_id];
                    if (!fbAdId) continue;

                    try {
                        const perAdData = await this.fbApi.getSingleAdCountryInsights(fbAdId);

                        for (const row of perAdData) {
                            const countryCode = (row.country || 'unknown').toLowerCase();
                            const countryName = getCountryName(row.country);
                            const date = row.date_start || formatLocalDate(new Date());
                            const spend = parseFloat(row.spend || 0);
                            const sales = this.fbApi.getPurchases(row.actions);
                            const revenue = this.fbApi.getPurchaseValue(row.action_values);

                            if (spend > 0 || sales > 0) {
                                upsert.run(internalAccountId, adRow.ad_id, countryCode, countryName, date, spend, revenue, sales);
                                syncedCount++;
                            }
                        }

                        // Small delay between per-ad API calls
                        await this.delay(500);
                    } catch (e) {
                        console.error(`[SYNC] Per-ad country query failed for ${fbAdId}:`, e.message);
                    }
                }
            }

            console.log(`[SYNC] Synced ${syncedCount} ad-country-day records`);
            return { success: true, count: syncedCount };
        } catch (error) {
            console.error('[SYNC] Ad country sync error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Refresh creative URLs for all ads in an account
    async refreshCreativeUrls(fbAccountId) {
        const internalAccountId = this.getInternalAccountId(fbAccountId);
        console.log(`[SYNC] Refreshing creative URLs for account ${fbAccountId}`);

        try {
            // Get ads that need creative URLs (missing or small thumbnails)
            const ads = db.prepare(
                "SELECT id, facebook_ad_id FROM ads WHERE account_id = ? AND (creative_url IS NULL OR creative_url = '' OR creative_url LIKE '%p64x64%')"
            ).all(internalAccountId);
            console.log(`[SYNC] Found ${ads.length} ads needing creative URL update`);

            if (ads.length === 0) return { success: true, count: 0 };

            // Fetch ads from Facebook with creative info AND effective image URL (from Ad node)
            // Use effective_status to include paused/archived ads too
            let allFbAds = [];
            try {
                const fbAds = await this.fbApi.request(`/${fbAccountId}/ads`, {
                    fields: 'id,creative{id,image_url,thumbnail_url,object_story_spec}',
                    'effective_status': '["ACTIVE","PAUSED","ARCHIVED","CAMPAIGN_PAUSED","ADSET_PAUSED"]',
                    limit: 500
                });
                allFbAds = fbAds.data || [];

                // Handle pagination
                let nextPage = fbAds.paging?.next;
                while (nextPage) {
                    try {
                        const response = await require('axios').get(nextPage);
                        if (response.data?.data?.length > 0) {
                            allFbAds = allFbAds.concat(response.data.data);
                            nextPage = response.data.paging?.next;
                        } else break;
                    } catch (e) { break; }
                }
            } catch (e) {
                console.error('[SYNC] Failed to fetch ads from FB:', e.message);
            }

            console.log(`[SYNC] Facebook returned ${allFbAds.length} ads`);

            // Build map: fb_ad_id -> best image URL from creative sub-fields
            const fbAdsImageMap = {};
            allFbAds.forEach(a => {
                const c = a.creative;
                if (c) {
                    const url = c.image_url
                        || c.object_story_spec?.link_data?.image_url
                        || c.object_story_spec?.photo_data?.url
                        || c.object_story_spec?.video_data?.image_url
                        || c.thumbnail_url
                        || null;
                    if (url) fbAdsImageMap[a.id] = url;
                }
            });

            let updatedCount = 0;
            const updateStmt = db.prepare('UPDATE ads SET creative_url = ? WHERE id = ?');

            // Build creative ID map from bulk fetch
            const creativeIdMap = {};
            allFbAds.forEach(a => {
                if (a.creative?.id) creativeIdMap[a.id] = a.creative.id;
            });

            for (const ad of ads) {
                // First try full-size image from the creative sub-field (non-thumbnail)
                const bulkUrl = fbAdsImageMap[ad.facebook_ad_id];
                if (bulkUrl && !bulkUrl.includes('p64x64')) {
                    updateStmt.run(bulkUrl, ad.id);
                    updatedCount++;
                    continue;
                }

                // Fetch individual creative with thumbnail_width/height params for larger thumbnails
                const creativeId = creativeIdMap[ad.facebook_ad_id];
                if (creativeId) {
                    try {
                        const url = await this.fbApi.getAdCreativeUrl(creativeId);
                        if (url) {
                            updateStmt.run(url, ad.id);
                            updatedCount++;
                        }
                    } catch (e) { /* skip */ }
                }
            }

            console.log(`[SYNC] Updated ${updatedCount} creative URLs`);
            return { success: true, count: updatedCount };
        } catch (error) {
            console.error('[SYNC] Creative URL refresh error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Full sync for an account (with delays to avoid rate limiting)
    async fullSync(fbAccountId) {
        console.log(`[SYNC] Starting full sync for ${fbAccountId}`);
        const results = {
            campaigns: null,
            adsets: null,
            ads: null,
            countries: null,
            adCountries: null
        };

        // Sync campaigns
        results.campaigns = await this.syncCampaigns(fbAccountId);

        // Wait 2 seconds between API calls to avoid rate limiting
        await this.delay(2000);

        // Sync ad sets
        results.adsets = await this.syncAdSets(fbAccountId);

        await this.delay(2000);

        // Sync ads
        results.ads = await this.syncAds(fbAccountId);

        await this.delay(2000);

        // Sync countries
        results.countries = await this.syncCountries(fbAccountId);

        await this.delay(2000);

        // Sync ad-level country metrics (for per-ad sale country attribution)
        results.adCountries = await this.syncAdCountryMetrics(fbAccountId);

        // Update sync status
        try {
            const internalAccountId = this.getInternalAccountId(fbAccountId);
            db.prepare(`
                INSERT INTO sync_status (account_id, initial_sync_complete, last_daily_sync_at, last_sync_status)
                VALUES (?, 1, CURRENT_TIMESTAMP, 'success')
                ON CONFLICT(account_id) DO UPDATE SET
                    initial_sync_complete = 1,
                    last_daily_sync_at = CURRENT_TIMESTAMP,
                    last_sync_status = 'success'
            `).run(internalAccountId);
        } catch (e) {
            console.error('[SYNC] Error updating sync status:', e);
        }

        console.log(`[SYNC] Full sync completed for ${fbAccountId}`);
        return results;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = SyncService;
