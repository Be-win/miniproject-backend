const express = require("express");
const router = express.Router();
const pool = require('../models/connection');
const { Garden, getGardenById, GardenImage } = require("../models/gardenModel");
const AWS = require("aws-sdk");
const authenticate = require("../middleware/authenticateToken");
const validateRequest = require("../middleware/validateRequest");
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
            return res.status(400).json({ error: "No image file provided" });
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
        res.json({ imageUrl: result.Location });
    } catch (error) {
        console.error("Image upload failed:", error);
        res.status(500).json({ error: error.message || "Failed to upload image" });
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
        res.status(500).json({ error: error.message || "Failed to create garden" });
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
            Garden.getGardens({ search, type, limit, offset }),
            Garden.getTotalCount({ search, type })
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

        res.json({ data: garden });

    } catch (error) {
        console.error("Error fetching garden profile:", error);
        res.status(500).json({
            error: error.message || "Failed to fetch garden details"
        });
    }
});

// Modified land request endpoint
router.post("/:id/requests", authenticate, async (req, res) => {
    try {
        const gardenId = parseInt(req.params.id, 10);
        const { requested_land, message, contact_info } = req.body;
        const userId = req.user.id;

        // Check if the user already has a pending land request for this garden
        const existingRequest = await pool.query(
            `SELECT * FROM land_requests WHERE garden_id = $1 AND user_id = $2 AND status = 'pending'`,
            [gardenId, userId]
        );

        if (existingRequest.rows.length > 0) {
            return res.status(400).json({ error: "You already have a pending land request for this garden." });
        }

        const garden = await getGardenById(gardenId);
        if (!garden) {
            return res.status(404).json({ error: "Garden not found" });
        }

        // Validate available land
        const availableLand = garden.total_land - garden.allocated_land;
        if (requested_land > availableLand) {
            return res.status(400).json({
                error: `Requested land exceeds available space (Max: ${availableLand})`
            });
        }

        // Create land request using the new function
        const landRequest = await Garden.createLandRequest({
            garden_id: gardenId,
            user_id: userId,
            requested_land,
            contact_info,
            message
        });

        const userResult = await pool.query(
            `SELECT name FROM users WHERE id = $1`,
            [userId]
        );
        const userName = userResult.rows[0]?.name || "a user";

        // Create notification for garden owner with from_user as the requester
        try {
            await pool.query(`
                INSERT INTO land_allocation_notifications (
                    user_id, from_user, garden_id, type, message
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [
                garden.owner_id,   // Recipient: Garden owner
                userId,            // from_user: The requester
                gardenId,
                'request',
                `New land request for ${garden.name} from ${userName}`
            ]);
        } catch (notificationError) {
            console.error("Failed to create notification:", notificationError);
            // Optionally, add logic to rollback the land request if needed.
        }

        res.status(201).json({
            message: "Land request submitted successfully",
            data: landRequest
        });

    } catch (error) {
        console.error("Land request failed:", error);
        res.status(500).json({
            error: error.message || "Failed to submit request"
        });
    }
});


router.patch("/requests/:requestId", authenticate, async (req, res) => {
    try {
        const requestId = parseInt(req.params.requestId, 10);
        const { status } = req.body;

        // Validate status input
        if (!status) {
            return res.status(400).json({ error: "Status is required" });
        }
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const landRequest = await Garden.getLandRequestWithGarden(requestId);
        if (!landRequest) return res.status(404).json({ error: "Request not found" });
        if (landRequest.Garden.owner_id !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const garden = landRequest.Garden;
        const oldAllocated = parseFloat(garden.allocated_land);
        let newAllocated = oldAllocated;

        if (status === 'approved') {
            newAllocated = oldAllocated + parseFloat(landRequest.requested_land);
            // Update the gardens table using a direct SQL query
            await pool.query(`
                UPDATE gardens
                SET allocated_land = $1, updated_at = NOW()
                WHERE id = $2
            `, [newAllocated, garden.id]);
        }

        // Insert notification for the requester with from_user as the garden owner
        await pool.query(`
            INSERT INTO land_allocation_notifications (
                user_id, from_user, garden_id, type, message, is_read, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
            landRequest.user_id,   // Recipient: The user who made the request
            garden.owner_id,       // from_user: The garden owner
            garden.id,
            'modification',
            `Your land request was ${status}. Previous allocated land: ${oldAllocated}, new allocated land: ${status === 'approved' ? newAllocated : oldAllocated}`,
            false
        ]);

        // Update the land_requests table using an SQL query
        await pool.query(`
            UPDATE land_requests
            SET status = $1, updated_at = NOW()
            WHERE id = $2
        `, [status, requestId]);

        // Optionally, update the local object to reflect the change
        landRequest.status = status;

        res.json({ message: "Request status updated successfully", data: landRequest });
    } catch (error) {
        console.error("Error updating request:", error);
        res.status(500).json({ error: error.message || "Failed to update request" });
    }
});

// Get land request details by request ID
router.get("/requests/:requestId", authenticate, async (req, res) => {
    try {
        const requestId = parseInt(req.params.requestId, 10);
        if (isNaN(requestId)) {
            return res.status(400).json({ error: "Invalid request ID" });
        }

        // Retrieve the land request along with its associated garden details
        const landRequest = await Garden.getLandRequestWithGarden(requestId);
        if (!landRequest) {
            return res.status(404).json({ error: "Land request not found" });
        }

        // Authorization check:
        // Allow access if the current user is the requester OR the owner of the garden.
        if (req.user.id !== landRequest.user_id && req.user.id !== landRequest.Garden.owner_id) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        res.json({ data: landRequest });
    } catch (error) {
        console.error("Error fetching land request:", error);
        res.status(500).json({ error: error.message || "Failed to fetch land request" });
    }
});




module.exports = router;