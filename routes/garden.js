const express = require("express");
const router = express.Router();
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

module.exports = router;