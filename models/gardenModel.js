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
    getGardenById,
};