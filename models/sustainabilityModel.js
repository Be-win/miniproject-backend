const pool = require("./connection");

// Get Topic of the Day
const getRandomTopic = async () => {
    const query = `
    SELECT * FROM topics
    ORDER BY RANDOM()
    LIMIT 1;
  `;
    const result = await pool.query(query);
    return result.rows[0];
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

module.exports = {
    getRandomTopic,
    submitArticle,
    getTopArticles,
    upvoteArticle,
    downvoteArticle,
};