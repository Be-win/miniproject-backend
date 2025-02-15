const pool = require("./connection");

const Garden = {
    async getGardens({ search, type, limit, offset }) {
        try {
            let query = `
                SELECT
                    g.*,
                    ST_X(ST_AsEWKT(g.location)::geometry) AS longitude,
                    ST_Y(ST_AsEWKT(g.location)::geometry) AS latitude,
                    COALESCE(
                            (SELECT gi.image_url
                             FROM garden_images gi
                             WHERE gi.garden_id = g.id
                             ORDER BY gi.uploaded_at
                             LIMIT 1),
                            'default-garden.jpg'
                    ) as image_url
                FROM gardens g
                WHERE LOWER(g.name) LIKE LOWER($1)
            `;

            const values = [`%${search}%`];
            let paramIndex = 2;

            if (type) {
                query += ` AND g.type = $${paramIndex++}::text`;
                values.push(type);
            }

            query += `
                ORDER BY g.id
                LIMIT $${paramIndex++}
                OFFSET $${paramIndex++}
            `;
            values.push(limit, offset);

            const result = await pool.query(query, values);
            return result.rows;
        } catch (err) {
            console.error("Database error:", err);
            throw new Error("Failed to fetch gardens");
        }
    },

    async getTotalCount({ search, type }) {
        try {
            let query = `
                SELECT COUNT(*)
                FROM gardens
                WHERE LOWER(name) LIKE LOWER($1)
            `;
            const values = [`%${search}%`];
            let paramIndex = 2;

            if (type) {
                query += ` AND type = $${paramIndex++}`;
                values.push(type);
            }

            const result = await pool.query(query, values);
            return parseInt(result.rows[0].count, 10);
        } catch (err) {
            console.error("Database error:", err);
            throw new Error("Failed to get garden count");
        }
    },

    async createWithTransaction(gardenData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create geography point
            // const pointQuery = `
            //     ST_SetSRID(ST_MakePoint($1, $2), 4326)
            // `;

            // Insert garden
            const gardenQuery = `
                INSERT INTO gardens (
                    owner_id,
                    name,
                    description,
                    location,
                    address,
                    total_land,
                    type
                ) VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8)
                RETURNING *;
            `;

            // Correct parameter order: address is $6, total_land $7, type $8
            const gardenValues = [
                gardenData.owner_id,
                gardenData.name,
                gardenData.description,
                gardenData.longitude, // $4: longitude
                gardenData.latitude,   // $5: latitude
                gardenData.address,
                gardenData.total_land,
                gardenData.type || 'community'
            ];

            const gardenResult = await client.query(gardenQuery, gardenValues);
            const newGarden = gardenResult.rows[0];

            // Insert images if any
            if (gardenData.images && gardenData.images.length > 0) {
                const imageQuery = `
                    INSERT INTO garden_images (garden_id, image_url) VALUES ${gardenData.images.map((_, i) => `($1, $${i + 2})`).join(',')}
                `;

                const imageValues = [newGarden.id, ...gardenData.images];
                await client.query(imageQuery, imageValues);
            }

            await client.query('COMMIT');
            const { getGardenById } = require("./gardenModel");
            return getGardenById(newGarden.id);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Transaction error:', error);
            throw new Error('Failed to create garden');
        } finally {
            client.release();
        }
    },

    //Helper method for creating point
    // createPoint(longitude, latitude) {
    //     return `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;
    // }
};

// Add image upload related functions
const GardenImage = {
    async uploadImage(gardenId, imageUrl) {
        try {
            const query = `
                INSERT INTO garden_images (garden_id, image_url)
                VALUES ($1, $2)
                RETURNING *;
            `;
            const result = await pool.query(query, [gardenId, imageUrl]);
            return result.rows[0];
        } catch (error) {
            console.error('Image upload failed:', error);
            throw new Error('Failed to save image');
        }
    }
};

const getGardenById = async (id) => {
    try {
        const query = `
            SELECT
                g.*,
                ST_X(ST_AsEWKT(g.location)::geometry) AS longitude,
                ST_Y(ST_AsEWKT(g.location)::geometry) AS latitude,
                COALESCE(
                    jsonb_agg(gi.* ORDER BY gi.uploaded_at) 
                    FILTER (WHERE gi.garden_id IS NOT NULL), 
                    '[]'::jsonb
                ) AS images
            FROM gardens g
            LEFT JOIN garden_images gi ON g.id = gi.garden_id
            WHERE g.id = $1
            GROUP BY g.id;
        `;

        const { rows } = await pool.query(query, [id]);
        return rows[0] || null;
    } catch (err) {
        console.error("Database error:", err);
        throw new Error("Failed to fetch garden details");
    }
};

module.exports = {
    Garden,
    GardenImage,
    getGardenById
};