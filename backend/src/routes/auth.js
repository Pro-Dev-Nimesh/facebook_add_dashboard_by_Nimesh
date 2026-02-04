const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { db } = require('../models/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
    }, (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails && profile.emails[0] && profile.emails[0].value;
            const name = profile.displayName || email;

            if (!email) {
                return done(null, false, { message: 'No email found in Google profile' });
            }

            // Find or create user
            let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

            if (!user) {
                // Auto-create user with viewer role
                const hashedPassword = bcrypt.hashSync(require('crypto').randomBytes(32).toString('hex'), 10);
                const result = db.prepare(`
                    INSERT INTO users (name, email, password, role)
                    VALUES (?, ?, ?, 'viewer')
                `).run(name, email, hashedPassword);
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
            }

            // Update last login
            db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }));

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => {
        const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
        done(null, user);
    });

    console.log('Google OAuth configured');
} else {
    console.log('Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
}

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

// GET /api/auth/google - Start Google OAuth flow
router.get('/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(503).json({
            success: false,
            error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
        });
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// GET /api/auth/google/callback - Google OAuth callback
router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user) => {
        if (err || !user) {
            // Redirect to login page with error
            return res.redirect('/?error=google_auth_failed');
        }

        // Generate JWT token
        const token = generateToken(user.id);

        // Get user's accounts
        const accounts = db.prepare(`
            SELECT id, name, type, status, last_synced
            FROM ad_accounts
            WHERE user_id = ?
        `).all(user.id);

        // Redirect to frontend with token (frontend will handle storage)
        const userData = encodeURIComponent(JSON.stringify({
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
            token,
            accounts
        }));
        res.redirect(`/?auth=${userData}`);
    })(req, res, next);
});

module.exports = router;
