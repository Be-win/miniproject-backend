require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const router = express.Router();
const pool = require('../models/connection');
const aws = require('aws-sdk');
const s3 = new aws.S3();
const { createUser, getUserByEmail } = require("../models/userModel");
const fileUpload = require('express-fileupload');

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

router.get('/allocations', async (req, res, next) => {
  if (req.query.user_id) {
    try {
      const userId = req.query.user_id;
      if (!userId || isNaN(userId)) {
        return res.status(400).json({ error: 'Valid user_id is required' });
      }

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
          AND lr.status IN ('approved', 'pending', 'pending_extension', 'active')
      `, [userId]);

      return res.json({ data: result.rows });
    } catch (error) {
      console.error("Error fetching public allocations:", error);
      return res.status(500).json({ error: "Failed to fetch allocations" });
    }
  }
  next('route'); // Pass to next route if no user_id param
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

// Get user profile
router.get('/profile/:userId', async (req, res) => {
  try {
    const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, up.bio, up.full_name, up.phone, 
             up.address, up.profile_pic_url
             FROM users u
             LEFT JOIN user_profile up ON u.id = up.user_id
             WHERE u.id = $1`,
        [req.params.userId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
  const { bio, fullName, phone, address } = req.body;

  try {
    await pool.query(
        `INSERT INTO user_profile (user_id, bio, full_name, phone, address)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id) DO UPDATE SET
             bio = EXCLUDED.bio,
             full_name = EXCLUDED.full_name,
             phone = EXCLUDED.phone,
             address = EXCLUDED.address,
             updated_at = NOW()`,
        [req.user.id, bio, fullName, phone, address]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Profile picture upload endpoint
router.post("/upload-profile-pic", authenticate, async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({error: "No image file provided"});
    }

    const file = req.files.image;
    const fileExtension = file.name.split(".").pop();
    const fileName = `profile-pics/${req.user.id}-${Date.now()}.${fileExtension}`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileName,
      Body: file.data,
      ContentType: file.mimetype,
    };

    const result = await s3.upload(params).promise();

    // Update the user's profile pic URL in the database
    await pool.query(
        `UPDATE user_profile SET profile_pic_url = $1 WHERE user_id = $2`,
        [result.Location, req.user.id]
    );

    res.json({imageUrl: result.Location});
  } catch (error) {
    console.error("Profile picture upload failed:", error);
    res.status(500).json({error: error.message || "Failed to upload image"});
  }
});



module.exports = router;
