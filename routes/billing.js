const express = require("express");
const User = require("../models/User");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    prices: { USD: 9, INR: 499, EUR: 8, GBP: 7 },
    pages: 3,
    features: ["3 Pages", "6 Free Themes", "Basic Components", "Email Support"],
  },
  {
    id: "pro",
    name: "Professional",
    prices: { USD: 29, INR: 1499, EUR: 27, GBP: 23 },
    pages: 8,
    popular: true,
    features: [
      "8 Pages",
      "All Themes",
      "All Components",
      "Custom Theme",
      "Priority Support",
      "Analytics",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    prices: { USD: 79, INR: 3999, EUR: 72, GBP: 62 },
    pages: 25,
    features: [
      "Unlimited Pages",
      "All Themes",
      "All Components",
      "Custom Themes",
      "White Label",
      "24/7 Support",
      "API Access",
    ],
  },
];

const PLAN_CONFIG = {
  starter: { maxPages: 3, customThemes: false },
  pro: { maxPages: 8, customThemes: true },
  enterprise: { maxPages: 25, customThemes: true },
};

// GET /api/billing
router.get("/", authenticate, (req, res) => {
  res.json({
    currentPlan: req.user.plan,
    plans: PLANS,
    payment: req.user.payment,
  });
});

// POST /api/billing/upgrade
router.post("/upgrade", authenticate, async (req, res) => {
  try {
    const { planId, cardLast4, cardBrand, currency } = req.body;

    if (!PLAN_CONFIG[planId]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // In production: integrate Stripe/Razorpay here
    // This simulates a successful payment

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        plan: {
          id: planId,
          ...PLAN_CONFIG[planId],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        role: planId === "enterprise" ? "admin" : "pro",
        payment: {
          cardLast4: cardLast4 || "4242",
          cardBrand: cardBrand || "visa",
        },
        updatedAt: Date.now(),
      },
      { new: true }
    ).select("-password");

    res.json({
      message: `Successfully upgraded to ${planId} plan`,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        plan: user.plan,
      },
    });
  } catch (err) {
    console.error("Upgrade error:", err);
    res.status(500).json({ error: "Failed to process upgrade" });
  }
});

module.exports = router;