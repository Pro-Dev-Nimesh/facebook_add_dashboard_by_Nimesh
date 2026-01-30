const axios = require('axios');

const FB_API_VERSION = 'v21.0';
const FB_API_BASE = `https://graph.facebook.com/${FB_API_VERSION}`;

class FacebookApiService {
    constructor(accessToken) {
        this.accessToken = accessToken || process.env.FACEBOOK_ACCESS_TOKEN;
    }

    // Make API request to Facebook
    async request(endpoint, params = {}) {
        try {
            const response = await axios.get(`${FB_API_BASE}${endpoint}`, {
                params: {
                    access_token: this.accessToken,
                    ...params
                }
            });
            return response.data;
        } catch (error) {
            console.error('Facebook API Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Facebook API request failed');
        }
    }

    // Get all ad accounts accessible by this token
    async getAdAccounts() {
        try {
            const data = await this.request('/me/adaccounts', {
                fields: 'id,name,account_id,account_status,currency,timezone_name,amount_spent'
            });
            return data.data || [];
        } catch (error) {
            console.error('Failed to get ad accounts:', error.message);
            return [];
        }
    }

    // Get campaigns for an ad account
    async getCampaigns(adAccountId, startDate, endDate) {
        try {
            const data = await this.request(`/${adAccountId}/campaigns`, {
                fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time',
                limit: 100
            });

            const campaigns = data.data || [];

            // Get insights for each campaign
            const campaignsWithInsights = await Promise.all(
                campaigns.map(async (campaign) => {
                    try {
                        const insights = await this.getCampaignInsights(campaign.id, startDate, endDate);
                        return { ...campaign, insights };
                    } catch (e) {
                        return { ...campaign, insights: null };
                    }
                })
            );

            return campaignsWithInsights;
        } catch (error) {
            console.error('Failed to get campaigns:', error.message);
            return [];
        }
    }

    // Get campaign insights
    async getCampaignInsights(campaignId, startDate, endDate) {
        try {
            const timeRange = startDate && endDate
                ? JSON.stringify({ since: startDate, until: endDate })
                : JSON.stringify({ since: this.getDefaultStartDate(), until: this.getDefaultEndDate() });

            const data = await this.request(`/${campaignId}/insights`, {
                fields: 'spend,impressions,clicks,reach,cpc,cpm,ctr,actions,action_values,frequency,outbound_clicks',
                time_range: timeRange
            });

            return data.data?.[0] || null;
        } catch (error) {
            return null;
        }
    }

    // Get ad sets for an ad account
    async getAdSets(adAccountId, startDate, endDate) {
        try {
            const data = await this.request(`/${adAccountId}/adsets`, {
                fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,targeting,created_time',
                limit: 100
            });

            const adsets = data.data || [];

            // Get insights for each adset
            const adsetsWithInsights = await Promise.all(
                adsets.map(async (adset) => {
                    try {
                        const insights = await this.getAdSetInsights(adset.id, startDate, endDate);
                        return { ...adset, insights };
                    } catch (e) {
                        return { ...adset, insights: null };
                    }
                })
            );

            return adsetsWithInsights;
        } catch (error) {
            console.error('Failed to get ad sets:', error.message);
            return [];
        }
    }

    // Get ad set insights
    async getAdSetInsights(adsetId, startDate, endDate) {
        try {
            const timeRange = startDate && endDate
                ? JSON.stringify({ since: startDate, until: endDate })
                : JSON.stringify({ since: this.getDefaultStartDate(), until: this.getDefaultEndDate() });

            const data = await this.request(`/${adsetId}/insights`, {
                fields: 'spend,impressions,clicks,reach,cpc,cpm,ctr,actions,action_values,frequency,outbound_clicks',
                time_range: timeRange
            });

            return data.data?.[0] || null;
        } catch (error) {
            return null;
        }
    }

    // Get ads for an ad account
    async getAds(adAccountId, startDate, endDate) {
        try {
            const data = await this.request(`/${adAccountId}/ads`, {
                fields: 'id,name,status,adset_id,campaign_id,creative,created_time',
                limit: 100
            });

            const ads = data.data || [];

            // Get insights for each ad
            const adsWithInsights = await Promise.all(
                ads.map(async (ad) => {
                    try {
                        const insights = await this.getAdInsights(ad.id, startDate, endDate);
                        return { ...ad, insights };
                    } catch (e) {
                        return { ...ad, insights: null };
                    }
                })
            );

            return adsWithInsights;
        } catch (error) {
            console.error('Failed to get ads:', error.message);
            return [];
        }
    }

    // Get ad insights
    async getAdInsights(adId, startDate, endDate) {
        try {
            const timeRange = startDate && endDate
                ? JSON.stringify({ since: startDate, until: endDate })
                : JSON.stringify({ since: this.getDefaultStartDate(), until: this.getDefaultEndDate() });

            const data = await this.request(`/${adId}/insights`, {
                fields: 'spend,impressions,clicks,reach,cpc,cpm,ctr,actions,action_values,frequency,outbound_clicks',
                time_range: timeRange
            });

            return data.data?.[0] || null;
        } catch (error) {
            return null;
        }
    }

    // Get account-level insights
    async getAccountInsights(adAccountId, startDate, endDate) {
        try {
            const timeRange = startDate && endDate
                ? JSON.stringify({ since: startDate, until: endDate })
                : JSON.stringify({ since: this.getDefaultStartDate(), until: this.getDefaultEndDate() });

            const data = await this.request(`/${adAccountId}/insights`, {
                fields: 'spend,impressions,clicks,reach,cpc,cpm,ctr,actions,action_values,frequency,outbound_clicks,purchase_roas',
                time_range: timeRange
            });

            return data.data?.[0] || null;
        } catch (error) {
            console.error('Failed to get account insights:', error.message);
            return null;
        }
    }

    // Get insights by country (with pagination to fetch ALL countries)
    async getCountryInsights(adAccountId, startDate, endDate) {
        try {
            const timeRange = startDate && endDate
                ? JSON.stringify({ since: startDate, until: endDate })
                : JSON.stringify({ since: this.getDefaultStartDate(), until: this.getDefaultEndDate() });

            const data = await this.request(`/${adAccountId}/insights`, {
                fields: 'spend,impressions,clicks,reach,actions,action_values',
                time_range: timeRange,
                breakdowns: 'country',
                limit: 500
            });

            let allResults = data.data || [];

            // Handle pagination to get ALL countries
            let nextPage = data.paging?.next;
            while (nextPage) {
                try {
                    const response = await axios.get(nextPage);
                    const pageData = response.data;
                    if (pageData.data && pageData.data.length > 0) {
                        allResults = allResults.concat(pageData.data);
                        nextPage = pageData.paging?.next;
                    } else {
                        break;
                    }
                } catch (pageError) {
                    console.error('Pagination error:', pageError.message);
                    break;
                }
            }

            return allResults;
        } catch (error) {
            console.error('Failed to get country insights:', error.message);
            return [];
        }
    }

    // Get creative thumbnail/image URL for an ad
    async getAdCreativeUrl(creativeId) {
        try {
            const data = await this.request(`/${creativeId}`, {
                fields: 'thumbnail_url,image_url,object_story_spec'
            });
            // Prefer image_url, fallback to thumbnail_url, then try object_story_spec
            return data.image_url
                || data.thumbnail_url
                || data.object_story_spec?.link_data?.image_url
                || data.object_story_spec?.photo_data?.url
                || data.object_story_spec?.video_data?.image_url
                || null;
        } catch (error) {
            console.error(`Failed to get creative URL for ${creativeId}:`, error.message);
            return null;
        }
    }

    // Helper: Get purchases from actions
    getPurchases(actions) {
        if (!actions) return 0;
        const purchaseAction = actions.find(a =>
            a.action_type === 'purchase' ||
            a.action_type === 'omni_purchase' ||
            a.action_type === 'offsite_conversion.fb_pixel_purchase'
        );
        return purchaseAction ? parseInt(purchaseAction.value) : 0;
    }

    // Helper: Get purchase value from action_values
    getPurchaseValue(actionValues) {
        if (!actionValues) return 0;
        const purchaseValue = actionValues.find(a =>
            a.action_type === 'purchase' ||
            a.action_type === 'omni_purchase' ||
            a.action_type === 'offsite_conversion.fb_pixel_purchase'
        );
        return purchaseValue ? parseFloat(purchaseValue.value) : 0;
    }

    // Helper: Get leads from actions
    getLeads(actions) {
        if (!actions) return 0;
        const leadAction = actions.find(a =>
            a.action_type === 'lead' ||
            a.action_type === 'omni_lead' ||
            a.action_type === 'offsite_conversion.fb_pixel_lead'
        );
        return leadAction ? parseInt(leadAction.value) : 0;
    }

    // Helper: Get outbound clicks
    getOutboundClicks(outboundClicks) {
        if (!outboundClicks) return 0;
        const click = outboundClicks.find(c => c.action_type === 'outbound_click');
        return click ? parseInt(click.value) : 0;
    }

    // Helper: Default date range (last 30 days)
    getDefaultStartDate() {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        return date.toISOString().split('T')[0];
    }

    getDefaultEndDate() {
        return new Date().toISOString().split('T')[0];
    }
}

module.exports = FacebookApiService;
