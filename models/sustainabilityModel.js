const pool = require("./connection");

// Get Topic of the Day
const getRandomTopic = async () => {
    const checkQuery = `
        SELECT dt.topic_id, t.title, t.date
        FROM daily_topics dt
                 JOIN topics t ON dt.topic_id = t.id
        WHERE dt.date = CURRENT_DATE
    `;
    const checkResult = await pool.query(checkQuery);

    if (checkResult.rows.length > 0) {
        return checkResult.rows[0];
    } else {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const randomResult = await client.query(
                'SELECT * FROM topics ORDER BY RANDOM() LIMIT 1 FOR UPDATE'
            );
            if (randomResult.rows.length === 0) throw new Error('No topics available');
            const selectedTopic = randomResult.rows[0];

            const insertResult = await client.query(
                `INSERT INTO daily_topics (topic_id, date)
                 VALUES ($1, CURRENT_DATE)
                 ON CONFLICT (date) DO NOTHING
                 RETURNING *`,
                [selectedTopic.id]
            );

            if (insertResult.rows.length === 0) {
                const existingResult = await client.query(checkQuery);
                await client.query('COMMIT');
                return existingResult.rows[0];
            } else {
                await client.query('COMMIT');
                return selectedTopic;
            }
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
};

// Submit an Article
const submitArticle = async (topicId, userId, title, content) => {
    const query = `
        INSERT INTO articles (topic_id, user_id, title, content)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    const values = [topicId, userId, title, content];
    const result = await pool.query(query, values);
    return result.rows[0];
};

// Get Top Articles
const getTopArticles = async (userId) => {
    const query = userId
        ? `SELECT 
            a.*,
            EXISTS (SELECT 1 FROM article_upvotes WHERE article_id = a.id AND user_id = $1) as has_upvoted,
            EXISTS (SELECT 1 FROM article_downvotes WHERE article_id = a.id AND user_id = $1) as has_downvoted
           FROM articles a
           ORDER BY (a.upvotes - a.downvotes) DESC
           LIMIT 10`
        : `SELECT 
            a.*,
            false as has_upvoted,
            false as has_downvoted
           FROM articles a
           ORDER BY (a.upvotes - a.downvotes) DESC
           LIMIT 10`;

    try {
        const result = await pool.query(query, userId ? [userId] : []);
        return result.rows.map(article => ({
            ...article,
            upvotes: Number(article.upvotes),
            downvotes: Number(article.downvotes)
        }));
    } catch (err) {
        console.error("Database error:", err);
        throw new Error("Failed to retrieve articles");
    }
};

// Upvote an Article
const upvoteArticle = async (articleId, userId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check for existing upvote
        const upvoteCheck = await client.query(
            'SELECT 1 FROM article_upvotes WHERE user_id = $1 AND article_id = $2',
            [userId, articleId]
        );

        if (upvoteCheck.rows.length > 0) {
            // Remove upvote
            await client.query(
                'DELETE FROM article_upvotes WHERE user_id = $1 AND article_id = $2',
                [userId, articleId]
            );
            await client.query(
                'UPDATE articles SET upvotes = upvotes - 1 WHERE id = $1',
                [articleId]
            );
        } else {
            // Check for existing downvote
            const downvoteCheck = await client.query(
                'SELECT 1 FROM article_downvotes WHERE user_id = $1 AND article_id = $2',
                [userId, articleId]
            );

            if (downvoteCheck.rows.length > 0) {
                // Remove downvote
                await client.query(
                    'DELETE FROM article_downvotes WHERE user_id = $1 AND article_id = $2',
                    [userId, articleId]
                );
                await client.query(
                    'UPDATE articles SET downvotes = downvotes - 1 WHERE id = $1',
                    [articleId]
                );
            }

            // Add upvote
            await client.query(
                'INSERT INTO article_upvotes (user_id, article_id) VALUES ($1, $2)',
                [userId, articleId]
            );
            await client.query(
                'UPDATE articles SET upvotes = upvotes + 1 WHERE id = $1',
                [articleId]
            );
        }

        const result = await client.query(
            'SELECT * FROM articles WHERE id = $1',
            [articleId]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const downvoteArticle = async (articleId, userId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check for existing downvote
        const downvoteCheck = await client.query(
            'SELECT 1 FROM article_downvotes WHERE user_id = $1 AND article_id = $2',
            [userId, articleId]
        );

        if (downvoteCheck.rows.length > 0) {
            // Remove downvote
            await client.query(
                'DELETE FROM article_downvotes WHERE user_id = $1 AND article_id = $2',
                [userId, articleId]
            );
            await client.query(
                'UPDATE articles SET downvotes = downvotes - 1 WHERE id = $1',
                [articleId]
            );
        } else {
            // Check for existing upvote
            const upvoteCheck = await client.query(
                'SELECT 1 FROM article_upvotes WHERE user_id = $1 AND article_id = $2',
                [userId, articleId]
            );

            if (upvoteCheck.rows.length > 0) {
                // Remove upvote
                await client.query(
                    'DELETE FROM article_upvotes WHERE user_id = $1 AND article_id = $2',
                    [userId, articleId]
                );
                await client.query(
                    'UPDATE articles SET upvotes = upvotes - 1 WHERE id = $1',
                    [articleId]
                );
            }

            // Add downvote
            await client.query(
                'INSERT INTO article_downvotes (user_id, article_id) VALUES ($1, $2)',
                [userId, articleId]
            );
            await client.query(
                'UPDATE articles SET downvotes = downvotes + 1 WHERE id = $1',
                [articleId]
            );
        }

        const result = await client.query(
            'SELECT * FROM articles WHERE id = $1',
            [articleId]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Get user's articles
const getUserArticles = async (userId) => {
    const query = `
        SELECT *, 
            EXISTS (SELECT 1 FROM article_upvotes WHERE article_id = a.id AND user_id = $1) as has_upvoted,
            EXISTS (SELECT 1 FROM article_downvotes WHERE article_id = a.id AND user_id = $1) as has_downvoted
        FROM articles a
        WHERE user_id = $1
        ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
};

// Update article
const updateArticle = async (articleId, userId, title, content) => {
    const query = `
        UPDATE articles
        SET title = $1, content = $2, updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING *
    `;
    const values = [title, content, articleId, userId];
    const result = await pool.query(query, values);
    return result.rows[0];
};

// Delete article
const deleteArticle = async (articleId, userId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Delete votes first
        await client.query(
            'DELETE FROM article_upvotes WHERE article_id = $1',
            [articleId]
        );
        await client.query(
            'DELETE FROM article_downvotes WHERE article_id = $1',
            [articleId]
        );

        // Delete article
        const result = await client.query(
            'DELETE FROM articles WHERE id = $1 AND user_id = $2 RETURNING *',
            [articleId, userId]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};


module.exports = {
    getRandomTopic,
    submitArticle,
    getTopArticles,
    upvoteArticle,
    downvoteArticle,
    getUserArticles,
    updateArticle,
    deleteArticle
};