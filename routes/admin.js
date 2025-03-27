// routes/admin.js
const express = require('express');
const router = express.Router();
const pool = require('../models/connection');
const authenticateToken = require('../middleware/authenticateToken');
const isAdmin = require('../middleware/isAdmin');

router.use(authenticateToken, isAdmin);

// Admin dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const [
            usersCount,
            gardensCount,
            activeRequests,
            resourcesCount,
            recentReviews,
            pendingReports
        ] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users"),
            pool.query("SELECT COUNT(*) FROM gardens"),
            pool.query(`
                SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                       COUNT(*) FILTER (WHERE status = 'active') AS active
                FROM land_requests
            `),
            pool.query("SELECT COUNT(*) FROM resources"),
            pool.query(`
                SELECT r.*, u.name as user_name, g.name as garden_name 
                FROM reviews r
                JOIN users u ON r.user_id = u.id
                JOIN gardens g ON r.garden_id = g.id
                ORDER BY r.created_at DESC LIMIT 5
            `),
            pool.query(`
                SELECT COUNT(*) FROM garden_reports 
                WHERE status = 'pending'
            `)
        ]);

        res.json({
            stats: {
                totalUsers: parseInt(usersCount.rows[0].count),
                totalGardens: parseInt(gardensCount.rows[0].count),
                pendingLandRequests: parseInt(activeRequests.rows[0].pending),
                activeAllocations: parseInt(activeRequests.rows[0].active),
                totalResources: parseInt(resourcesCount.rows[0].count),
                pendingReports: parseInt(pendingReports.rows[0].count)
            },
            recentReviews: recentReviews.rows,
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/reports', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                gr.*,
                reporter_users.name as reporter_name,
                reporter_users.email as reporter_email,
                garden_details.name as garden_name,
                owner_users.name as owner_name
            FROM garden_reports gr
            JOIN gardens garden_details ON gr.garden_id = garden_details.id
            JOIN users reporter_users ON gr.user_id = reporter_users.id
            JOIN users owner_users ON garden_details.owner_id = owner_users.id
            ORDER BY gr.created_at DESC
        `;

        const { rows } = await pool.query(query);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/land-requests', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT lr.*, u.name as user_name, g.name as garden_name 
            FROM land_requests lr
            JOIN users u ON lr.user_id = u.id
            JOIN gardens g ON lr.garden_id = g.id
            ORDER BY lr.created_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching land requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/resource-requests', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT rr.*, r.title as resource_title, u.name as requester_name
            FROM resource_requests rr
            JOIN resources r ON rr.resource_id = r.id
            JOIN users u ON rr.requester_id = u.id
            ORDER BY rr.created_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching resource requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;