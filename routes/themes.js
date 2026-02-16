const express = require("express");
const Theme = require("../models/Theme");
const { authenticate, requirePlan } = require("../middleware/auth");

const router = express.Router();

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
    const { name, type, colors } = req.body;

    if (!name || !type || !colors) {
      return res.status(400).json({ error: "Name, type, and colors are required" });
    }

    const themeId = `custom-${req.user._id}-${Date.now()}`;

    const theme = await Theme.create({
      themeId,
      name,
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
    });

    if (!theme) {
      return res.status(404).json({ error: "Theme not found" });
    }

    const { name, type, colors } = req.body;
    if (name) theme.name = name;
    if (type) theme.type = type;
    if (colors) theme.colors = { ...theme.colors.toObject(), ...colors };
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