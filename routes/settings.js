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
  // page backdrop: "auto" (the theme's own) or one of the ambient effects
  backdrop: ["auto", "none", "constellation", "aurora", "nebula", "starfield", "mesh", "fog", "spotlight", "sweep", "neonGrid", "goldDust",
    "embers", "fireflies", "bokeh", "fizz", "dotField", "waves", "sunrise", "clouds", "snow", "petals", "leaves", "pollen", "dunes", "reef"],
  texture: ["auto", "none", "grain", "grid", "dots", "scanlines", "carbon", "brushed"],
  frame: ["flow", "panels", "classic"],
  reveal: ["rise", "fade", "zoom", "blur", "slide", "none"],
  cascade: ["on", "off"],
  headline: ["gradient", "rise", "glow", "ink"],
  hover: ["lift", "tilt", "glow", "none"],
};

const SITE_FLAGS = ["progress", "backToTop", "cursorGlow", "cookie"];

/** Validated copy of the site extras, or null when anything in it is unknown or malformed. */
function parseSite(site) {
  if (!site || typeof site !== "object" || Array.isArray(site)) return null;
  const out = {};
  for (const [key, value] of Object.entries(site)) {
    if (SITE_FLAGS.includes(key)) {
      if (typeof value !== "boolean") return null;
    } else if (key === "cookieText") {
      if (typeof value !== "string" || value.length > 200) return null;
    } else if (key === "analyticsId") {
      // Partial ids are allowed while the user types; exports only use a complete G-XXXXXXXX id.
      if (typeof value !== "string" || !/^[A-Z0-9-]{0,14}$/.test(value)) return null;
    } else {
      return null;
    }
    out[key] = value;
  }
  return out;
}

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
    const { activeTheme, sidebarCollapsed, lastActivePage, font, design, site } = req.body;

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

    const siteUpdate = site !== undefined ? parseSite(site) : undefined;
    if (site !== undefined && !siteUpdate) {
      return res.status(400).json({ error: "Invalid site settings" });
    }

    const update = { updatedAt: Date.now() };
    if (activeTheme !== undefined) update.activeTheme = activeTheme;
    if (sidebarCollapsed !== undefined) update.sidebarCollapsed = sidebarCollapsed;
    if (lastActivePage !== undefined) update.lastActivePage = lastActivePage;
    if (font !== undefined) update.font = font;
    // Fields are set one by one so a partial design update keeps the other saved values.
    if (designUpdate) Object.entries(designUpdate).forEach(([key, value]) => { update[`design.${key}`] = value; });
    if (siteUpdate) Object.entries(siteUpdate).forEach(([key, value]) => { update[`site.${key}`] = value; });

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
