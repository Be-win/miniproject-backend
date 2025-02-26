require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const router = express.Router();
const pool = require('../models/connection');
const { createUser, getUserByEmail } = require("../models/userModel");

const SECRET_KEY = process.env.JWT_SECRET // Replace with a strong secret key in production

// Middleware to verify JWT
const authenticate = require("../middleware/authenticateToken");

// Route to create a new user (Signup)
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      return res.status(400).json({ error: "Email is already in use." });
    }

    const newUser = await createUser(name, email, password);

    // Generate a JWT token for the new user
    const token = jwt.sign({ id: newUser.id, email: newUser.email }, SECRET_KEY, {
      expiresIn: "4h", // Token expiration time
    });

    res.status(201).json({
      message: "User created successfully.",
      user: { id: newUser.id, name: newUser.name, email: newUser.email },
      token,
    });
  } catch (err) {
    console.error("Error during signup:", err);
    res.status(500).json({ error: "Failed to create user." });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Compare the provided password with the hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Generate a JWT token for the logged-in user
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, {
      expiresIn: "1h", // Token expiration time
    });

    res.status(200).json({
      message: "Login successful.",
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to log in." });
  }
});

// Example protected route
router.get("/profile", async (req, res) => {
  const email = req.query.email;
  console.log("email", email);
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get user's land allocations
router.get("/allocations", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        lr.id,
        lr.garden_id,
        g.name AS garden_name,
        lr.requested_land,
        lr.start_date,
        CASE
          WHEN lr.status = 'pending_extension' THEN lr.previous_end_date
          ELSE lr.end_date
          END AS end_date,
        lr.proposed_end_date,
        lr.status
      FROM land_requests lr
             JOIN gardens g ON g.id = lr.garden_id
      WHERE lr.user_id = $1
        AND lr.status IN ('approved', 'pending' ,'pending_extension', 'active')
    `, [req.user.id]);

    res.json({ data: result.rows });
  } catch (error) {
    console.error("Error fetching allocations:", error);
    res.status(500).json({ error: "Failed to fetch allocations" });
  }
});



module.exports = router;
