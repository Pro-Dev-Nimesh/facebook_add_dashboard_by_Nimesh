const express = require('express');
const { db } = require('../models/database');
const { authenticateToken, checkAccountAccess } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

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
            query += ` AND rt.transaction_date >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND rt.transaction_date <= ?`;
            params.push(endDate);
        }

        // Get total count
        const countQuery = query.replace('rt.*,\n                c.name as campaign_name', 'COUNT(*) as total');
        const totalResult = db.prepare(countQuery).get(...params);
        const total = totalResult?.total || 0;

        // Add pagination
        query += ` ORDER BY rt.transaction_date DESC LIMIT ? OFFSET ?`;
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
            query += ` AND transaction_date >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND transaction_date <= ?`;
            params.push(endDate);
        }

        const summary = db.prepare(query).get(...params);

        // Get daily breakdown
        let dailyQuery = `
            SELECT
                transaction_date as date,
                SUM(amount) as revenue,
                COUNT(*) as transactions
            FROM revenue_transactions
            WHERE account_id = ?
        `;
        const dailyParams = [accountId];

        if (startDate) {
            dailyQuery += ` AND transaction_date >= ?`;
            dailyParams.push(startDate);
        }

        if (endDate) {
            dailyQuery += ` AND transaction_date <= ?`;
            dailyParams.push(endDate);
        }

        dailyQuery += ` GROUP BY transaction_date ORDER BY transaction_date DESC LIMIT 30`;

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
            query += ` AND (rt.transaction_date >= ? OR rt.transaction_date IS NULL)`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND (rt.transaction_date <= ? OR rt.transaction_date IS NULL)`;
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

module.exports = router;
