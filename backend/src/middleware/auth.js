const jwt = require('jsonwebtoken');
const { db } = require('../models/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access token required'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user from database
        const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired'
            });
        }
        return res.status(403).json({
            success: false,
            error: 'Invalid token'
        });
    }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
    }
    next();
};

// Middleware to check if user has access to account
const checkAccountAccess = (req, res, next) => {
    const accountId = req.params.accountId || req.body.accountId || req.query.accountId;

    if (!accountId) {
        return next(); // No account specified, continue
    }

    // Admin has access to all accounts
    if (req.user.role === 'admin') {
        return next();
    }

    // Check if user has permission to this account
    const permission = db.prepare(`
        SELECT * FROM user_permissions
        WHERE user_id = ? AND account_id = ?
    `).get(req.user.id, accountId);

    if (!permission) {
        return res.status(403).json({
            success: false,
            error: 'Access denied to this account'
        });
    }

    req.accountPermission = permission;
    next();
};

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

module.exports = {
    authenticateToken,
    requireAdmin,
    checkAccountAccess,
    generateToken
};
