const express = require("express");
const router = express.Router();
const { Garden, getGardenById } = require("../models/gardenModel");

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