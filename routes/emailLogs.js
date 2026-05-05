const express = require("express");
const EmailLog = require("../models/EmailLog");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// GET /api/email-logs — fetch email history for the authenticated user
router.get("/", authenticate, async (req, res) => {
  try {
    const logs = await EmailLog.find({ userId: req.user._id })
      .sort({ sentAt: -1 })
      .limit(50)
      .lean();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch email logs" });
  }
});

module.exports = router;
