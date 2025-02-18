const express = require("express");
const router = express.Router();
const pool = require('../models/connection');
const {Garden, getGardenById, GardenImage} = require("../models/gardenModel");
const AWS = require("aws-sdk");
const authenticate = require("../middleware/authenticateToken");
const validateRequest = require("../middleware/validateRequest");
const {body, validationResult} = require('express-validator');
const cron = require('node-cron');
const fileUpload = require('express-fileupload');

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Image upload endpoint
router.post("/upload-image", authenticate, async (req, res) => {
    try {
        // console.log("Request headers:", req.headers); // Log headers
        // console.log("Request body:", req.body); // Log body
        // console.log("Request files:", req.files); // Log files

        if (!req.files || !req.files.image) {
            return res.status(400).json({error: "No image file provided"});
        }

        const file = req.files.image;
        // console.log("File details:", file); // Log file details

        const fileExtension = file.name.split(".").pop();
        const fileName = `gardens/${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExtension}`;

        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileName,
            Body: file.data,
            ContentType: file.mimetype,
        };

        const result = await s3.upload(params).promise();
        res.json({imageUrl: result.Location});
    } catch (error) {
        console.error("Image upload failed:", error);
        res.status(500).json({error: error.message || "Failed to upload image"});
    }
});

// Create garden endpoint
router.post("/create-garden", authenticate, validateRequest, async (req, res) => {
    console.error("Request Body:", req.body);
    try {
        const {
            name,
            description,
            address,
            latitude,
            longitude,
            total_land,
            type,
            images,
        } = req.body;

        // Create garden with transaction
        const result = await Garden.createWithTransaction({
            owner_id: req.user.id,
            name,
            description,
            address,
            longitude,
            latitude,
            total_land,
            type: type || "community",
            images
        });

        res.status(201).json({
            message: "Garden created successfully",
            data: result
        });
    } catch (error) {
        console.error("Garden creation failed:", error);
        res.status(500).json({error: error.message || "Failed to create garden"});
    }
});

// Get gardens with search, filter, and pagination
router.get("/", async (req, res) => {
    try {
        // Validate and parse input parameters
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const search = req.query.search?.toString() || "";
        const type = req.query.type?.toString() || "";

        if (page < 1 || limit < 1) {
            return res.status(400).json({
                error: "Invalid pagination parameters"
            });
        }

        const offset = (page - 1) * limit;

        // Get data in parallel
        const [gardens, total] = await Promise.all([
            Garden.getGardens({search, type, limit, offset}),
            Garden.getTotalCount({search, type})
        ]);

        const totalPages = Math.ceil(total / limit);

        res.json({
            data: gardens,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasMore: page < totalPages
            }
        });

    } catch (error) {
        console.error("Error fetching gardens:", error);
        res.status(500).json({
            error: error.message || "Failed to fetch gardens"
        });
    }
});

// Get garden profile by ID
router.get("/:id", async (req, res) => {
    try {
        // Validate ID parameter
        const gardenId = parseInt(req.params.id, 10);
        if (isNaN(gardenId) || gardenId < 1) {
            return res.status(400).json({
                error: "Invalid garden ID format"
            });
        }

        const garden = await getGardenById(gardenId);

        if (!garden) {
            return res.status(404).json({
                error: "Garden not found"
            });
        }

        res.json({data: garden});

    } catch (error) {
        console.error("Error fetching garden profile:", error);
        res.status(500).json({
            error: error.message || "Failed to fetch garden details"
        });
    }
});

// Create land request with date validation
router.post("/:id/requests", authenticate, [
    body('requested_land').isFloat({min: 0.01}),
    body('start_date')
        .isDate({ format: 'YYYY-MM-DD' })
        .withMessage('Start date must be in YYYY-MM-DD format'),
    body('end_date')
        .isDate({ format: 'YYYY-MM-DD' })
        .withMessage('End date must be in YYYY-MM-DD format'),
    body('contact_info').isLength({min: 3}),
    body('message').isLength({min: 10})
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({errors: errors.array()});
        }

        const gardenId = parseInt(req.params.id, 10);
        const {
            requested_land,
            message,
            contact_info,
            start_date,
            end_date
        } = req.body;
        const userId = req.user.id;

        // Date validation
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (startDate >= endDate) {
            return res.status(400).json({error: "End date must be after start date"});
        }

        // Check for existing requests
        const existingRequest = await pool.query(
            `SELECT id
             FROM land_requests
             WHERE garden_id = $1
               AND user_id = $2
               AND status IN ('pending', 'approved', 'active')
               AND (start_date, end_date) OVERLAPS ($3, $4)`,
            [gardenId, userId, start_date, end_date]
        );

        if (existingRequest.rows.length > 0) {
            return res.status(409).json({
                error: "Existing active/pending request for this period"
            });
        }

        // Get garden details
        const garden = await getGardenById(gardenId);
        if (!garden) return res.status(404).json({error: "Garden not found"});

        // Land availability check
        const availableLand = garden.total_land - garden.allocated_land;
        if (requested_land > availableLand) {
            return res.status(400).json({
                error: `Only ${availableLand} units available`,
                max_available: availableLand
            });
        }

        // Create request
        const newRequest = await pool.query(
            `INSERT INTO land_requests (garden_id,
                                        user_id,
                                        requested_land,
                                        message,
                                        contact_info,
                                        start_date,
                                        end_date,
                                        status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
             RETURNING *`,
            [
                gardenId,
                userId,
                requested_land,
                message,
                contact_info,
                start_date,
                end_date
            ]
        );

        // Create notification
        await pool.query(
            `INSERT INTO land_allocation_notifications (user_id,
                                                        from_user,
                                                        garden_id,
                                                        type,
                                                        message)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                garden.owner_id,
                userId,
                gardenId,
                'request',
                `New land request for ${garden.name} (${requested_land} units)`
            ]
        );

        res.status(201).json({
            message: "Request submitted for approval",
            data: newRequest.rows[0]
        });

    } catch (error) {
        console.error("Land request error:", error);
        res.status(500).json({error: "Internal server error"});
    }
});


// Update request status (approve/reject/expire)
router.patch("/requests/:id", authenticate, async (req, res) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        const {status} = req.body;

        // Validate input
        if (!['approved', 'rejected', 'expired', 'active'].includes(status)) {
            return res.status(400).json({error: "Invalid status"});
        }

        // Get request with garden details
        const request = await pool.query(
            `SELECT lr.*, g.owner_id, g.allocated_land, g.total_land
             FROM land_requests lr
                      JOIN gardens g ON lr.garden_id = g.id
             WHERE lr.id = $1`,
            [requestId]
        );

        if (!request.rows[0]) return res.status(404).json({error: "Request not found"});
        const currentRequest = request.rows[0];

        // Authorization check
        if (currentRequest.owner_id !== req.user.id) {
            return res.status(403).json({error: "Unauthorized"});
        }

        await pool.query('BEGIN');

        if (status === 'approved') {
            // Check available land
            const availableLand = currentRequest.total_land - currentRequest.allocated_land;
            if (currentRequest.requested_land > availableLand) {
                await pool.query('ROLLBACK');
                return res.status(400).json({
                    error: `Only ${availableLand} units available`,
                    max_available: availableLand
                });
            }

            // Determine if request should be active based on dates
            const now = new Date();
            const isActive = now >= new Date(currentRequest.start_date) &&
                now <= new Date(currentRequest.end_date);

            // Update garden allocation
            await pool.query(
                `UPDATE gardens
                 SET allocated_land = allocated_land + $1
                 WHERE id = $2`,
                [currentRequest.requested_land, currentRequest.garden_id]
            );

            // Expire overlapping requests (excluding current one)
            await pool.query(
                `UPDATE land_requests
                 SET status = 'expired'
                 WHERE garden_id = $1
                   AND user_id = $2
                   AND id != $5
                   AND status = 'active'
                   AND (start_date, end_date) OVERLAPS ($3, $4)`,
                [
                    currentRequest.garden_id,
                    currentRequest.user_id,
                    currentRequest.start_date,
                    currentRequest.end_date,
                    requestId
                ]
            );

            // Set status to active or approved based on dates
            await pool.query(
                `UPDATE land_requests
                 SET status = $1
                 WHERE id = $2`,
                [isActive ? 'active' : 'approved', requestId]
            );
        } else {
            // Handle other status updates
            await pool.query(
                `UPDATE land_requests
                 SET status = $1
                 WHERE id = $2`,
                [status, requestId]
            );
        }

        await pool.query('COMMIT');

        // Create notification
        let notificationMessage;
        if (status === 'approved') {
            notificationMessage = `Your land request for ${currentRequest.requested_land} units 
                                  (${currentRequest.start_date} to ${currentRequest.end_date}) 
                                  was approved`;
        } else {
            notificationMessage = `Your land request status changed to ${status}`;
        }

        await pool.query(
            `INSERT INTO land_allocation_notifications (user_id, from_user, garden_id, type, message)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                currentRequest.user_id,
                req.user.id,
                currentRequest.garden_id,
                'status_update',
                notificationMessage
            ]
        );

        res.json({
            message: `Request ${status} successfully`,
            data: {...currentRequest, status}
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("Status update error:", error);
        res.status(500).json({error: "Internal server error"});
    }
});

// Get land request details by request ID
router.get("/requests/:requestId", authenticate, async (req, res) => {
    try {
        const requestId = parseInt(req.params.requestId, 10);
        if (isNaN(requestId)) {
            return res.status(400).json({error: "Invalid request ID"});
        }

        // Retrieve the land request along with its associated garden details
        const landRequest = await Garden.getLandRequestWithGarden(requestId);
        if (!landRequest) {
            return res.status(404).json({error: "Land request not found"});
        }

        // Authorization check:
        // Allow access if the current user is the requester OR the owner of the garden.
        if (req.user.id !== landRequest.user_id && req.user.id !== landRequest.Garden.owner_id) {
            return res.status(403).json({error: "Unauthorized"});
        }

        res.json({data: landRequest});
    } catch (error) {
        console.error("Error fetching land request:", error);
        res.status(500).json({error: error.message || "Failed to fetch land request"});
    }
});

// Extension request endpoint
router.post("/requests/:id/extend", authenticate, [
    body('end_date').isDate(),
    body('message').isLength({ min: 10 })
], async (req, res) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        const { end_date, message } = req.body;

        // Get request with current dates
        const request = await pool.query(`
            SELECT *, g.owner_id
            FROM land_requests lr
                     JOIN gardens g ON lr.garden_id = g.id
            WHERE lr.id = $1
        `, [requestId]);

        if (!request.rows[0]) {
            return res.status(404).json({ error: "Request not found" });
        }

        const currentData = request.rows[0];

        // Validate new date
        const newEndDate = new Date(end_date);
        const currentEndDate = new Date(currentData.end_date);
        if (newEndDate <= currentEndDate) {
            return res.status(400).json({
                error: "New end date must be after current end date"
            });
        }

        // Store original dates and set status
        const updatedRequest = await pool.query(`
            UPDATE land_requests
            SET previous_end_date = end_date,
                proposed_end_date = $1,
                status = 'pending_extension',
                extension_message = $2
            WHERE id = $3
            RETURNING *
        `, [end_date, message, requestId]);

        // Notification
        await pool.query(`
            INSERT INTO land_allocation_notifications (
                user_id, from_user, garden_id, type, message, request_id
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            currentData.owner_id,
            req.user.id,
            currentData.garden_id,
            'extension_request',
            // Use proposed_end_date from the updated request data
            `Extension request for ${currentData.requested_land} units until ${updatedRequest.rows[0].proposed_end_date}`,
            requestId
        ]);

        res.json({ message: "Extension request submitted", data: updatedRequest.rows[0] });
    } catch (error) {
        console.error("Extension error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


// Expiration cron job (runs daily at midnight)
cron.schedule('0 0 * * *', async () => {
    try {
        await pool.query('BEGIN');

        // 1. Activate approved requests that have started
        await pool.query(`
            UPDATE land_requests
            SET status = 'active'
            WHERE status = 'approved'
              AND start_date <= CURRENT_DATE
              AND end_date >= CURRENT_DATE
        `);

        // 2. Expire ended requests and update gardens in one operation
        await pool.query(`
            WITH expired_requests AS (
                UPDATE land_requests
                    SET status = 'expired'
                    WHERE end_date < CURRENT_DATE
                        AND status = 'active'
                    RETURNING garden_id, requested_land)
            UPDATE gardens g
            SET allocated_land = g.allocated_land - er.requested_land
            FROM expired_requests er
            WHERE g.id = er.garden_id
        `);

        // expiration notifications
        await pool.query(`
            INSERT INTO land_allocation_notifications (user_id, garden_id, type, message)
            SELECT user_id, garden_id, 'expiration', 
                   CONCAT('Your allocation of ', requested_land, ' units has expired')
            FROM land_requests 
            WHERE end_date < CURRENT_DATE 
            AND status = 'active'
        `);

        await pool.query('COMMIT');
        console.log('Cron job executed successfully');
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("Cron job error:", error);
        // Consider adding error monitoring here
    }
});

// New route for handling extension approvals/rejections
router.patch("/requests/:id/extend", authenticate, async (req, res) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        const { status } = req.body;

        // Validate input
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: "Invalid status. Use 'approved' or 'rejected'" });
        }

        // Get request with extension details
        const request = await pool.query(`
            SELECT lr.*, g.owner_id, g.total_land, g.allocated_land
            FROM land_requests lr
            JOIN gardens g ON lr.garden_id = g.id
            WHERE lr.id = $1 AND lr.status = 'pending_extension'
        `, [requestId]);

        if (!request.rows[0]) {
            return res.status(404).json({ error: "Extension request not found or already processed" });
        }

        const currentRequest = request.rows[0];

        // Authorization check
        if (currentRequest.owner_id !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        await pool.query('BEGIN');

        if (status === 'approved') {
            // Update end date and clear proposal
            await pool.query(`
                UPDATE land_requests
                SET 
                    end_date = proposed_end_date,
                    previous_end_date = end_date,
                    proposed_end_date = NULL,
                    status = 'active',
                    extension_message = NULL
                WHERE id = $1
            `, [requestId]);

            // Update garden allocation if extending current active request
            if (currentRequest.status === 'active') {
                await pool.query(`
                    UPDATE gardens
                    SET allocated_land = allocated_land - $1
                    WHERE id = $2
                `, [currentRequest.requested_land, currentRequest.garden_id]);
            }
        } else {
            // Reject extension - reset fields
            await pool.query(`
                UPDATE land_requests
                SET 
                    proposed_end_date = NULL,
                    previous_end_date = NULL,
                    status = 'active',
                    extension_message = NULL
                WHERE id = $1
            `, [requestId]);
        }

        // Create notification
        const notificationMessage = status === 'approved'
            ? `Extension approved: New end date ${currentRequest.proposed_end_date}`
            : `Extension request rejected`;

        await pool.query(`
            INSERT INTO land_allocation_notifications (
                user_id, from_user, garden_id, type, message, request_id
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            currentRequest.user_id,
            req.user.id,
            currentRequest.garden_id,
            'extension_update',
            notificationMessage,
            requestId
        ]);

        await pool.query('COMMIT');
        res.json({
            message: `Extension ${status} successfully`,
            data: { new_end_date: status === 'approved' ? currentRequest.proposed_end_date : null }
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("Extension processing error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


module.exports = router;