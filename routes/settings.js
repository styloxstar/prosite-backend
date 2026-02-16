const express = require("express");
const Settings = require("../models/Settings");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// GET /api/settings
router.get("/", authenticate, async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.user._id });

    if (!settings) {
      settings = await Settings.create({ userId: req.user._id });
    }

    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// PUT /api/settings
router.put("/", authenticate, async (req, res) => {
  try {
    const { activeTheme, sidebarCollapsed, lastActivePage } = req.body;

    const update = { updatedAt: Date.now() };
    if (activeTheme !== undefined) update.activeTheme = activeTheme;
    if (sidebarCollapsed !== undefined) update.sidebarCollapsed = sidebarCollapsed;
    if (lastActivePage !== undefined) update.lastActivePage = lastActivePage;

    const settings = await Settings.findOneAndUpdate(
      { userId: req.user._id },
      update,
      { upsert: true, new: true }
    );

    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

module.exports = router;