const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticateToken");
const pool = require("../models/connection");

router.get("/land-notifications", authenticate, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `
                SELECT
                    n.*,
                    (
                        SELECT lr.id
                        FROM land_requests lr
                        WHERE lr.garden_id = n.garden_id
                        ORDER BY lr.created_at DESC
                        LIMIT 1
                    ) as request_id
                FROM land_allocation_notifications n
                WHERE n.user_id = $1
                ORDER BY created_at DESC
                LIMIT 50
            `,
            [req.user.id]
        );

        res.json({ data: rows });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: error.message || "Failed to fetch notifications" });
    }
});


router.patch("/:notificationId", authenticate, async (req, res) => {
    try {
        const notificationId = parseInt(req.params.notificationId, 10);

        // Mark the notification as read
        const { rows } = await pool.query(`
            UPDATE land_allocation_notifications
            SET is_read = true
            WHERE id = $1
            RETURNING *
        `, [notificationId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Notification not found" });
        }

        // Extract the notification data
        const notification = rows[0];

        if (notification.type === 'request' && notification.from_user) {
            const requestQuery = `
                SELECT status FROM land_requests
                WHERE garden_id = $1 AND user_id = $2
                ORDER BY created_at DESC
                LIMIT 1
            `;
            const requestResult = await pool.query(requestQuery, [notification.garden_id, notification.from_user]);
            if (requestResult.rows.length > 0) {
                notification.request_status = requestResult.rows[0].status;
            }
        }

        res.json({ message: "Notification marked as read", data: notification });
    } catch (error) {
        console.error("Error updating notification:", error);
        res.status(500).json({ error: error.message || "Failed to update notification" });
    }
});



module.exports = router;