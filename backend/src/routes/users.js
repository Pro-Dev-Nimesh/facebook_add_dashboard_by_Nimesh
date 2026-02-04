const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../models/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/users - Get all users (admin only)
router.get('/', requireAdmin, (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                id,
                name,
                email,
                role,
                last_login,
                created_at
            FROM users
        `;
        const params = [];

        if (search) {
            query += ` WHERE name LIKE ? OR email LIKE ?`;
            params.push(`%${search}%`, `%${search}%`);
        }

        // Get total count
        const countQuery = query.replace(
            `id,\n                name,\n                email,\n                role,\n                last_login,\n                created_at`,
            'COUNT(*) as total'
        );
        const totalResult = db.prepare(countQuery).get(...params);
        const total = totalResult?.total || 0;

        // Add pagination
        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const users = db.prepare(query).all(...params);

        // Fetch permissions for each user
        const permStmt = db.prepare(`
            SELECT up.account_id, up.access_level, aa.name as account_name
            FROM user_permissions up
            JOIN ad_accounts aa ON up.account_id = aa.id
            WHERE up.user_id = ?
        `);
        const usersWithPermissions = users.map(user => ({
            ...user,
            permissions: permStmt.all(user.id)
        }));

        res.json({
            success: true,
            data: {
                users: usersWithPermissions,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get users'
        });
    }
});

// GET /api/users/:userId - Get single user
router.get('/:userId', requireAdmin, (req, res) => {
    try {
        const { userId } = req.params;

        const user = db.prepare(`
            SELECT
                id,
                name,
                email,
                role,
                last_login,
                created_at
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get user's account permissions
        const permissions = db.prepare(`
            SELECT
                up.*,
                aa.name as account_name
            FROM user_permissions up
            JOIN ad_accounts aa ON up.account_id = aa.id
            WHERE up.user_id = ?
        `).all(userId);

        res.json({
            success: true,
            data: {
                ...user,
                permissions
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user'
        });
    }
});

// POST /api/users - Create new user (admin only)
router.post('/', requireAdmin, (req, res) => {
    try {
        const { name, email, password, role, account_ids } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
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

        // Use provided password or generate random one (for Google SSO-only users)
        let hashedPassword;
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 6 characters'
                });
            }
            hashedPassword = bcrypt.hashSync(password, 10);
        } else {
            // No password = user can only sign in via Google SSO
            const randomPassword = require('crypto').randomBytes(32).toString('hex');
            hashedPassword = bcrypt.hashSync(randomPassword, 10);
        }

        const validRoles = ['admin', 'editor', 'viewer'];
        const userRole = validRoles.includes(role) ? role : 'viewer';

        const result = db.prepare(`
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, ?)
        `).run(name, email, hashedPassword, userRole);

        const userId = result.lastInsertRowid;

        // Assign account permissions if provided
        if (account_ids && Array.isArray(account_ids) && account_ids.length > 0) {
            const insertPerm = db.prepare(`
                INSERT OR IGNORE INTO user_permissions (user_id, account_id, access_level)
                VALUES (?, ?, ?)
            `);
            const accessLevel = userRole === 'admin' ? 'full' : 'read';
            for (const accountId of account_ids) {
                insertPerm.run(userId, accountId, accessLevel);
            }
        }

        // Return user with permissions
        const permissions = db.prepare(`
            SELECT up.*, aa.name as account_name
            FROM user_permissions up
            JOIN ad_accounts aa ON up.account_id = aa.id
            WHERE up.user_id = ?
        `).all(userId);

        res.status(201).json({
            success: true,
            data: {
                id: userId,
                name,
                email,
                role: userRole,
                permissions
            }
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user'
        });
    }
});

// PUT /api/users/:userId - Update user (admin only)
router.put('/:userId', requireAdmin, (req, res) => {
    try {
        const { userId } = req.params;
        const { name, email, role, password, account_ids } = req.body;

        // Check if user exists
        const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }

        if (email) {
            // Check if email is taken by another user
            const emailTaken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
                .get(email, userId);

            if (emailTaken) {
                return res.status(400).json({
                    success: false,
                    error: 'Email already in use'
                });
            }

            updates.push('email = ?');
            params.push(email);
        }

        if (role) {
            const validRoles = ['admin', 'editor', 'viewer'];
            if (validRoles.includes(role)) {
                updates.push('role = ?');
                params.push(role);
            }
        }

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 6 characters'
                });
            }
            const hashedPassword = bcrypt.hashSync(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        if (updates.length > 0) {
            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(userId);

            db.prepare(`
                UPDATE users
                SET ${updates.join(', ')}
                WHERE id = ?
            `).run(...params);
        }

        // Update account permissions if provided
        if (account_ids && Array.isArray(account_ids)) {
            // Remove existing permissions
            db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);

            // Add new permissions
            if (account_ids.length > 0) {
                const userRole = role || db.prepare('SELECT role FROM users WHERE id = ?').get(userId)?.role || 'viewer';
                const accessLevel = userRole === 'admin' ? 'full' : (userRole === 'editor' ? 'full' : 'read');
                const insertPerm = db.prepare(`
                    INSERT OR IGNORE INTO user_permissions (user_id, account_id, access_level)
                    VALUES (?, ?, ?)
                `);
                for (const accountId of account_ids) {
                    insertPerm.run(userId, accountId, accessLevel);
                }
            }
        }

        // Return updated user with permissions
        const user = db.prepare(`
            SELECT id, name, email, role, last_login, created_at
            FROM users WHERE id = ?
        `).get(userId);

        const permissions = db.prepare(`
            SELECT up.*, aa.name as account_name
            FROM user_permissions up
            JOIN ad_accounts aa ON up.account_id = aa.id
            WHERE up.user_id = ?
        `).all(userId);

        res.json({
            success: true,
            data: { ...user, permissions }
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

// DELETE /api/users/:userId - Delete user (admin only)
router.delete('/:userId', requireAdmin, (req, res) => {
    try {
        const { userId } = req.params;

        // Prevent deleting self
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete your own account'
            });
        }

        // Check if user exists
        const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Delete user permissions first
        db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);

        // Delete user
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);

        res.json({
            success: true,
            message: 'User deleted'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user'
        });
    }
});

// GET /api/users/accounts/list - Get all ad accounts (for user permission forms)
router.get('/accounts/list', requireAdmin, (req, res) => {
    try {
        const accounts = db.prepare(`
            SELECT id, name, type, status
            FROM ad_accounts
            ORDER BY name ASC
        `).all();

        res.json({
            success: true,
            data: accounts
        });
    } catch (error) {
        console.error('Get accounts list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get accounts'
        });
    }
});

// GET /api/users/profile/me - Get current user profile
router.get('/profile/me', (req, res) => {
    try {
        const user = db.prepare(`
            SELECT
                id,
                name,
                email,
                role,
                last_login,
                created_at
            FROM users
            WHERE id = ?
        `).get(req.user.id);

        // Get user's accounts
        const accounts = db.prepare(`
            SELECT
                aa.id,
                aa.name,
                aa.type,
                aa.status,
                up.can_view,
                up.can_edit,
                up.can_export
            FROM ad_accounts aa
            LEFT JOIN user_permissions up ON aa.id = up.account_id AND up.user_id = ?
            WHERE aa.user_id = ? OR up.user_id = ?
        `).all(req.user.id, req.user.id, req.user.id);

        res.json({
            success: true,
            data: {
                ...user,
                accounts
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get profile'
        });
    }
});

// PUT /api/users/profile/me - Update current user profile
router.put('/profile/me', (req, res) => {
    try {
        const { name, email } = req.body;

        const updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }

        if (email) {
            // Check if email is taken by another user
            const emailTaken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
                .get(email, req.user.id);

            if (emailTaken) {
                return res.status(400).json({
                    success: false,
                    error: 'Email already in use'
                });
            }

            updates.push('email = ?');
            params.push(email);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No updates provided'
            });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(req.user.id);

        db.prepare(`
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = ?
        `).run(...params);

        res.json({
            success: true,
            message: 'Profile updated'
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile'
        });
    }
});

module.exports = router;
