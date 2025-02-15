const pool = require("./connection");

const createTables = async () => {
    try {
        await pool.query(`
      CREATE EXTENSION IF NOT EXISTS postgis;
      
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

      CREATE TABLE IF NOT EXISTS gardens (
        id             SERIAL PRIMARY KEY,
        owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name           VARCHAR(255) NOT NULL,
        description    TEXT,
        location       GEOGRAPHY(Point, 4326),
        address        TEXT,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_land     NUMERIC(10, 2) DEFAULT 0 NOT NULL,
        allocated_land NUMERIC(10, 2) DEFAULT 0 NOT NULL,
        type           VARCHAR(50) DEFAULT 'community' NOT NULL,
        CONSTRAINT chk_allocated_land CHECK (allocated_land <= total_land)
      );

      CREATE TABLE IF NOT EXISTS resources (
        id             VARCHAR(36) PRIMARY KEY,
        title          VARCHAR(255) NOT NULL,
        description    TEXT NOT NULL,
        type           VARCHAR(20) NOT NULL CHECK (type IN ('needed', 'forSale')),
        quantity       INTEGER NOT NULL,
        price          NUMERIC(10, 2),
        owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at     TIMESTAMP NOT NULL,
        available_from TIMESTAMP NOT NULL,
        available_to   TIMESTAMP NOT NULL,
        contact        VARCHAR(255) NOT NULL
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

      CREATE TABLE IF NOT EXISTS garden_images (
        id          SERIAL PRIMARY KEY,
        garden_id   INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
        image_url   TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS garden_volunteers (
        id        SERIAL PRIMARY KEY,
        garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
        user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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