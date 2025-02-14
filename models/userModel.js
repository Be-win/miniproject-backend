const bcrypt = require("bcrypt");
const pool = require("./connection");

// Function to insert a new user into the database with hashed password
const createUser = async (name, email, password) => {
    const query = `
        INSERT INTO users (name, email, password)
        VALUES ($1, $2, $3)
            RETURNING *;
    `;
    const saltRounds = 10; // Recommended cost factor for bcrypt
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const values = [name, email, hashedPassword];

    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    } catch (err) {
        console.error("Error creating user:", err.message);
        throw err;
    }
};

// Function to fetch a user by email
const getUserByEmail = async (email) => {
    const query = `
        SELECT * FROM users
        WHERE email = $1;
    `;
    try {
        const result = await pool.query(query, [email]);
        return result.rows[0];
    } catch (err) {
        console.error("Error fetching user by email:", err.message);
        throw err;
    }
};

module.exports = { createUser, getUserByEmail };
