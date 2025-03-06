const pool = require('./connection');

const Review = {
    async getByGardenId(gardenId) {
        try {
            const result = await pool.query(
                `SELECT r.*, u.name AS user_name 
                FROM reviews r 
                JOIN users u ON r.user_id = u.id 
                WHERE garden_id = $1 
                ORDER BY created_at DESC`,
                [gardenId]
            );
            return result.rows;
        } catch (error) {
            throw error;
        }
    },

    async create(reviewData) {
        try {
            const result = await pool.query(
                `INSERT INTO reviews 
                (user_id, garden_id, rating, comment) 
                VALUES ($1, $2, $3, $4) 
                RETURNING *`,
                [reviewData.user_id, reviewData.garden_id, reviewData.rating, reviewData.comment]
            );
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    },

    async checkAllocation(userId, gardenId) {
        try {
            const result = await pool.query(
                `SELECT 1 FROM land_requests 
                WHERE garden_id = $1 AND user_id = $2 
                AND status IN ('approved', 'expired', 'active', 'pending_extension')`,
                [gardenId, userId]
            );
            return result.rows.length > 0;
        } catch (error) {
            throw error;
        }
    },

    async checkExistingReview(userId, gardenId) {
        try {
            const result = await pool.query(
                `SELECT 1 FROM reviews 
                WHERE garden_id = $1 AND user_id = $2`,
                [gardenId, userId]
            );
            return result.rows.length > 0;
        } catch (error) {
            throw error;
        }
    }
};

module.exports = Review;