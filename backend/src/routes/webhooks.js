const express = require('express');
const crypto = require('crypto');
const { db } = require('../models/database');
const { authenticateToken, requireAdmin, checkAccountAccess } = require('../middleware/auth');

const router = express.Router();

// Generate unique webhook URL
const generateWebhookUrl = () => {
    const uniqueId = crypto.randomBytes(16).toString('hex');
    return `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/webhooks/incoming/${uniqueId}`;
};

// Generate secret key
const generateSecretKey = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Apply authentication to management routes
router.use('/manage', authenticateToken);

// GET /api/webhooks/manage/:accountId - Get webhooks for account
router.get('/manage/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;

        const webhooks = db.prepare(`
            SELECT
                id,
                name,
                webhook_url,
                type,
                status,
                last_triggered,
                created_at
            FROM webhooks
            WHERE account_id = ?
            ORDER BY created_at DESC
        `).all(accountId);

        res.json({
            success: true,
            data: webhooks
        });
    } catch (error) {
        console.error('Get webhooks error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get webhooks'
        });
    }
});

// POST /api/webhooks/manage/:accountId - Create webhook
router.post('/manage/:accountId', requireAdmin, checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { name, type, target_url } = req.body;

        if (!name || !type) {
            return res.status(400).json({
                success: false,
                error: 'Name and type are required'
            });
        }

        const webhook_url = generateWebhookUrl();
        const secret_key = generateSecretKey();

        const result = db.prepare(`
            INSERT INTO webhooks (account_id, name, webhook_url, secret_key, type, target_url, status)
            VALUES (?, ?, ?, ?, ?, ?, 'active')
        `).run(accountId, name, webhook_url, secret_key, type, target_url || null);

        res.status(201).json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                name,
                webhook_url,
                secret_key, // Only shown once at creation
                type,
                status: 'active'
            }
        });
    } catch (error) {
        console.error('Create webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create webhook'
        });
    }
});

// PUT /api/webhooks/manage/:webhookId - Update webhook
router.put('/manage/:webhookId', requireAdmin, (req, res) => {
    try {
        const { webhookId } = req.params;
        const { name, type, target_url, status } = req.body;

        const updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }

        if (type) {
            updates.push('type = ?');
            params.push(type);
        }

        if (target_url !== undefined) {
            updates.push('target_url = ?');
            params.push(target_url);
        }

        if (status) {
            updates.push('status = ?');
            params.push(status);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No updates provided'
            });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(webhookId);

        db.prepare(`
            UPDATE webhooks
            SET ${updates.join(', ')}
            WHERE id = ?
        `).run(...params);

        res.json({
            success: true,
            message: 'Webhook updated'
        });
    } catch (error) {
        console.error('Update webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update webhook'
        });
    }
});

// DELETE /api/webhooks/manage/:webhookId - Delete webhook
router.delete('/manage/:webhookId', requireAdmin, (req, res) => {
    try {
        const { webhookId } = req.params;

        db.prepare('DELETE FROM webhooks WHERE id = ?').run(webhookId);

        res.json({
            success: true,
            message: 'Webhook deleted'
        });
    } catch (error) {
        console.error('Delete webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete webhook'
        });
    }
});

// POST /api/webhooks/manage/:webhookId/regenerate-secret - Regenerate secret key
router.post('/manage/:webhookId/regenerate-secret', requireAdmin, (req, res) => {
    try {
        const { webhookId } = req.params;
        const secret_key = generateSecretKey();

        db.prepare(`
            UPDATE webhooks
            SET secret_key = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(secret_key, webhookId);

        res.json({
            success: true,
            data: { secret_key }
        });
    } catch (error) {
        console.error('Regenerate secret error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to regenerate secret'
        });
    }
});

// POST /api/webhooks/incoming/:webhookId - Receive incoming webhook data
router.post('/incoming/:webhookId', (req, res) => {
    try {
        const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/webhooks/incoming/${req.params.webhookId}`;

        const webhook = db.prepare(`
            SELECT * FROM webhooks
            WHERE webhook_url = ? AND status = 'active'
        `).get(webhookUrl);

        if (!webhook) {
            return res.status(404).json({
                success: false,
                error: 'Webhook not found or inactive'
            });
        }

        // Verify signature if provided
        const signature = req.headers['x-webhook-signature'];
        if (signature) {
            const expectedSignature = crypto
                .createHmac('sha256', webhook.secret_key)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (signature !== expectedSignature) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid signature'
                });
            }
        }

        // Process webhook based on type
        const data = req.body;

        switch (webhook.type) {
            case 'revenue':
                // Process revenue data
                if (data.amount && data.transaction_id) {
                    db.prepare(`
                        INSERT OR IGNORE INTO revenue_transactions
                        (account_id, campaign_id, transaction_id, amount, currency, transaction_date, source)
                        VALUES (?, ?, ?, ?, ?, ?, 'webhook')
                    `).run(
                        webhook.account_id,
                        data.campaign_id || null,
                        data.transaction_id,
                        data.amount,
                        data.currency || 'USD',
                        data.date || new Date().toISOString().split('T')[0]
                    );
                }
                break;

            case 'leads':
                // Process lead data
                if (data.email || data.phone) {
                    db.prepare(`
                        INSERT INTO leads
                        (account_id, campaign_id, ad_id, facebook_lead_id, name, email, phone, form_data, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
                    `).run(
                        webhook.account_id,
                        data.campaign_id || null,
                        data.ad_id || null,
                        data.lead_id || null,
                        data.name || null,
                        data.email || null,
                        data.phone || null,
                        JSON.stringify(data.form_data || {})
                    );
                }
                break;

            default:
                // Generic webhook - just log it
                console.log(`Webhook ${webhook.id} received:`, data);
        }

        // Update last triggered
        db.prepare(`
            UPDATE webhooks
            SET last_triggered = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(webhook.id);

        // If target_url is set, forward the webhook
        if (webhook.target_url) {
            // In production, use axios to forward
            console.log(`Forwarding webhook to: ${webhook.target_url}`);
        }

        res.json({
            success: true,
            message: 'Webhook received'
        });
    } catch (error) {
        console.error('Process webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process webhook'
        });
    }
});

// POST /api/webhooks/manage/:webhookId/test - Test webhook
router.post('/manage/:webhookId/test', requireAdmin, (req, res) => {
    try {
        const { webhookId } = req.params;

        const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(webhookId);

        if (!webhook) {
            return res.status(404).json({
                success: false,
                error: 'Webhook not found'
            });
        }

        // Return test payload based on webhook type
        const testPayloads = {
            revenue: {
                transaction_id: 'test_' + Date.now(),
                amount: 99.99,
                currency: 'USD',
                date: new Date().toISOString().split('T')[0],
                campaign_id: null
            },
            leads: {
                lead_id: 'test_' + Date.now(),
                name: 'Test User',
                email: 'test@example.com',
                phone: '+1234567890',
                form_data: { source: 'test' }
            },
            alerts: {
                type: 'test',
                message: 'This is a test alert',
                timestamp: new Date().toISOString()
            }
        };

        res.json({
            success: true,
            data: {
                webhook_url: webhook.webhook_url,
                test_payload: testPayloads[webhook.type] || { test: true },
                curl_example: `curl -X POST ${webhook.webhook_url} -H "Content-Type: application/json" -H "x-webhook-signature: YOUR_SIGNATURE" -d '${JSON.stringify(testPayloads[webhook.type] || { test: true })}'`
            }
        });
    } catch (error) {
        console.error('Test webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate test'
        });
    }
});

module.exports = router;
