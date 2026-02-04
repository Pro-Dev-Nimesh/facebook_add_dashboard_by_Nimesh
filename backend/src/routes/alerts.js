const express = require('express');
const { db } = require('../models/database');
const { authenticateToken, requireAdmin, checkAccountAccess } = require('../middleware/auth');
const { regenerateAlerts } = require('../services/alertGenerator');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// POST /api/alerts/:accountId/regenerate - Regenerate alerts from current data
router.post('/:accountId/regenerate', checkAccountAccess, (req, res) => {
    try {
        const accountId = parseInt(req.params.accountId);
        const alerts = regenerateAlerts(accountId);
        const opportunities = alerts.filter(a => a.priority === 'opportunity');

        res.json({
            success: true,
            message: `Generated ${alerts.length} alerts (${opportunities.length} opportunities)`,
            data: {
                total: alerts.length,
                opportunities: opportunities.length,
                needsAction: alerts.length - opportunities.length
            }
        });
    } catch (error) {
        console.error('Regenerate alerts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to regenerate alerts'
        });
    }
});

// GET /api/alerts/:accountId - Get alerts for account
router.get('/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { status, type, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT a.*
            FROM alerts a
            WHERE a.account_id = ?
        `;
        const params = [accountId];

        if (status) {
            query += ` AND a.status = ?`;
            params.push(status);
        }

        if (type) {
            query += ` AND a.type = ?`;
            params.push(type);
        }

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM alerts WHERE account_id = ?`;
        const countParams = [accountId];
        if (status) { countQuery += ` AND status = ?`; countParams.push(status); }
        if (type) { countQuery += ` AND type = ?`; countParams.push(type); }
        const totalResult = db.prepare(countQuery).get(...countParams);
        const total = totalResult?.total || 0;

        // Add pagination
        query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const alerts = db.prepare(query).all(...params);

        res.json({
            success: true,
            data: {
                alerts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get alerts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get alerts'
        });
    }
});

// GET /api/alerts/:accountId/summary - Get alerts summary
router.get('/:accountId/summary', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;

        const summary = db.prepare(`
            SELECT
                status,
                priority,
                COUNT(*) as count
            FROM alerts
            WHERE account_id = ?
            GROUP BY status, priority
        `).all(accountId);

        // Transform into structured summary
        const result = {
            byStatus: {},
            byPriority: {},
            total: 0
        };

        summary.forEach(item => {
            result.byStatus[item.status] = (result.byStatus[item.status] || 0) + item.count;
            result.byPriority[item.priority] = (result.byPriority[item.priority] || 0) + item.count;
            result.total += item.count;
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Get alerts summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get alerts summary'
        });
    }
});

// GET /api/alerts/detail/:alertId - Get single alert with comments
router.get('/detail/:alertId', (req, res) => {
    try {
        const { alertId } = req.params;

        const alert = db.prepare(`
            SELECT a.*
            FROM alerts a
            WHERE a.id = ?
        `).get(alertId);

        if (!alert) {
            return res.status(404).json({
                success: false,
                error: 'Alert not found'
            });
        }

        // Get comments
        const comments = db.prepare(`
            SELECT
                ac.*,
                u.name as user_name
            FROM alert_comments ac
            JOIN users u ON ac.user_id = u.id
            WHERE ac.alert_id = ?
            ORDER BY ac.created_at ASC
        `).all(alertId);

        res.json({
            success: true,
            data: {
                ...alert,
                comments
            }
        });
    } catch (error) {
        console.error('Get alert detail error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get alert details'
        });
    }
});

// PUT /api/alerts/:alertId - Update alert
router.put('/:alertId', (req, res) => {
    try {
        const { alertId } = req.params;
        const { status, priority } = req.body;

        const updates = [];
        const params = [];

        if (status) {
            updates.push('status = ?');
            params.push(status);
        }

        if (priority) {
            updates.push('priority = ?');
            params.push(priority);
        }

        if (status === 'resolved' || status === 'dismissed') {
            updates.push('resolved_at = CURRENT_TIMESTAMP');
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No updates provided'
            });
        }

        params.push(alertId);

        db.prepare(`
            UPDATE alerts
            SET ${updates.join(', ')}
            WHERE id = ?
        `).run(...params);

        res.json({
            success: true,
            message: 'Alert updated'
        });
    } catch (error) {
        console.error('Update alert error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update alert'
        });
    }
});

// POST /api/alerts/:alertId/comments - Add comment to alert
router.post('/:alertId/comments', (req, res) => {
    try {
        const { alertId } = req.params;
        const { comment } = req.body;

        if (!comment) {
            return res.status(400).json({
                success: false,
                error: 'Comment is required'
            });
        }

        const result = db.prepare(`
            INSERT INTO alert_comments (alert_id, user_id, comment)
            VALUES (?, ?, ?)
        `).run(alertId, req.user.id, comment);

        res.status(201).json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                alert_id: alertId,
                user_id: req.user.id,
                comment,
                created_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add comment'
        });
    }
});

// GET /api/alerts/thresholds/:accountId - Get alert thresholds
router.get('/thresholds/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;

        const thresholds = db.prepare(`
            SELECT * FROM alert_thresholds
            WHERE account_id = ?
            ORDER BY metric
        `).all(accountId);

        res.json({
            success: true,
            data: thresholds
        });
    } catch (error) {
        console.error('Get thresholds error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get alert thresholds'
        });
    }
});

// POST /api/alerts/thresholds/:accountId - Create/update threshold
router.post('/thresholds/:accountId', requireAdmin, checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { metric, operator, threshold_value, is_active } = req.body;

        if (!metric || !operator || threshold_value === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Metric, operator, and threshold_value are required'
            });
        }

        // Check if threshold exists
        const existing = db.prepare(`
            SELECT id FROM alert_thresholds
            WHERE account_id = ? AND metric = ?
        `).get(accountId, metric);

        if (existing) {
            // Update existing
            db.prepare(`
                UPDATE alert_thresholds
                SET operator = ?, threshold_value = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(operator, threshold_value, is_active ? 1 : 0, existing.id);
        } else {
            // Create new
            db.prepare(`
                INSERT INTO alert_thresholds (account_id, metric, operator, threshold_value, is_active)
                VALUES (?, ?, ?, ?, ?)
            `).run(accountId, metric, operator, threshold_value, is_active ? 1 : 0);
        }

        res.json({
            success: true,
            message: 'Threshold saved'
        });
    } catch (error) {
        console.error('Save threshold error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save threshold'
        });
    }
});

// DELETE /api/alerts/thresholds/:thresholdId - Delete threshold
router.delete('/thresholds/:thresholdId', requireAdmin, (req, res) => {
    try {
        const { thresholdId } = req.params;

        db.prepare('DELETE FROM alert_thresholds WHERE id = ?').run(thresholdId);

        res.json({
            success: true,
            message: 'Threshold deleted'
        });
    } catch (error) {
        console.error('Delete threshold error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete threshold'
        });
    }
});

module.exports = router;
