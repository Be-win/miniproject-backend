const pool = require("./connection");

const createTables = async () => {
    try {
        await pool.query(`
      
      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(100) NOT NULL,
        email      VARCHAR(100) NOT NULL UNIQUE,
        password   VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS topics (
        id    SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS articles (
        id         SERIAL PRIMARY KEY,
        topic_id   INTEGER REFERENCES topics(id) ON DELETE CASCADE,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL,
        upvotes    INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS resource_requests (
        id                VARCHAR(36) PRIMARY KEY,
        resource_id       VARCHAR(36) NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        requester_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requester_contact VARCHAR(255) NOT NULL,
        message           TEXT NOT NULL,
        status            VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at        TIMESTAMP NOT NULL
      );
    `);
        console.log('Tables created successfully');
    } catch (err) {
        console.error('Error creating tables:', err);
    } finally {
        await pool.end(); // Ensure the pool is properly closed
    }
};

// Handle the promise returned by createTables
createTables()
    .then(() => {
        console.log('Database initialization complete.');
    })
    .catch((err) => {
        console.error('Database initialization failed:', err);
    });