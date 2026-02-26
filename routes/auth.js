const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Settings = require("../models/Settings");
const Page = require("../models/Page");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "prosite_secret";

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, password, email, name } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const user = await User.create({
      username: username.toLowerCase(),
      password,
      email: email || "",
      name: name || username,
      role: "demo",
      plan: { id: "demo", maxPages: 2, customThemes: false },
    });

    // Create default settings
    await Settings.create({ userId: user._id });

    // Create empty default pages for new user
    await Page.insertMany([
      {
        userId: user._id,
        pageId: "home",
        name: "Home",
        slug: "home",
        components: [],
        order: 0,
      },
      {
        userId: user._id,
        pageId: "about",
        name: "About",
        slug: "about",
        components: [],
        order: 1,
      },
    ]);

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        plan: user.plan,
        isFullAccess: false,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        plan: user.plan,
        isFullAccess: user.username === "deepak",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      plan: req.user.plan,
      isFullAccess: req.user.username === "deepak",
      createdAt: req.user.createdAt,
    },
  });
});

module.exports = router;