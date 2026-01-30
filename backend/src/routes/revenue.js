const express = require('express');
const { db } = require('../models/database');
const { authenticateToken, checkAccountAccess } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// POST /api/revenue/:accountId - Add a new revenue entry
router.post('/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { transaction_id, customer_email, product, country, country_code, amount, source, created_at, notes } = req.body;

        if (!amount || isNaN(amount)) {
            return res.status(400).json({ success: false, error: 'Amount is required and must be a number' });
        }

        // Map source to valid DB values
        const sourceMap = { 'manual': 'manual', 'razorpay': 'api', 'paypal': 'api', 'stripe': 'api', 'webhook': 'webhook', 'api': 'api' };
        const dbSource = sourceMap[(source || 'manual').toLowerCase()] || 'manual';

        const stmt = db.prepare(`
            INSERT INTO revenue_transactions (account_id, transaction_id, customer_email, product, country, country_code, amount, source, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            accountId,
            transaction_id || null,
            customer_email || null,
            product || null,
            country || null,
            country_code || null,
            parseFloat(amount),
            dbSource,
            notes || null,
            created_at || new Date().toISOString()
        );

        res.json({
            success: true,
            data: { id: result.lastInsertRowid },
            message: 'Revenue entry added successfully'
        });
    } catch (error) {
        console.error('Add revenue error:', error);
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ success: false, error: 'A transaction with this ID already exists' });
        }
        res.status(500).json({ success: false, error: error.message || 'Failed to add revenue entry' });
    }
});

// GET /api/revenue/:accountId - Get revenue/sales data
router.get('/:accountId', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { startDate, endDate, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                rt.*,
                c.name as campaign_name
            FROM revenue_transactions rt
            LEFT JOIN campaigns c ON rt.campaign_id = c.id
            WHERE rt.account_id = ?
        `;
        const params = [accountId];

        if (startDate) {
            query += ` AND DATE(rt.created_at) >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND DATE(rt.created_at) <= ?`;
            params.push(endDate);
        }

        // Get total count
        const countQuery = query.replace('rt.*,\n                c.name as campaign_name', 'COUNT(*) as total');
        const totalResult = db.prepare(countQuery).get(...params);
        const total = totalResult?.total || 0;

        // Add pagination
        query += ` ORDER BY rt.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const transactions = db.prepare(query).all(...params);

        res.json({
            success: true,
            data: {
                transactions,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get revenue error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get revenue data'
        });
    }
});

// GET /api/revenue/:accountId/summary - Get revenue summary
router.get('/:accountId/summary', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { startDate, endDate } = req.query;

        let query = `
            SELECT
                SUM(amount) as total_revenue,
                COUNT(*) as total_transactions,
                AVG(amount) as avg_transaction,
                MAX(amount) as max_transaction
            FROM revenue_transactions
            WHERE account_id = ?
        `;
        const params = [accountId];

        if (startDate) {
            query += ` AND DATE(created_at) >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND DATE(created_at) <= ?`;
            params.push(endDate);
        }

        const summary = db.prepare(query).get(...params);

        // Get daily breakdown
        let dailyQuery = `
            SELECT
                DATE(created_at) as date,
                SUM(amount) as revenue,
                COUNT(*) as transactions
            FROM revenue_transactions
            WHERE account_id = ?
        `;
        const dailyParams = [accountId];

        if (startDate) {
            dailyQuery += ` AND DATE(created_at) >= ?`;
            dailyParams.push(startDate);
        }

        if (endDate) {
            dailyQuery += ` AND DATE(created_at) <= ?`;
            dailyParams.push(endDate);
        }

        dailyQuery += ` GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC LIMIT 30`;

        const dailyBreakdown = db.prepare(dailyQuery).all(...dailyParams);

        res.json({
            success: true,
            data: {
                summary: {
                    totalRevenue: summary?.total_revenue || 0,
                    totalTransactions: summary?.total_transactions || 0,
                    avgTransaction: summary?.avg_transaction || 0,
                    maxTransaction: summary?.max_transaction || 0
                },
                dailyBreakdown
            }
        });
    } catch (error) {
        console.error('Get revenue summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get revenue summary'
        });
    }
});

// GET /api/revenue/:accountId/by-campaign - Get revenue by campaign
router.get('/:accountId/by-campaign', checkAccountAccess, (req, res) => {
    try {
        const { accountId } = req.params;
        const { startDate, endDate } = req.query;

        let query = `
            SELECT
                c.id,
                c.name,
                SUM(rt.amount) as total_revenue,
                COUNT(rt.id) as transactions
            FROM campaigns c
            LEFT JOIN revenue_transactions rt ON c.id = rt.campaign_id
            WHERE c.account_id = ?
        `;
        const params = [accountId];

        if (startDate) {
            query += ` AND (DATE(rt.created_at) >= ? OR rt.created_at IS NULL)`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND (DATE(rt.created_at) <= ? OR rt.created_at IS NULL)`;
            params.push(endDate);
        }

        query += ` GROUP BY c.id ORDER BY total_revenue DESC`;

        const campaigns = db.prepare(query).all(...params);

        res.json({
            success: true,
            data: campaigns
        });
    } catch (error) {
        console.error('Get revenue by campaign error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get revenue by campaign'
        });
    }
});

// DELETE /api/revenue/:accountId/:entryId - Delete a revenue entry
router.delete('/:accountId/:entryId', checkAccountAccess, (req, res) => {
    try {
        const { accountId, entryId } = req.params;

        const result = db.prepare('DELETE FROM revenue_transactions WHERE id = ? AND account_id = ?').run(entryId, accountId);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Entry not found' });
        }

        res.json({ success: true, message: 'Revenue entry deleted successfully' });
    } catch (error) {
        console.error('Delete revenue error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete revenue entry' });
    }
});

// PUT /api/revenue/:accountId/:entryId - Update a revenue entry
router.put('/:accountId/:entryId', checkAccountAccess, (req, res) => {
    try {
        const { accountId, entryId } = req.params;
        const { transaction_id, customer_email, product, country, country_code, amount, source, created_at, notes } = req.body;

        const sourceMap = { 'manual': 'manual', 'razorpay': 'api', 'paypal': 'api', 'stripe': 'api', 'webhook': 'webhook', 'api': 'api' };
        const dbSource = sourceMap[(source || 'manual').toLowerCase()] || 'manual';

        const result = db.prepare(`
            UPDATE revenue_transactions
            SET transaction_id = ?, customer_email = ?, product = ?, country = ?, country_code = ?, amount = ?, source = ?, notes = ?, created_at = ?
            WHERE id = ? AND account_id = ?
        `).run(
            transaction_id || null,
            customer_email || null,
            product || null,
            country || null,
            country_code || null,
            parseFloat(amount),
            dbSource,
            notes || null,
            created_at || new Date().toISOString(),
            entryId,
            accountId
        );

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Entry not found' });
        }

        res.json({ success: true, message: 'Revenue entry updated successfully' });
    } catch (error) {
        console.error('Update revenue error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to update revenue entry' });
    }
});

module.exports = router;
