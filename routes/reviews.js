const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticateToken');
const Review = require('../models/reviewModel');

// Get reviews for a garden
router.get('/garden/:gardenId', async (req, res) => {
    try {
        const reviews = await Review.getByGardenId(req.params.gardenId);
        res.json(reviews);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

// Create new review
router.post('/', authenticate, async (req, res) => {
    try {
        const { garden_id, rating, comment } = req.body;

        // Check allocation
        const hasAllocation = await Review.checkAllocation(req.user.id, garden_id);
        if (!hasAllocation) {
            return res.status(403).json({ error: 'You must have an approved allocation to review' });
        }

        // Check existing review
        const hasExisting = await Review.checkExistingReview(req.user.id, garden_id);
        if (hasExisting) {
            return res.status(400).json({ error: 'You already reviewed this garden' });
        }

        // Create review
        const newReview = await Review.create({
            user_id: req.user.id,
            garden_id,
            rating,
            comment
        });

        res.status(201).json(newReview);
    } catch (error) {
        console.error('Error creating review:', error);
        res.status(500).json({ error: 'Failed to create review' });
    }
});

module.exports = router;