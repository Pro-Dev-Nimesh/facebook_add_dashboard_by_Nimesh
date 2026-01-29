const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const SyncService = require('../services/syncService');

const router = express.Router();

// Apply authentication
router.use(authenticateToken);

// POST /api/sync/:fbAccountId - Trigger manual sync for an account
router.post('/:fbAccountId', async (req, res) => {
    try {
        const { fbAccountId } = req.params;
        console.log(`[API] Manual sync requested for ${fbAccountId}`);

        const syncService = new SyncService();
        const results = await syncService.fullSync(fbAccountId);

        res.json({
            success: true,
            message: 'Sync completed successfully',
            data: results
        });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Sync failed'
        });
    }
});

// POST /api/sync/:fbAccountId/campaigns - Sync only campaigns
router.post('/:fbAccountId/campaigns', async (req, res) => {
    try {
        const { fbAccountId } = req.params;
        const syncService = new SyncService();
        const result = await syncService.syncCampaigns(fbAccountId);

        res.json({
            success: result.success,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/sync/:fbAccountId/adsets - Sync only ad sets
router.post('/:fbAccountId/adsets', async (req, res) => {
    try {
        const { fbAccountId } = req.params;
        const syncService = new SyncService();
        const result = await syncService.syncAdSets(fbAccountId);

        res.json({
            success: result.success,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/sync/:fbAccountId/ads - Sync only ads
router.post('/:fbAccountId/ads', async (req, res) => {
    try {
        const { fbAccountId } = req.params;
        const syncService = new SyncService();
        const result = await syncService.syncAds(fbAccountId);

        res.json({
            success: result.success,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
