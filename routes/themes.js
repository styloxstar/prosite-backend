const express = require("express");
const Theme = require("../models/Theme");
const { authenticate, requirePlan } = require("../middleware/auth");
const { LIMITS, isStringOfLength, isSafeCssValue } = require("../lib/validators");

const router = express.Router();

const THEME_TYPES = ["light", "dark"];
const COLOR_KEYS = [
  "bg", "surface", "surfaceAlt", "text", "textSecondary", "primary",
  "primaryHover", "accent", "border", "card", "gradient", "shadow",
];

/**
 * [SECURITY FIX 2026-09-23] Theme colours were spread straight from the request body and are later
 * interpolated into inline styles, <style> blocks and exported HTML/CSS/JSX. A value such as
 * `red;}</style><script>…` would break out of that context. Only known colour keys with safe CSS
 * characters are accepted now; unknown keys are ignored.
 *
 * @returns {{ colors?: object, error?: string }}
 */
function sanitizeColors(colors) {
  if (colors === null || typeof colors !== "object" || Array.isArray(colors)) {
    return { error: "colors must be an object" };
  }
  const clean = {};
  for (const key of COLOR_KEYS) {
    const value = colors[key];
    if (value === undefined || value === null || value === "") continue;
    if (!isSafeCssValue(value)) return { error: `Invalid value for colour "${key}"` };
    clean[key] = value.trim();
  }
  return { colors: clean };
}

function isValidThemeName(name) {
  return isStringOfLength(name, 1, LIMITS.THEME_NAME);
}

// GET /api/themes - Get all themes (default + user's custom)
router.get("/", authenticate, async (req, res) => {
  try {
    const defaultThemes = await Theme.find({ isCustom: false });
    const customThemes = await Theme.find({ isCustom: true, createdBy: req.user._id });
    res.json({ themes: [...defaultThemes, ...customThemes] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch themes" });
  }
});

// POST /api/themes/custom - Create custom theme (Pro+ only)
router.post("/custom", authenticate, requirePlan("pro", "enterprise"), async (req, res) => {
  try {
    const { name, type } = req.body;

    if (!req.body.colors || !isValidThemeName(name) || !THEME_TYPES.includes(type)) {
      return res.status(400).json({ error: "Name, type, and colors are required" });
    }
    const { colors, error } = sanitizeColors(req.body.colors);
    if (error) return res.status(400).json({ error });

    const themeId = `custom-${req.user._id}-${Date.now()}`;

    const theme = await Theme.create({
      themeId,
      name: name.trim(),
      type,
      premium: true,
      isCustom: true,
      createdBy: req.user._id,
      colors: {
        ...colors,
        gradient: colors.gradient || `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
        shadow: colors.shadow || "0 1px 3px rgba(0,0,0,0.1)",
        card: colors.card || colors.surface,
      },
    });

    res.status(201).json({ theme });
  } catch (err) {
    console.error("Create theme error:", err);
    res.status(500).json({ error: "Failed to create theme" });
  }
});

// PUT /api/themes/custom/:themeId - Update custom theme
router.put("/custom/:themeId", authenticate, async (req, res) => {
  try {
    const theme = await Theme.findOne({
      themeId: req.params.themeId,
      createdBy: req.user._id,
      isCustom: true, // built-in themes must never be editable, even by their seeder
    });

    if (!theme) {
      return res.status(404).json({ error: "Theme not found" });
    }

    const { name, type } = req.body;
    if (name !== undefined && !isValidThemeName(name)) {
      return res.status(400).json({ error: `Theme name must be 1-${LIMITS.THEME_NAME} characters` });
    }
    if (type !== undefined && !THEME_TYPES.includes(type)) {
      return res.status(400).json({ error: "type must be light or dark" });
    }

    if (name) theme.name = name.trim();
    if (type) theme.type = type;
    if (req.body.colors !== undefined) {
      const { colors, error } = sanitizeColors(req.body.colors);
      if (error) return res.status(400).json({ error });
      theme.colors = { ...theme.colors.toObject(), ...colors };
    }
    await theme.save();

    res.json({ theme });
  } catch (err) {
    res.status(500).json({ error: "Failed to update theme" });
  }
});

// DELETE /api/themes/custom/:themeId
router.delete("/custom/:themeId", authenticate, async (req, res) => {
  try {
    const result = await Theme.deleteOne({
      themeId: req.params.themeId,
      createdBy: req.user._id,
      isCustom: true,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Theme not found" });
    }

    res.json({ message: "Theme deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete theme" });
  }
});

module.exports = router;
