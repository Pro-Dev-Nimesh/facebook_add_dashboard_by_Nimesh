require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const facebookRoutes = require('./routes/facebook');
const facebookDataRoutes = require('./routes/facebookData');
const revenueRoutes = require('./routes/revenue');
const leadsRoutes = require('./routes/leads');
const alertsRoutes = require('./routes/alerts');
const webhooksRoutes = require('./routes/webhooks');
const settingsRoutes = require('./routes/settings');
const usersRoutes = require('./routes/users');
const syncRoutes = require('./routes/sync');

// Import database initialization
const { initializeDatabase } = require('./models/database');

// Import cron jobs
const { initializeCronJobs } = require('./services/cronJobs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, or file://)
        if (!origin) return callback(null, true);

        // Allow localhost on any port for development
        const allowedPatterns = [
            /^http:\/\/localhost(:\d+)?$/,
            /^http:\/\/127\.0\.0\.1(:\d+)?$/,
            /^file:\/\//
        ];

        const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
        if (isAllowed) {
            return callback(null, true);
        }

        // Also allow the configured frontend URL
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
        if (origin === frontendUrl) {
            return callback(null, true);
        }

        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/fb', facebookDataRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sync', syncRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Test FB route
app.get('/api/fb-test', (req, res) => {
    res.json({ test: 'FB route works' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database
        console.log('Initializing database...');
        initializeDatabase();
        console.log('Database initialized successfully');

        // Initialize cron jobs for daily sync
        initializeCronJobs();
        console.log('Cron jobs initialized');

        // Start server
        app.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`  Facebook Ads Dashboard Backend`);
            console.log(`  Server running on http://localhost:${PORT}`);
            console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`========================================\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
