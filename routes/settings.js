const express = require("express");
const Settings = require("../models/Settings");
const { authenticate } = require("../middleware/auth");
const { isStringOfLength } = require("../lib/validators");

const router = express.Router();

const MAX_SETTING_ID_LENGTH = 128;
// Google Fonts family names are letters, digits and spaces ("Plus Jakarta Sans"); nothing else is stored.
const FONT_NAME = /^[A-Za-z0-9 ]{1,64}$/;
// Site style: every field is optional, and each must be one of these values (headingFont: a font name or "").
const DESIGN_VALUES = {
  radius: ["sharp", "soft", "round"],
  spacing: ["compact", "comfortable", "airy"],
  buttons: ["pill", "rounded", "square"],
  surface: ["glass", "solid", "outline"],
  effect: ["aurora", "orbs", "grid", "mesh", "none"],
  motion: ["subtle", "lively", "none"],
};

/** Validated copy of a design object, or null when anything in it is unknown or malformed. */
function parseDesign(design) {
  if (!design || typeof design !== "object" || Array.isArray(design)) return null;
  const out = {};
  for (const [key, value] of Object.entries(design)) {
    if (key === "headingFont") {
      if (typeof value !== "string" || (value !== "" && !FONT_NAME.test(value))) return null;
      out.headingFont = value;
    } else if (DESIGN_VALUES[key]) {
      if (!DESIGN_VALUES[key].includes(value)) return null;
      out[key] = value;
    } else {
      return null;
    }
  }
  return out;
}

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
    const { activeTheme, sidebarCollapsed, lastActivePage, font, design } = req.body;

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

    if (font !== undefined && (typeof font !== "string" || !FONT_NAME.test(font))) {
      return res.status(400).json({ error: "Invalid font" });
    }

    const designUpdate = design !== undefined ? parseDesign(design) : undefined;
    if (design !== undefined && !designUpdate) {
      return res.status(400).json({ error: "Invalid design settings" });
    }

    const update = { updatedAt: Date.now() };
    if (activeTheme !== undefined) update.activeTheme = activeTheme;
    if (sidebarCollapsed !== undefined) update.sidebarCollapsed = sidebarCollapsed;
    if (lastActivePage !== undefined) update.lastActivePage = lastActivePage;
    if (font !== undefined) update.font = font;
    // Fields are set one by one so a partial design update keeps the other saved values.
    if (designUpdate) Object.entries(designUpdate).forEach(([key, value]) => { update[`design.${key}`] = value; });

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
