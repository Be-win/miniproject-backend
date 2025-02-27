const pool = require("./connection");

const Garden = {
    async getGardens({search, type, limit, offset, ownerId}) {
        try {
            const whereClauses = [];
            const values = [];
            let paramIndex = 1;

            // Always include search condition
            whereClauses.push(`LOWER(g.name) LIKE LOWER($${paramIndex++})`);
            values.push(`%${search}%`);

            if (type) {
                whereClauses.push(`g.type = $${paramIndex++}`);
                values.push(type);
            }

            if (ownerId) {
                whereClauses.push(`g.owner_id = $${paramIndex++}`);
                values.push(ownerId);
            }

            const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            const query = `
                SELECT g.*,
                       ST_X(ST_AsEWKT(g.location)::geometry) AS longitude,
                       ST_Y(ST_AsEWKT(g.location)::geometry) AS latitude,
                       COALESCE(
                               (SELECT gi.image_url
                                FROM garden_images gi
                                WHERE gi.garden_id = g.id
                                ORDER BY gi.uploaded_at
                                LIMIT 1),
                               'https://placehold.co/600x400?text=No+Image'
                       )                                     as image_url
                FROM gardens g
                    ${where}
                ORDER BY g.created_at DESC
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

    async getTotalCount({search, type, ownerId}) {
        try {
            const whereClauses = [];
            const values = [];
            let paramIndex = 1;

            whereClauses.push(`LOWER(name) LIKE LOWER($${paramIndex++})`);
            values.push(`%${search}%`);

            if (type) {
                whereClauses.push(`type = $${paramIndex++}`);
                values.push(type);
            }

            if (ownerId) {
                whereClauses.push(`owner_id = $${paramIndex++}`);
                values.push(ownerId);
            }

            const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            const query = `
                SELECT COUNT(*)
                FROM gardens ${where}
            `;

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
                INSERT INTO gardens (owner_id,
                                     name,
                                     description,
                                     location,
                                     address,
                                     total_land,
                                     type)
                VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8)
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
                    INSERT INTO garden_images (garden_id, image_url)
                    VALUES
                    ${gardenData.images.map((_, i) => `($1, $${i + 2})`).join(',')}
                `;

                const imageValues = [newGarden.id, ...gardenData.images];
                await client.query(imageQuery, imageValues);
            }

            // Insert garden features
            const featureQuery = `
                INSERT INTO garden_features (garden_id, soil_type, irrigation, electricity, previous_crops)
                VALUES ($1, $2, $3, $4, $5)
            `;
            await client.query(featureQuery, [
                newGarden.id,
                gardenData.soil_type || null,
                gardenData.irrigation,
                gardenData.electricity,
                gardenData.previous_crops || null
            ]);

            await client.query('COMMIT');
            const {getGardenById} = require("./gardenModel");
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
    async createLandRequest(landReqData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Insert land request
            const landRequestQuery = `
                INSERT INTO land_requests (garden_id,
                                           user_id,
                                           requested_land,
                                           contact_info,
                                           message,
                                           status)
                VALUES ($1, $2, $3, $4, $5, 'pending')
                RETURNING *;
            `;
            const values = [
                landReqData.garden_id,
                landReqData.user_id,
                landReqData.requested_land,
                landReqData.contact_info,
                landReqData.message
            ];

            const {rows} = await client.query(landRequestQuery, values);
            await client.query('COMMIT');
            return rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Transaction error:', error);
            throw new Error('Failed to create land request');
        } finally {
            client.release();
        }
    },

    async getLandRequestWithGarden(requestId) {
        try {
            const query = `
                SELECT lr.*,
                       g.id         AS garden_id,
                       g.owner_id,
                       g.name       AS garden_name,
                       g.total_land,
                       g.allocated_land,
                       g.address,
                       g.type       AS garden_type,
                       g.created_at AS garden_created
                FROM land_requests lr
                         JOIN gardens g ON lr.garden_id = g.id
                WHERE lr.id = $1
            `;

            const {rows} = await pool.query(query, [requestId]);

            if (rows.length === 0) return null;

            // Structure the result
            const landRequest = {
                ...rows[0],
                Garden: {
                    id: rows[0].garden_id,
                    owner_id: rows[0].owner_id,
                    name: rows[0].garden_name,
                    total_land: rows[0].total_land,
                    allocated_land: rows[0].allocated_land,
                    address: rows[0].address,
                    type: rows[0].garden_type,
                    created_at: rows[0].garden_created
                }
            };

            // Remove duplicated fields
            delete landRequest.garden_id;
            delete landRequest.owner_id;
            delete landRequest.garden_name;
            delete landRequest.total_land;
            delete landRequest.allocated_land;
            delete landRequest.address;
            delete landRequest.garden_type;
            delete landRequest.garden_created;

            return landRequest;
        } catch (err) {
            console.error("Database error:", err);
            throw new Error("Failed to fetch land request with garden");
        }
    },

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
                u.name AS owner_name,
                ST_X(g.location::geometry) AS longitude,
                ST_Y(g.location::geometry) AS latitude,
                COALESCE(
                                jsonb_agg(gi.* ORDER BY gi.uploaded_at)
                                FILTER (WHERE gi.garden_id IS NOT NULL),
                                '[]'::jsonb
                ) AS images,
                gf.soil_type,
                gf.irrigation,
                gf.electricity,
                gf.previous_crops
            FROM gardens g
                     JOIN users u ON g.owner_id = u.id
                     LEFT JOIN garden_images gi ON g.id = gi.garden_id
                     LEFT JOIN garden_features gf ON g.id = gf.garden_id
            WHERE g.id = $1
            GROUP BY g.id, u.name, gf.garden_id;
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