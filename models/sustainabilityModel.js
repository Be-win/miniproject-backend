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
const getTopArticles = async () => {
    const query = `
    SELECT * FROM articles
    ORDER BY upvotes DESC
    LIMIT 10;
  `;
    const result = await pool.query(query);
    return result.rows;
};

// Upvote an Article
const upvoteArticle = async (articleId) => {
    const query = `
    UPDATE articles
    SET upvotes = upvotes + 1
    WHERE id = $1
    RETURNING *;
  `;
    const values = [articleId];
    const result = await pool.query(query, values);
    return result.rows[0];
};

module.exports = {
    getRandomTopic,
    submitArticle,
    getTopArticles,
    upvoteArticle,
};