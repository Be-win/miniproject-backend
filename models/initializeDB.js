const pool = require("./connection");

const createTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users
            (
                id         SERIAL PRIMARY KEY,
                name       VARCHAR(100) NOT NULL,
                email      VARCHAR(100) NOT NULL UNIQUE,
                password   VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_profile
            (
                user_id         INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
                bio             TEXT,
                full_name       VARCHAR(100),
                phone           VARCHAR(20),
                address         TEXT,
                profile_pic_url VARCHAR(255),
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS topics
            (
                id    SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS gardens
            (
                id             SERIAL PRIMARY KEY,
                owner_id       INTEGER                            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                name           VARCHAR(255)                       NOT NULL,
                description    TEXT,
                location       GEOGRAPHY(Point, 4326),
                address        TEXT,
                created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
                updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
                total_land     NUMERIC(10, 2) DEFAULT 0           NOT NULL,
                allocated_land NUMERIC(10, 2) DEFAULT 0           NOT NULL,
                type           VARCHAR(50)    DEFAULT 'community' NOT NULL,
                CONSTRAINT chk_allocated_land CHECK (allocated_land <= total_land)
            );

            CREATE TABLE IF NOT EXISTS garden_features
            (
                garden_id      INTEGER PRIMARY KEY REFERENCES gardens (id) ON DELETE CASCADE,
                soil_type      VARCHAR(255),
                irrigation     BOOLEAN,
                electricity    BOOLEAN,
                previous_crops TEXT
            );

            CREATE TABLE IF NOT EXISTS garden_images
            (
                id          SERIAL PRIMARY KEY,
                garden_id   INTEGER NOT NULL REFERENCES gardens (id) ON DELETE CASCADE,
                image_url   TEXT    NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resources
            (
                id             VARCHAR(36) PRIMARY KEY,
                title          VARCHAR(255) NOT NULL,
                description    TEXT         NOT NULL,
                type           VARCHAR(20)  NOT NULL CHECK (type IN ('needed', 'forSale')),
                quantity       INTEGER      NOT NULL,
                price          NUMERIC(10, 2),
                owner_id       INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                created_at     TIMESTAMP    NOT NULL,
                available_from TIMESTAMP    NOT NULL,
                available_to   TIMESTAMP    NOT NULL,
                contact        VARCHAR(255) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS articles
            (
                id         SERIAL PRIMARY KEY,
                topic_id   INTEGER REFERENCES topics (id) ON DELETE CASCADE,
                user_id    INTEGER REFERENCES users (id) ON DELETE CASCADE,
                title      TEXT NOT NULL,
                content    TEXT NOT NULL,
                upvotes    INTEGER   DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resource_requests
            (
                id                VARCHAR(36) PRIMARY KEY,
                resource_id       VARCHAR(36)  NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
                requester_id      INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                requester_contact VARCHAR(255) NOT NULL,
                message           TEXT         NOT NULL,
                status            VARCHAR(20)  NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
                created_at        TIMESTAMP    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS resource_notifications
            (
                id              SERIAL PRIMARY KEY,
                user_id         INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                resource_id     VARCHAR(36) REFERENCES resources (id) ON DELETE CASCADE,
                request_id      VARCHAR(36) REFERENCES resource_requests (id) ON DELETE CASCADE,
                type            VARCHAR(20) NOT NULL CHECK (type IN ('request', 'status_update', 'reminder')),
                message         TEXT        NOT NULL,
                is_read         BOOLEAN   DEFAULT false,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                price_change    NUMERIC(10, 2),
                quantity_change INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_resource_notif_user ON resource_notifications (user_id);
            CREATE INDEX IF NOT EXISTS idx_resource_notif_type ON resource_notifications (type);

            CREATE TABLE IF NOT EXISTS land_requests
            (
                id                SERIAL PRIMARY KEY,
                garden_id         INTEGER        NOT NULL REFERENCES gardens (id) ON DELETE CASCADE,
                user_id           INTEGER        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                requested_land    NUMERIC(10, 2) NOT NULL CHECK (requested_land > 0),
                contact_info      VARCHAR(255)   NOT NULL,
                message           TEXT,
                status            VARCHAR(20)    NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'expired', 'pending_extension')),
                created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                start_date        DATE           NOT NULL,
                end_date          DATE           NOT NULL,
                extension_message TEXT,
                previous_end_date DATE,
                proposed_end_date DATE,
                CONSTRAINT valid_dates CHECK (start_date <= end_date)
            );

            CREATE INDEX IF NOT EXISTS idx_land_requests_status ON land_requests (status);
            CREATE INDEX IF NOT EXISTS idx_land_requests_dates ON land_requests (start_date, end_date);
            CREATE INDEX IF NOT EXISTS idx_land_requests_garden ON land_requests (garden_id);
            CREATE INDEX IF NOT EXISTS idx_land_requests_user ON land_requests (user_id);

            CREATE TABLE IF NOT EXISTS land_allocation_notifications
            (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                garden_id  INTEGER     NOT NULL REFERENCES gardens (id) ON DELETE CASCADE,
                type       VARCHAR(20) NOT NULL CHECK (type IN ('request', 'extension_request', 'status_update', 'expiration', 'extension_update')),
                message    TEXT        NOT NULL,
                is_read    BOOLEAN   DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                from_user  INTEGER REFERENCES users (id) ON DELETE SET NULL,
                request_id INTEGER REFERENCES land_requests (id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_notifications_user_type ON land_allocation_notifications (user_id, type);
        `);
        console.log('Tables created successfully');
    } catch (err) {
        console.error('Error creating tables:', err);
    } finally {
        await pool.end();
    }
};

createTables()
    .then(() => console.log('Database initialization complete.'))
    .catch(err => console.error('Database initialization failed:', err));