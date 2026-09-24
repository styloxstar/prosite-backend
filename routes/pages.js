const express = require("express");
const Page = require("../models/Page");
const ComponentContent = require("../models/ComponentContent");
const { authenticate } = require("../middleware/auth");
const { LIMITS, isStringOfLength } = require("../lib/validators");

const router = express.Router();

const DEFAULT_COMPONENTS = ["navbar", "hero", "footer"];

/**
 * [SECURITY FIX 2026-09-23] `components`, `name`, `order` and `isPublished` were stored exactly as
 * sent. Arbitrary nested objects/huge arrays could be written into the DB (storage abuse) and later
 * rendered/exported by the builder. Only a bounded list of short component-id strings is accepted now.
 */
function isValidComponentList(components) {
  return (
    Array.isArray(components) &&
    components.length <= LIMITS.COMPONENTS_PER_PAGE &&
    components.every((id) => isStringOfLength(id, 1, LIMITS.COMPONENT_ID))
  );
}

function isValidPageName(name) {
  return isStringOfLength(name, 1, LIMITS.PAGE_NAME);
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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

    if (!isValidPageName(name)) {
      return res.status(400).json({ error: `Page name is required (max ${LIMITS.PAGE_NAME} characters)` });
    }
    if (components !== undefined && !isValidComponentList(components)) {
      return res.status(400).json({ error: "Invalid components list" });
    }

    const trimmedName = name.trim();
    const slug = toSlug(trimmedName);
    const pageId = `${slug}-${Date.now()}`;

    const page = await Page.create({
      userId: req.user._id,
      pageId,
      name: trimmedName,
      slug,
      components: components || DEFAULT_COMPONENTS,
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
    // Ownership is enforced by filtering on userId — a user can never touch another user's page.
    const page = await Page.findOne({
      pageId: req.params.pageId,
      userId: req.user._id,
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    const { name, components, isPublished, order } = req.body;

    if (name !== undefined && !isValidPageName(name)) {
      return res.status(400).json({ error: `Page name must be 1-${LIMITS.PAGE_NAME} characters` });
    }
    if (components !== undefined && !isValidComponentList(components)) {
      return res.status(400).json({ error: "Invalid components list" });
    }
    if (isPublished !== undefined && typeof isPublished !== "boolean") {
      return res.status(400).json({ error: "isPublished must be true or false" });
    }
    if (order !== undefined && !Number.isInteger(order)) {
      return res.status(400).json({ error: "order must be an integer" });
    }

    if (name !== undefined) page.name = name.trim();
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

    if (!isValidComponentList(components)) {
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
