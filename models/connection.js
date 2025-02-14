const { Pool } = require("pg");
require("dotenv").config(); // Load environment variables from .env file

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    port: process.env.POSTGRES_PORT,
});

module.exports = pool;
