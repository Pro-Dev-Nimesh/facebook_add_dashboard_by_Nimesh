const express = require('express');
const axios = require('axios');
const { db } = require('../models/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/facebook/auth-url - Get Facebook OAuth URL
router.get('/auth-url', (req, res) => {
    try {
        const scopes = [
            'ads_management',
            'ads_read',
            'business_management',
            'pages_read_engagement'
        ].join(',');

        const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
            `client_id=${FACEBOOK_APP_ID}` +
            `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
            `&scope=${scopes}` +
            `&response_type=code` +
            `&state=${req.user.id}`;

        res.json({
            success: true,
            data: { authUrl }
        });
    } catch (error) {
        console.error('Get auth URL error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate auth URL'
        });
    }
});

// GET /api/facebook/callback - OAuth callback
router.get('/callback', async (req, res) => {
    try {
        const { code, state: userId } = req.query;

        if (!code) {
            return res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
        }

        // Exchange code for access token
        const tokenResponse = await axios.get(
            `https://graph.facebook.com/v18.0/oauth/access_token`, {
                params: {
                    client_id: FACEBOOK_APP_ID,
                    client_secret: FACEBOOK_APP_SECRET,
                    redirect_uri: FACEBOOK_REDIRECT_URI,
                    code
                }
            }
        );

        const { access_token, expires_in } = tokenResponse.data;

        // Get long-lived token
        const longLivedResponse = await axios.get(
            `https://graph.facebook.com/v18.0/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: FACEBOOK_APP_ID,
                    client_secret: FACEBOOK_APP_SECRET,
                    fb_exchange_token: access_token
                }
            }
        );

        const longLivedToken = longLivedResponse.data.access_token;

        // Get ad accounts
        const accountsResponse = await axios.get(
            `https://graph.facebook.com/v18.0/me/adaccounts`, {
                params: {
                    access_token: longLivedToken,
                    fields: 'id,name,account_status'
                }
            }
        );

        // Store or update account
        const adAccounts = accountsResponse.data.data || [];

        if (adAccounts.length > 0) {
            const account = adAccounts[0]; // Use first account

            // Check if account exists
            const existing = db.prepare(`
                SELECT id FROM ad_accounts WHERE facebook_account_id = ?
            `).get(account.id);

            if (existing) {
                // Update existing
                db.prepare(`
                    UPDATE ad_accounts
                    SET access_token = ?, token_expires_at = datetime('now', '+60 days'), status = 'active'
                    WHERE id = ?
                `).run(longLivedToken, existing.id);
            } else {
                // Insert new
                db.prepare(`
                    INSERT INTO ad_accounts (user_id, facebook_account_id, name, access_token, token_expires_at, status)
                    VALUES (?, ?, ?, ?, datetime('now', '+60 days'), 'active')
                `).run(userId, account.id, account.name, longLivedToken);
            }
        }

        res.redirect(`${process.env.FRONTEND_URL}?connected=true`);
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
    }
});

// GET /api/facebook/accounts - Get connected accounts
router.get('/accounts', (req, res) => {
    try {
        const accounts = db.prepare(`
            SELECT
                id,
                facebook_account_id,
                name,
                type,
                status,
                last_synced,
                initial_sync_complete,
                created_at
            FROM ad_accounts
            WHERE user_id = ?
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

// POST /api/facebook/disconnect/:accountId - Disconnect account
router.post('/disconnect/:accountId', requireAdmin, (req, res) => {
    try {
        const { accountId } = req.params;

        db.prepare(`
            UPDATE ad_accounts
            SET status = 'disconnected', access_token = NULL
            WHERE id = ? AND user_id = ?
        `).run(accountId, req.user.id);

        res.json({
            success: true,
            message: 'Account disconnected'
        });
    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect account'
        });
    }
});

// POST /api/facebook/sync/:accountId - Trigger manual sync (admin only)
router.post('/sync/:accountId', requireAdmin, async (req, res) => {
    try {
        const { accountId } = req.params;

        // Check rate limits
        const syncStatus = db.prepare(`
            SELECT total_api_calls_today, api_calls_reset_at
            FROM sync_status WHERE account_id = ?
        `).get(accountId);

        const today = new Date().toISOString().split('T')[0];

        if (syncStatus && syncStatus.api_calls_reset_at === today && syncStatus.total_api_calls_today >= 50) {
            return res.status(429).json({
                success: false,
                error: 'Daily API limit reached. Try again tomorrow.'
            });
        }

        // Update sync status
        db.prepare(`
            UPDATE sync_status
            SET last_sync_status = 'in_progress'
            WHERE account_id = ?
        `).run(accountId);

        // In production, this would queue a background job
        // For now, we'll simulate a sync
        setTimeout(() => {
            db.prepare(`
                UPDATE sync_status
                SET last_sync_status = 'success',
                    last_daily_sync_at = CURRENT_TIMESTAMP,
                    total_api_calls_today = COALESCE(total_api_calls_today, 0) + 4,
                    api_calls_reset_at = ?
                WHERE account_id = ?
            `).run(today, accountId);

            db.prepare(`
                UPDATE ad_accounts
                SET last_synced = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(accountId);
        }, 2000);

        res.json({
            success: true,
            message: 'Sync started'
        });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start sync'
        });
    }
});

// GET /api/facebook/sync-status/:accountId
router.get('/sync-status/:accountId', (req, res) => {
    try {
        const { accountId } = req.params;

        const status = db.prepare(`
            SELECT
                initial_sync_complete,
                last_daily_sync_at,
                last_sync_status,
                last_sync_error,
                next_scheduled_sync,
                total_api_calls_today
            FROM sync_status WHERE account_id = ?
        `).get(accountId);

        res.json({
            success: true,
            data: status || {
                initial_sync_complete: false,
                last_sync_status: 'pending'
            }
        });
    } catch (error) {
        console.error('Get sync status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sync status'
        });
    }
});

// POST /api/facebook/refresh-token/:accountId
router.post('/refresh-token/:accountId', requireAdmin, async (req, res) => {
    try {
        const { accountId } = req.params;

        const account = db.prepare(`
            SELECT access_token FROM ad_accounts WHERE id = ? AND user_id = ?
        `).get(accountId, req.user.id);

        if (!account || !account.access_token) {
            return res.status(400).json({
                success: false,
                error: 'Account not connected or token missing'
            });
        }

        // In production, refresh the Facebook token
        // For demo, just update the expiry
        db.prepare(`
            UPDATE ad_accounts
            SET token_expires_at = datetime('now', '+60 days')
            WHERE id = ?
        `).run(accountId);

        res.json({
            success: true,
            message: 'Token refreshed'
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh token'
        });
    }
});

module.exports = router;
