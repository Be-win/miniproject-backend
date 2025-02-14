const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET; // Ensure this is set in your .env file

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Extract token from "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Invalid token." });
        }
        req.user = user; // Attach the decoded user to the request object
        next(); // Proceed to the next middleware or route handler
    });
};

module.exports = authenticateToken;