const express = require("express");
const Page = require("../models/Page");
const ComponentContent = require("../models/ComponentContent");
const { authenticate } = require("../middleware/auth");
const { LIMITS, isStringOfLength } = require("../lib/validators");

const router = express.Router();

const DEFAULT_COMPONENTS = ["navbar", "hero", "footer"];

const SEO_LIMITS = { title: 120, description: 300, image: 2048, favicon: 2048 };
const HTTPS_URL = /^https:\/\/[^\s<>"']+$/i;

/**
 * Validated copy of a page's SEO settings, or null if anything is malformed. The share image must be
 * an https URL; the favicon an emoji (short text without markup) or an https URL.
 */
function parseSeo(seo) {
  if (!seo || typeof seo !== "object" || Array.isArray(seo)) return null;
  const out = {};
  for (const [key, value] of Object.entries(seo)) {
    if (!(key in SEO_LIMITS) || typeof value !== "string" || value.length > SEO_LIMITS[key]) return null;
    const v = value.trim();
    if (key === "image" && v && !HTTPS_URL.test(v)) return null;
    if (key === "favicon" && v && !HTTPS_URL.test(v) && (v.length > 8 || /[<>&"'\s]/.test(v))) return null;
    out[key] = v;
  }
  return out;
}

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

    const { name, components, isPublished, order, seo } = req.body;

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
    const seoUpdate = seo !== undefined ? parseSeo(seo) : undefined;
    if (seo !== undefined && !seoUpdate) {
      return res.status(400).json({ error: "Invalid SEO settings" });
    }

    if (name !== undefined) page.name = name.trim();
    if (components !== undefined) page.components = components;
    if (isPublished !== undefined) page.isPublished = isPublished;
    if (order !== undefined) page.order = order;
    if (seoUpdate) Object.entries(seoUpdate).forEach(([key, value]) => page.set("seo." + key, value));
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
