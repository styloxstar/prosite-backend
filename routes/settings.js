const express = require("express");
const Settings = require("../models/Settings");
const { authenticate } = require("../middleware/auth");
const { isStringOfLength } = require("../lib/validators");

const router = express.Router();

const MAX_SETTING_ID_LENGTH = 128;

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

    // [SECURITY FIX 2026-09-23] Values were written without type checks (objects/huge strings accepted).
    if (activeTheme !== undefined && !isStringOfLength(activeTheme, 1, MAX_SETTING_ID_LENGTH)) {
      return res.status(400).json({ error: "Invalid activeTheme" });
    }
    if (sidebarCollapsed !== undefined && typeof sidebarCollapsed !== "boolean") {
      return res.status(400).json({ error: "sidebarCollapsed must be true or false" });
    }
    if (lastActivePage !== undefined && !isStringOfLength(lastActivePage, 1, MAX_SETTING_ID_LENGTH)) {
      return res.status(400).json({ error: "Invalid lastActivePage" });
    }

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
