const { db } = require('../models/database');
const FacebookApiService = require('./facebookApi');

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

            const today = new Date().toISOString().split('T')[0];
            let syncedCount = 0;

            for (const campaign of campaigns) {
                const insights = campaign.insights || {};
                const status = campaign.status?.toLowerCase() === 'active' ? 'active' : 'paused';
                const budget = parseFloat(campaign.daily_budget || campaign.lifetime_budget || 0) / 100;

                // Extract revenue, sales, leads from Meta's actions/action_values
                const metaRevenue = this.fbApi.getPurchaseValue(insights.action_values);
                const metaSales = this.fbApi.getPurchases(insights.actions);
                const metaLeads = this.fbApi.getLeads(insights.actions);

                // Check if campaign exists
                let dbCampaign = findCampaign.get(campaign.id);

                if (dbCampaign) {
                    // Update existing campaign
                    updateCampaign.run(campaign.name, status, budget, dbCampaign.id);
                } else {
                    // Insert new campaign
                    const result = insertCampaign.run(
                        internalAccountId,
                        campaign.id,
                        campaign.name,
                        status,
                        budget
                    );
                    dbCampaign = { id: result.lastInsertRowid };
                }

                // Handle daily metrics
                const existingMetric = findMetric.get(dbCampaign.id, today);
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
                        today
                    );
                } else {
                    insertMetric.run(
                        internalAccountId,
                        dbCampaign.id,
                        today,
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

            const today = new Date().toISOString().split('T')[0];
            let syncedCount = 0;

            for (const adset of adsets) {
                const insights = adset.insights || {};
                const status = adset.status?.toLowerCase() === 'active' ? 'active' : 'paused';
                const budget = parseFloat(adset.daily_budget || adset.lifetime_budget || 0) / 100;

                // Extract revenue, sales, leads from Meta's actions/action_values
                const metaRevenue = this.fbApi.getPurchaseValue(insights.action_values);
                const metaSales = this.fbApi.getPurchases(insights.actions);
                const metaLeads = this.fbApi.getLeads(insights.actions);

                // Get campaign internal ID
                const dbCampaign = findCampaign.get(adset.campaign_id);
                if (!dbCampaign) {
                    console.log(`[SYNC] Campaign not found for adset ${adset.id}, skipping`);
                    continue;
                }

                // Check if adset exists
                let dbAdSet = findAdSet.get(adset.id);

                if (dbAdSet) {
                    // Update existing ad set
                    updateAdSet.run(adset.name, status, budget, dbAdSet.id);
                } else {
                    // Insert new ad set
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

                // Handle daily metrics
                const existingMetric = findMetric.get(dbAdSet.id, today);
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
                        today
                    );
                } else {
                    insertMetric.run(
                        internalAccountId,
                        dbAdSet.id,
                        today,
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

            const today = new Date().toISOString().split('T')[0];
            let syncedCount = 0;

            for (const ad of ads) {
                const insights = ad.insights || {};
                const status = ad.status?.toLowerCase() === 'active' ? 'active' : 'paused';

                // Extract revenue, sales, leads from Meta's actions/action_values
                const metaRevenue = this.fbApi.getPurchaseValue(insights.action_values);
                const metaSales = this.fbApi.getPurchases(insights.actions);
                const metaLeads = this.fbApi.getLeads(insights.actions);

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
                    // Update existing ad
                    updateAd.run(ad.name, status, creativeUrl, dbAd.id);
                } else {
                    // Insert new ad
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

                // Handle daily metrics
                const existingMetric = findMetric.get(dbAd.id, today);
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
                        today
                    );
                } else {
                    insertMetric.run(
                        internalAccountId,
                        dbAd.id,
                        today,
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
                syncedCount++;
            }

            console.log(`[SYNC] Synced ${syncedCount} ads`);
            return { success: true, count: syncedCount };
        } catch (error) {
            console.error('[SYNC] Ads sync error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Sync country data for an account
    async syncCountries(fbAccountId) {
        const internalAccountId = this.getInternalAccountId(fbAccountId);
        console.log(`[SYNC] Syncing country data for account ${fbAccountId}`);

        try {
            const countryData = await this.fbApi.getCountryInsights(fbAccountId);
            console.log(`[SYNC] Found ${countryData.length} country records`);

            // Prepare statements for INSERT/UPDATE pattern
            const findCountry = db.prepare('SELECT id FROM country_performance WHERE account_id = ? AND country_code = ? AND date = ?');
            const insertCountry = db.prepare(`
                INSERT INTO country_performance (account_id, country_name, country_code, date, spend, revenue, sales)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const updateCountry = db.prepare(`
                UPDATE country_performance SET spend = ? WHERE id = ?
            `);

            const today = new Date().toISOString().split('T')[0];
            let syncedCount = 0;

            for (const country of countryData) {
                const countryCode = country.country?.toLowerCase() || 'unknown';
                const countryName = getCountryName(country.country);

                const existingCountry = findCountry.get(internalAccountId, countryCode, today);
                if (existingCountry) {
                    updateCountry.run(parseFloat(country.spend || 0), existingCountry.id);
                } else {
                    insertCountry.run(
                        internalAccountId,
                        countryName,
                        countryCode,
                        today,
                        parseFloat(country.spend || 0),
                        0, // Revenue from local data
                        0  // Sales from local data
                    );
                }
                syncedCount++;
            }

            console.log(`[SYNC] Synced ${syncedCount} country records`);
            return { success: true, count: syncedCount };
        } catch (error) {
            console.error('[SYNC] Country sync error:', error.message);
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
            countries: null
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
