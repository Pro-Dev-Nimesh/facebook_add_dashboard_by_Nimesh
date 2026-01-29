const express = require('express');
const { db } = require('../models/database');
const { authenticateToken, checkAccountAccess } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/leads/:accountId - Get leads data
router.get('/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { startDate, endDate, status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                l.*,
                c.name as campaign_name,
                ads.name as ad_name
            FROM leads l
            LEFT JOIN campaigns c ON l.campaign_id = c.id
            LEFT JOIN ads ON l.ad_id = ads.id
            WHERE l.account_id = ?
        `;
        const params = [accountId];

        if (startDate) {
            query += ` AND l.created_at >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND l.created_at <= ?`;
            params.push(endDate);
        }

        if (status) {
            query += ` AND l.status = ?`;
            params.push(status);
        }

        // Get total count
        const countQuery = query.replace(
            `l.*,\n                c.name as campaign_name,\n                ads.name as ad_name`,
            'COUNT(*) as total'
        );
        const totalResult = db.prepare(countQuery).get(...params);
        const total = totalResult?.total || 0;

        // Add pagination
        query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const leads = db.prepare(query).all(...params);

        res.json({
            success: true,
            data: {
                leads,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get leads error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get leads data'
        });
    }
});

// GET /api/leads/:accountId/summary - Get leads summary
router.get('/:accountId/summary', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { startDate, endDate } = req.query;

        let baseQuery = `FROM leads WHERE account_id = ?`;
        const params = [accountId];

        if (startDate) {
            baseQuery += ` AND created_at >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            baseQuery += ` AND created_at <= ?`;
            params.push(endDate);
        }

        // Get total count
        const totalLeads = db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params);

        // Get by status
        const statusQuery = `
            SELECT status, COUNT(*) as count
            ${baseQuery}
            GROUP BY status
        `;
        const byStatus = db.prepare(statusQuery).all(...params);

        // Get daily breakdown
        let dailyQuery = `
            SELECT
                DATE(created_at) as date,
                COUNT(*) as leads
            FROM leads
            WHERE account_id = ?
        `;
        const dailyParams = [accountId];

        if (startDate) {
            dailyQuery += ` AND created_at >= ?`;
            dailyParams.push(startDate);
        }

        if (endDate) {
            dailyQuery += ` AND created_at <= ?`;
            dailyParams.push(endDate);
        }

        dailyQuery += ` GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`;

        const dailyBreakdown = db.prepare(dailyQuery).all(...dailyParams);

        res.json({
            success: true,
            data: {
                total: totalLeads?.count || 0,
                byStatus: byStatus.reduce((acc, item) => {
                    acc[item.status] = item.count;
                    return acc;
                }, {}),
                dailyBreakdown
            }
        });
    } catch (error) {
        console.error('Get leads summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get leads summary'
        });
    }
});

// GET /api/leads/:accountId/by-campaign - Get leads by campaign
router.get('/:accountId/by-campaign', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { startDate, endDate } = req.query;

        let query = `
            SELECT
                c.id,
                c.name,
                COUNT(l.id) as total_leads,
                SUM(CASE WHEN l.status = 'new' THEN 1 ELSE 0 END) as new_leads,
                SUM(CASE WHEN l.status = 'qualified' THEN 1 ELSE 0 END) as qualified_leads,
                SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) as converted_leads
            FROM campaigns c
            LEFT JOIN leads l ON c.id = l.campaign_id
            WHERE c.account_id = ?
        `;
        const params = [accountId];

        if (startDate) {
            query += ` AND (l.created_at >= ? OR l.created_at IS NULL)`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND (l.created_at <= ? OR l.created_at IS NULL)`;
            params.push(endDate);
        }

        query += ` GROUP BY c.id ORDER BY total_leads DESC`;

        const campaigns = db.prepare(query).all(...params);

        res.json({
            success: true,
            data: campaigns
        });
    } catch (error) {
        console.error('Get leads by campaign error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get leads by campaign'
        });
    }
});

// PUT /api/leads/:leadId/status - Update lead status
router.put('/:leadId/status', (req, res) => {
    try {
        const { leadId } = req.params;
        const { status } = req.body;

        const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status'
            });
        }

        db.prepare(`
            UPDATE leads
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(status, leadId);

        res.json({
            success: true,
            message: 'Lead status updated'
        });
    } catch (error) {
        console.error('Update lead status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update lead status'
        });
    }
});

module.exports = router;
