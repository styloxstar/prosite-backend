/**
 * Per-component content storage (backs `api.content.*` in the frontend).
 *
 * [SECURITY FIX 2026-09-23] This file used to be a verbatim copy of routes/pages.js, mounted at
 * /api/content. That exposed a second, unintended set of page create/update/delete endpoints, while
 * the content API the frontend actually calls (GET /:pageId, PUT/DELETE /:pageId/:componentId) did not
 * exist — and `PUT /content/<page>/reorder` silently hit the page-reorder handler instead.
 * It now implements exactly the documented content API, scoped to the authenticated user and
 * with a size cap on stored content.
 */
const express = require("express");
const ComponentContent = require("../models/ComponentContent");
const { authenticate } = require("../middleware/auth");
const { LIMITS, isStringOfLength } = require("../lib/validators");

const router = express.Router();

const MAX_CONTENT_BYTES = 2 * 1024 * 1024; // images are stored as data URLs, so allow ~2 MB per component
const MAX_PAGE_ID_LENGTH = 128;

function isValidId(value, maxLength) {
  return isStringOfLength(value, 1, maxLength);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Rejects bad ids up-front so every handler below can trust req.params. */
function validateParams(req, res, next) {
  const { pageId, componentId } = req.params;
  if (!isValidId(pageId, MAX_PAGE_ID_LENGTH)) {
    return res.status(400).json({ error: "Invalid page id" });
  }
  if (componentId !== undefined && !isValidId(componentId, LIMITS.COMPONENT_ID)) {
    return res.status(400).json({ error: "Invalid component id" });
  }
  next();
}

router.use(authenticate);

// GET /api/content/:pageId — all saved component contents for one of the user's pages
router.get("/:pageId", validateParams, async (req, res) => {
  try {
    const docs = await ComponentContent.find({ userId: req.user._id, pageId: req.params.pageId }).lean();
    const contents = Object.fromEntries(docs.map((doc) => [doc.componentId, doc.content]));
    res.json({ contents });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

// PUT /api/content/:pageId/:componentId — save one component's content
router.put("/:pageId/:componentId", validateParams, async (req, res) => {
  try {
    const { content } = req.body;
    if (!isPlainObject(content)) {
      return res.status(400).json({ error: "Content must be an object" });
    }
    if (Buffer.byteLength(JSON.stringify(content)) > MAX_CONTENT_BYTES) {
      return res.status(413).json({ error: "Content is too large" });
    }

    const doc = await ComponentContent.findOneAndUpdate(
      { userId: req.user._id, pageId: req.params.pageId, componentId: req.params.componentId },
      { content, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    res.json({ content: doc.content });
  } catch (err) {
    console.error("Save content error:", err);
    res.status(500).json({ error: "Failed to save content" });
  }
});

// DELETE /api/content/:pageId/:componentId — reset a component back to its defaults
router.delete("/:pageId/:componentId", validateParams, async (req, res) => {
  try {
    await ComponentContent.deleteOne({
      userId: req.user._id,
      pageId: req.params.pageId,
      componentId: req.params.componentId,
    });
    res.json({ message: "Content reset" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset content" });
  }
});

module.exports = router;
