const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../models/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Find user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Check password
        const validPassword = bcrypt.compareSync(password, user.password);

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Update last login
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

        // Generate token
        const token = generateToken(user.id);

        // Get user's accounts
        const accounts = db.prepare(`
            SELECT id, name, type, status, last_synced
            FROM ad_accounts
            WHERE user_id = ?
        `).all(user.id);

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token,
                accounts
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// POST /api/auth/signup
router.post('/signup', (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Name, email, and password are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters'
            });
        }

        // Check if email exists
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Hash password
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Create user
        const result = db.prepare(`
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, 'viewer')
        `).run(name, email, hashedPassword);

        // Generate token
        const token = generateToken(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: result.lastInsertRowid,
                    name,
                    email,
                    role: 'viewer'
                },
                token,
                accounts: []
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            error: 'Signup failed'
        });
    }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
    // In a stateless JWT setup, logout is handled client-side
    // Server can optionally blacklist the token
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
    try {
        // Get user's accounts
        const accounts = db.prepare(`
            SELECT id, name, type, status, last_synced
            FROM ad_accounts
            WHERE user_id = ?
        `).all(req.user.id);

        res.json({
            success: true,
            data: {
                user: req.user,
                accounts
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user data'
        });
    }
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Current and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'New password must be at least 6 characters'
            });
        }

        // Get user with password
        const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

        // Verify current password
        const validPassword = bcrypt.compareSync(currentPassword, user.password);

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = bcrypt.hashSync(newPassword, 10);

        // Update password
        db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(hashedPassword, req.user.id);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to change password'
        });
    }
});

module.exports = router;
