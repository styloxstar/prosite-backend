const express = require("express");
const Page = require("../models/Page");
const ComponentContent = require("../models/ComponentContent");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// GET /api/pages - Get all pages for user
router.get("/", authenticate, async (req, res) => {
  try {
    const pages = await Page.find({ userId: req.user._id }).sort("order");
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pages" });
  }
});

// POST /api/pages - Create new page
router.post("/", authenticate, async (req, res) => {
  try {
    const pageCount = await Page.countDocuments({ userId: req.user._id });

    if (pageCount >= req.user.plan.maxPages && req.user.role !== "admin") {
      return res.status(403).json({
        error: `Maximum ${req.user.plan.maxPages} pages on your plan. Please upgrade.`,
      });
    }

    const { name, components } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Page name is required" });
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const pageId = `${slug}-${Date.now()}`;

    const page = await Page.create({
      userId: req.user._id,
      pageId,
      name,
      slug,
      components: components || ["navbar", "hero", "footer"],
      order: pageCount,
    });

    res.status(201).json({ page });
  } catch (err) {
    console.error("Create page error:", err);
    res.status(500).json({ error: "Failed to create page" });
  }
});

// PUT /api/pages/:pageId - Update page
router.put("/:pageId", authenticate, async (req, res) => {
  try {
    const page = await Page.findOne({
      pageId: req.params.pageId,
      userId: req.user._id,
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    const { name, components, isPublished, order } = req.body;

    if (name !== undefined) page.name = name;
    if (components !== undefined) page.components = components;
    if (isPublished !== undefined) page.isPublished = isPublished;
    if (order !== undefined) page.order = order;
    page.updatedAt = Date.now();

    await page.save();
    res.json({ page });
  } catch (err) {
    res.status(500).json({ error: "Failed to update page" });
  }
});

// DELETE /api/pages/:pageId
router.delete("/:pageId", authenticate, async (req, res) => {
  try {
    const result = await Page.deleteOne({
      pageId: req.params.pageId,
      userId: req.user._id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Clean up component contents for this page
    await ComponentContent.deleteMany({
      userId: req.user._id,
      pageId: req.params.pageId,
    });

    res.json({ message: "Page deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete page" });
  }
});

// PUT /api/pages/:pageId/reorder - Reorder components
router.put("/:pageId/reorder", authenticate, async (req, res) => {
  try {
    const { components } = req.body;

    if (!Array.isArray(components)) {
      return res.status(400).json({ error: "Components array is required" });
    }

    const page = await Page.findOneAndUpdate(
      { pageId: req.params.pageId, userId: req.user._id },
      { components, updatedAt: Date.now() },
      { new: true }
    );

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json({ page });
  } catch (err) {
    res.status(500).json({ error: "Failed to reorder components" });
  }
});

module.exports = router;