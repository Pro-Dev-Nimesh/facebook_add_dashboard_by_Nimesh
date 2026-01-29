const express = require('express');
const crypto = require('crypto');
const { db } = require('../models/database');
const { authenticateToken, requireAdmin, checkAccountAccess } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/settings/account/:accountId - Get account settings
router.get('/account/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;

        const account = db.prepare(`
            SELECT
                id,
                name,
                type,
                status,
                facebook_account_id,
                token_expires_at,
                last_synced,
                initial_sync_complete,
                created_at
            FROM ad_accounts
            WHERE id = ?
        `).get(accountId);

        if (!account) {
            return res.status(404).json({
                success: false,
                error: 'Account not found'
            });
        }

        // Get sync status
        const syncStatus = db.prepare(`
            SELECT * FROM sync_status WHERE account_id = ?
        `).get(accountId);

        // Get alert thresholds
        const thresholds = db.prepare(`
            SELECT * FROM alert_thresholds WHERE account_id = ?
        `).all(accountId);

        res.json({
            success: true,
            data: {
                account,
                syncStatus,
                thresholds
            }
        });
    } catch (error) {
        console.error('Get account settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get account settings'
        });
    }
});

// PUT /api/settings/account/:accountId - Update account settings
router.put('/account/:accountId', requireAdmin, checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { name } = req.body;

        if (name) {
            db.prepare(`
                UPDATE ad_accounts
                SET name = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(name, accountId);
        }

        res.json({
            success: true,
            message: 'Account settings updated'
        });
    } catch (error) {
        console.error('Update account settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update account settings'
        });
    }
});

// GET /api/settings/api-keys/:accountId - Get API keys for account
router.get('/api-keys/:accountId', requireAdmin, checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;

        const apiKeys = db.prepare(`
            SELECT
                id,
                name,
                key_prefix,
                permissions,
                last_used,
                expires_at,
                is_active,
                created_at
            FROM api_keys
            WHERE account_id = ?
            ORDER BY created_at DESC
        `).all(accountId);

        res.json({
            success: true,
            data: apiKeys
        });
    } catch (error) {
        console.error('Get API keys error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get API keys'
        });
    }
});

// POST /api/settings/api-keys/:accountId - Create API key
router.post('/api-keys/:accountId', requireAdmin, checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { name, permissions, expires_in_days } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Name is required'
            });
        }

        // Generate API key
        const apiKey = 'fb_' + crypto.randomBytes(32).toString('hex');
        const keyPrefix = apiKey.substring(0, 10) + '...';
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

        let expiresAt = null;
        if (expires_in_days) {
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + parseInt(expires_in_days));
            expiresAt = expDate.toISOString();
        }

        const result = db.prepare(`
            INSERT INTO api_keys (account_id, name, key_hash, key_prefix, permissions, expires_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(
            accountId,
            name,
            keyHash,
            keyPrefix,
            JSON.stringify(permissions || ['read']),
            expiresAt
        );

        res.status(201).json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                name,
                api_key: apiKey, // Only shown once at creation
                key_prefix: keyPrefix,
                permissions: permissions || ['read'],
                expires_at: expiresAt
            },
            message: 'Save this API key securely. It will not be shown again.'
        });
    } catch (error) {
        console.error('Create API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create API key'
        });
    }
});

// DELETE /api/settings/api-keys/:keyId - Delete API key
router.delete('/api-keys/:keyId', requireAdmin, (req, res) => {
    try {
        const { keyId } = req.params;

        db.prepare('DELETE FROM api_keys WHERE id = ?').run(keyId);

        res.json({
            success: true,
            message: 'API key deleted'
        });
    } catch (error) {
        console.error('Delete API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete API key'
        });
    }
});

// PUT /api/settings/api-keys/:keyId/toggle - Toggle API key active status
router.put('/api-keys/:keyId/toggle', requireAdmin, (req, res) => {
    try {
        const { keyId } = req.params;

        db.prepare(`
            UPDATE api_keys
            SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(keyId);

        res.json({
            success: true,
            message: 'API key status toggled'
        });
    } catch (error) {
        console.error('Toggle API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle API key'
        });
    }
});

// GET /api/settings/sync/:accountId - Get sync settings
router.get('/sync/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;

        const syncStatus = db.prepare(`
            SELECT * FROM sync_status WHERE account_id = ?
        `).get(accountId);

        res.json({
            success: true,
            data: syncStatus || {
                initial_sync_complete: false,
                last_sync_status: 'pending'
            }
        });
    } catch (error) {
        console.error('Get sync settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sync settings'
        });
    }
});

// PUT /api/settings/sync/:accountId - Update sync settings
router.put('/sync/:accountId', requireAdmin, checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { sync_frequency, next_scheduled_sync } = req.body;

        const updates = [];
        const params = [];

        if (sync_frequency) {
            updates.push('sync_frequency = ?');
            params.push(sync_frequency);
        }

        if (next_scheduled_sync) {
            updates.push('next_scheduled_sync = ?');
            params.push(next_scheduled_sync);
        }

        if (updates.length > 0) {
            params.push(accountId);
            db.prepare(`
                UPDATE sync_status
                SET ${updates.join(', ')}
                WHERE account_id = ?
            `).run(...params);
        }

        res.json({
            success: true,
            message: 'Sync settings updated'
        });
    } catch (error) {
        console.error('Update sync settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update sync settings'
        });
    }
});

// GET /api/settings/permissions/:accountId - Get user permissions for account
router.get('/permissions/:accountId', requireAdmin, checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;

        const permissions = db.prepare(`
            SELECT
                up.*,
                u.name as user_name,
                u.email as user_email
            FROM user_permissions up
            JOIN users u ON up.user_id = u.id
            WHERE up.account_id = ?
        `).all(accountId);

        res.json({
            success: true,
            data: permissions
        });
    } catch (error) {
        console.error('Get permissions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get permissions'
        });
    }
});

// POST /api/settings/permissions/:accountId - Grant permission
router.post('/permissions/:accountId', requireAdmin, checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { user_id, can_view, can_edit, can_export } = req.body;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        // Check if permission exists
        const existing = db.prepare(`
            SELECT id FROM user_permissions
            WHERE user_id = ? AND account_id = ?
        `).get(user_id, accountId);

        if (existing) {
            // Update existing
            db.prepare(`
                UPDATE user_permissions
                SET can_view = ?, can_edit = ?, can_export = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                can_view ? 1 : 0,
                can_edit ? 1 : 0,
                can_export ? 1 : 0,
                existing.id
            );
        } else {
            // Create new
            db.prepare(`
                INSERT INTO user_permissions (user_id, account_id, can_view, can_edit, can_export)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                user_id,
                accountId,
                can_view ? 1 : 0,
                can_edit ? 1 : 0,
                can_export ? 1 : 0
            );
        }

        res.json({
            success: true,
            message: 'Permission updated'
        });
    } catch (error) {
        console.error('Update permission error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update permission'
        });
    }
});

// DELETE /api/settings/permissions/:permissionId - Revoke permission
router.delete('/permissions/:permissionId', requireAdmin, (req, res) => {
    try {
        const { permissionId } = req.params;

        db.prepare('DELETE FROM user_permissions WHERE id = ?').run(permissionId);

        res.json({
            success: true,
            message: 'Permission revoked'
        });
    } catch (error) {
        console.error('Revoke permission error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to revoke permission'
        });
    }
});

module.exports = router;
