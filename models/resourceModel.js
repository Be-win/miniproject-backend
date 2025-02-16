const pool = require('./connection');

const Resource = {
    async createResource(resourceData) {
        const query = `
      INSERT INTO resources (
        id, title, description, type, quantity, price, owner_id, 
        created_at, available_from, available_to, contact
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
        const values = [
            resourceData.id,
            resourceData.title,
            resourceData.description,
            resourceData.type,
            resourceData.quantity,
            resourceData.price,
            resourceData.owner_id,
            new Date(),
            resourceData.available_from,
            resourceData.available_to,
            resourceData.contact
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async deleteResource(resourceId, userId) {
        const query = `
      DELETE FROM resources 
      WHERE id = $1 AND owner_id = $2
      RETURNING *
    `;
        const result = await pool.query(query, [resourceId, userId]);
        return result.rows[0];
    },

    async getResources(filter, userId) {
        let query = `
      SELECT r.*, u.name as owner_name 
      FROM resources r
      JOIN users u ON r.owner_id = u.id
    `;

        const params = [];
        let paramCount = 1;

        if (filter === 'myPosts') {
            query += ` WHERE r.owner_id = $${paramCount++}`;
            params.push(userId);
        } else if (filter === 'needed' || filter === 'forSale') {
            query += ` WHERE r.type = $${paramCount++}`;
            params.push(filter);
        }

        query += ' ORDER BY r.created_at DESC';
        const result = await pool.query(query, params);
        return result.rows;
    },

    async createResourceRequest(requestData) {
        const query = `
      INSERT INTO resource_requests (
        id, resource_id, requester_id, requester_contact, 
        message, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
        const values = [
            requestData.id,
            requestData.resource_id,
            requestData.requester_id,
            requestData.requester_contact,
            requestData.message,
            'pending',
            new Date()
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async updateRequestStatus(requestId, status) {
        const query = `
      UPDATE resource_requests
      SET status = $1
      WHERE id = $2
      RETURNING *
    `;
        const result = await pool.query(query, [status, requestId]);
        return result.rows[0];
    }
};

module.exports = Resource;