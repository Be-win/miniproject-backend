require("dotenv").config();
const express = require("express");
const router = express.Router();
const {
    getRandomTopic,
    submitArticle,
    getTopArticles,
    upvoteArticle,
} = require("../models/sustainabilityModel");
const authenticateToken = require("../middleware/authenticateToken");

// Get Topic of the Day
router.get("/topic-of-the-day", async (req, res) => {
    try {
        const topic = await getRandomTopic();
        if (!topic) {
            return res.status(404).json({ error: "No topics found." });
        }
        res.status(200).json({ topic });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch topic of the day." });
    }
});

// Submit an Article
router.post("/submit-article", async (req, res) => {
    console.log("Received submit-article request:", req.body); // Debugging
    const { topicId, userId, title, content } = req.body;

    if(userId == null)
    return res.status(401).json(
        { error: "Unauthorized. Please log in to submit an article." }
    )

    if (!topicId || !title || !content) {
        return res.status(400).json({ error: "Topic ID, title, and content are required." });
    }

    try {
        const newArticle = await submitArticle(topicId, userId, title, content);
        res.status(201).json({ message: "Article submitted successfully.", article: newArticle });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Top Articles
router.get("/top-articles", async (req, res) => {
    try {
        const articles = await getTopArticles();
        res.status(200).json({ articles });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch top articles." });
    }
});

// Upvote an Article
router.post("/upvote-article/:id", async (req, res) => {
    const articleId = req.params.id;

    try {
        const updatedArticle = await upvoteArticle(articleId);
        if (!updatedArticle) {
            return res.status(404).json({ error: "Article not found." });
        }
        res.status(200).json({ message: "Article upvoted successfully.", article: updatedArticle });
    } catch (err) {
        res.status(500).json({ error: "Failed to upvote article." });
    }
});

module.exports = router;