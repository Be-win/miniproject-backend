// authMiddleware.js
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token." });
        req.user = user;
        next();
    });
};

// Optional authentication version
authenticateToken.optional = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1];

    if (!token) return next();

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (!err) req.user = user;
        next();
    });
};

module.exports = authenticateToken;