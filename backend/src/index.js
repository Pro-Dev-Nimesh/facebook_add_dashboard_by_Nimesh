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

// CORS configuration
const corsOptions = {
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
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware - manual preflight handler for Express 5 compatibility
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (req.method === 'OPTIONS') {
        const allowedPatterns = [
            /^http:\/\/localhost(:\d+)?$/,
            /^http:\/\/127\.0\.0\.1(:\d+)?$/,
            /^file:\/\//
        ];
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
        const isAllowed = !origin || allowedPatterns.some(p => p.test(origin)) || origin === frontendUrl;

        if (isAllowed) {
            res.header('Access-Control-Allow-Origin', origin || '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Access-Control-Max-Age', '86400');
            return res.sendStatus(204);
        }
    }
    next();
});
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files (index.html is in project root, one level up from backend/)
const projectRoot = path.join(__dirname, '..', '..');
app.use(express.static(projectRoot));

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

// 404 handler - serve index.html for non-API routes, JSON error for API routes
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'Endpoint not found'
        });
    }
    // Serve frontend for all other routes
    res.sendFile(path.join(projectRoot, 'index.html'));
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

        // Generate alerts from real data on startup
        try {
            const { regenerateAllAlerts } = require('./services/alertGenerator');
            regenerateAllAlerts();
            console.log('Alerts generated from real data');
        } catch (err) {
            console.error('Alert generation error:', err.message);
        }

        // Start server
        app.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`  Facebook Ads Dashboard`);
            console.log(`  Dashboard: http://localhost:${PORT}`);
            console.log(`  API:       http://localhost:${PORT}/api`);
            console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`========================================\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
