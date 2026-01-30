const express = require('express');
const { db } = require('../models/database');
const { authenticateToken, checkAccountAccess } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// POST /api/leads/:accountId - Add a new lead entry
router.post('/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { date, count, source, campaign_name, notes } = req.body;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Date is required' });
        }
        if (!count || isNaN(count) || parseInt(count) < 1) {
            return res.status(400).json({ success: false, error: 'Count must be a positive number' });
        }

        const stmt = db.prepare(`
            INSERT INTO leads (account_id, date, count, source, campaign_name, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            accountId,
            date,
            parseInt(count),
            source || 'facebook',
            campaign_name || null,
            notes || null
        );

        res.json({
            success: true,
            data: { id: result.lastInsertRowid },
            message: 'Lead entry added successfully'
        });
    } catch (error) {
        console.error('Add lead error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to add lead entry' });
    }
});

// GET /api/leads/:accountId - Get leads data
router.get('/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { startDate, endDate, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `SELECT * FROM leads WHERE account_id = ?`;
        const params = [accountId];

        if (startDate) {
            query += ` AND date >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND date <= ?`;
            params.push(endDate);
        }

        // Get total count
        const countQuery = query.replace('*', 'COUNT(*) as total');
        const totalResult = db.prepare(countQuery).get(...params);
        const total = totalResult?.total || 0;

        // Add pagination
        query += ` ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`;
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
            baseQuery += ` AND date >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            baseQuery += ` AND date <= ?`;
            params.push(endDate);
        }

        // Get total lead count (sum of count column)
        const totalLeads = db.prepare(`SELECT COALESCE(SUM(count), 0) as total ${baseQuery}`).get(...params);

        // Get by source
        const sourceQuery = `
            SELECT source, SUM(count) as count
            ${baseQuery}
            GROUP BY source
        `;
        const bySource = db.prepare(sourceQuery).all(...params);

        // Get daily breakdown
        let dailyQuery = `
            SELECT
                date,
                SUM(count) as leads
            FROM leads
            WHERE account_id = ?
        `;
        const dailyParams = [accountId];

        if (startDate) {
            dailyQuery += ` AND date >= ?`;
            dailyParams.push(startDate);
        }

        if (endDate) {
            dailyQuery += ` AND date <= ?`;
            dailyParams.push(endDate);
        }

        dailyQuery += ` GROUP BY date ORDER BY date DESC LIMIT 30`;

        const dailyBreakdown = db.prepare(dailyQuery).all(...dailyParams);

        res.json({
            success: true,
            data: {
                total: totalLeads?.total || 0,
                bySource: bySource.reduce((acc, item) => {
                    acc[item.source] = item.count;
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

// DELETE /api/leads/:accountId/:entryId - Delete a lead entry
router.delete('/:accountId/:entryId', checkAccountAccess, (req, res) => {
    try {
        const { accountId, entryId } = req.params;

        const result = db.prepare('DELETE FROM leads WHERE id = ? AND account_id = ?').run(entryId, accountId);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Entry not found' });
        }

        res.json({ success: true, message: 'Lead entry deleted successfully' });
    } catch (error) {
        console.error('Delete lead error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete lead entry' });
    }
});

// PUT /api/leads/:accountId/:entryId - Update a lead entry
router.put('/:accountId/:entryId', checkAccountAccess, (req, res) => {
    try {
        const { accountId, entryId } = req.params;
        const { date, count, source, campaign_name, notes } = req.body;

        const result = db.prepare(`
            UPDATE leads
            SET date = ?, count = ?, source = ?, campaign_name = ?, notes = ?
            WHERE id = ? AND account_id = ?
        `).run(
            date,
            parseInt(count),
            source || 'facebook',
            campaign_name || null,
            notes || null,
            entryId,
            accountId
        );

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Entry not found' });
        }

        res.json({ success: true, message: 'Lead entry updated successfully' });
    } catch (error) {
        console.error('Update lead error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to update lead entry' });
    }
});

module.exports = router;
