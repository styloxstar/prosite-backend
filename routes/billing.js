const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const Invoice = require("../models/Invoice");
const { authenticate } = require("../middleware/auth");
const { sendPaymentConfirmationEmail } = require("../utils/email");
const { generateInvoicePDF } = require("../utils/invoice-pdf");

const router = express.Router();

// UPI Payee details — change this to your actual UPI ID
const UPI_PAYEE_ID = process.env.UPI_PAYEE_ID || "";
const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || "   ";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    prices: { USD: 3, INR: 149, EUR: 3, GBP: 2 },
    pages: 3,
    features: ["3 Pages", "6 Free Themes", "Basic Components", "Email Support"],
  },
  {
    id: "pro",
    name: "Professional",
    prices: { USD: 9, INR: 499, EUR: 8, GBP: 7 },
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
    prices: { USD: 29, INR: 1499, EUR: 27, GBP: 23 },
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
  {
    id: "free-trial",
    name: "Free Trial",
    prices: { USD: 0, INR: 0, EUR: 0, GBP: 0 },
    pages: 3,
    trialDays: 14,
    features: ["3 Pages", "6 Free Themes", "Basic Components", "14-Day Free Trial", "No Credit Card Needed"],
  },
];

const PLAN_CONFIG = {
  starter: { maxPages: 3, customThemes: false },
  pro: { maxPages: 8, customThemes: true },
  enterprise: { maxPages: 25, customThemes: true },
  "free-trial": { maxPages: 3, customThemes: false },
};

// In-memory payment orders (use DB in production)
const pendingOrders = new Map();

// Auto-incrementing invoice number generator
async function generateInvoiceNumber() {
  const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 });
  if (!lastInvoice) return "INV-001";
  const lastNum = parseInt(lastInvoice.invoiceNumber.split("-")[1], 10);
  return "INV-" + String(lastNum + 1).padStart(3, "0");
}

// GET /api/billing
router.get("/", authenticate, (req, res) => {
  res.json({
    currentPlan: req.user.plan,
    plans: PLANS,
    payment: req.user.payment,
  });
});

// POST /api/billing/create-order — creates a UPI payment order
router.post("/create-order", authenticate, async (req, res) => {
  try {
    const { planId, currency } = req.body;

    if (!PLAN_CONFIG[planId]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const plan = PLANS.find((p) => p.id === planId);
    const cur = currency || "INR";
    const amount = plan.prices[cur] || plan.prices.INR;

    const orderId = "PS" + Date.now() + crypto.randomBytes(4).toString("hex").toUpperCase();

    // Build UPI deep link
    const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_PAYEE_ID)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`ProSite ${plan.name} Plan`)}&tr=${orderId}`;

    // Store pending order
    pendingOrders.set(orderId, {
      userId: req.user._id.toString(),
      planId,
      amount,
      currency: cur,
      status: "pending",
      createdAt: Date.now(),
    });

    // Clean up old orders (>30 min)
    for (const [id, order] of pendingOrders) {
      if (Date.now() - order.createdAt > 30 * 60 * 1000) {
        pendingOrders.delete(id);
      }
    }

    res.json({
      orderId,
      amount,
      currency: cur,
      planName: plan.name,
      upiLink,
      upiId: UPI_PAYEE_ID,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// POST /api/billing/confirm-payment — admin/user confirms UPI payment received
router.post("/confirm-payment", authenticate, async (req, res) => {
  try {
    const { orderId, upiTransactionId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID required" });
    }

    const order = pendingOrders.get(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found or expired" });
    }

    if (order.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (order.status === "completed") {
      return res.status(400).json({ error: "Order already completed" });
    }

    const planId = order.planId;

    // Update user plan
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        plan: {
          id: planId,
          ...PLAN_CONFIG[planId],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        role: planId === "enterprise" ? "admin" : planId === "pro" ? "pro" : "starter",
        payment: {
          method: "upi",
          lastOrderId: orderId,
          upiTransactionId: upiTransactionId || "",
        },
        updatedAt: Date.now(),
      },
      { new: true }
    ).select("-password");

    // Mark order as completed
    order.status = "completed";
    pendingOrders.set(orderId, order);

    // Generate invoice
    let invoice = null;
    try {
      const plan = PLANS.find((p) => p.id === planId);
      const invoiceNumber = await generateInvoiceNumber();

      invoice = await Invoice.create({
        invoiceNumber,
        userId: req.user._id,
        orderId,
        planId,
        planName: plan.name,
        amount: order.amount,
        currency: order.currency,
        paymentMethod: "upi",
        upiTransactionId: upiTransactionId || "",
        status: "paid",
        userEmail: user.email || "",
        userName: user.name || user.username,
      });

      // Fire-and-forget email
      if (user.email) {
        sendPaymentConfirmationEmail(invoice, user.email).catch((err) => {
          console.error("Email send failed:", err.message);
        });
      }
    } catch (invoiceErr) {
      console.error("Invoice creation failed:", invoiceErr.message);
    }

    res.json({
      message: `Successfully upgraded to ${planId} plan`,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        plan: user.plan,
      },
      invoiceId: invoice?._id || null,
      invoiceNumber: invoice?.invoiceNumber || null,
    });
  } catch (err) {
    console.error("Confirm payment error:", err);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
});

// GET /api/billing/order-status/:orderId — check order status
router.get("/order-status/:orderId", authenticate, (req, res) => {
  const order = pendingOrders.get(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (order.userId !== req.user._id.toString()) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  res.json({ status: order.status, planId: order.planId });
});

// GET /api/billing/invoices — list user's invoices
router.get("/invoices", authenticate, async (req, res) => {
  try {
    const invoices = await Invoice.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("invoiceNumber planName amount currency status createdAt");
    res.json({ invoices });
  } catch (err) {
    console.error("Fetch invoices error:", err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// GET /api/billing/invoices/:invoiceId/download — download invoice as PDF
router.get("/invoices/:invoiceId/download", authenticate, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.invoiceId,
      userId: req.user._id,
    });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    const pdfBuffer = await generateInvoicePDF(invoice);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Download invoice error:", err);
    res.status(500).json({ error: "Failed to generate invoice" });
  }
});

// Keep legacy upgrade endpoint for backward compat
router.post("/upgrade", authenticate, async (req, res) => {
  try {
    const { planId } = req.body;

    if (!PLAN_CONFIG[planId]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        plan: {
          id: planId,
          ...PLAN_CONFIG[planId],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        role: planId === "enterprise" ? "admin" : planId === "pro" ? "pro" : "starter",
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

// POST /api/billing/activate-free — zero-price free trial activation via email link
router.post("/activate-free", authenticate, async (req, res) => {
  try {
    const jwt = require("jsonwebtoken");
    const { planId } = req.body;
    if (planId !== "free-trial") return res.status(400).json({ error: "Invalid plan for free activation" });

    if (!req.user.email) {
      return res.status(400).json({ error: "No email address on your account. Please update your profile with an email first." });
    }

    const trialDays = 14;
    const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    const activationToken = jwt.sign(
      { userId: req.user._id.toString(), planId, expiresAt: expiresAt.toISOString() },
      process.env.JWT_SECRET,
      { expiresIn: "72h" }
    );

    const activationLink = `${process.env.CLIENT_URL || "http://localhost:5174"}?activate=${activationToken}`;
    console.log(`[FREE TRIAL] Activation link for ${req.user.email}: ${activationLink}`);

    const { sendActivationEmail } = require("../utils/email");
    try {
      await sendActivationEmail(req.user, activationLink, trialDays);
      res.json({ success: true, message: `Activation link sent to ${req.user.email}` });
    } catch (emailErr) {
      console.error("Activation email failed:", emailErr.message);
      res.status(500).json({ error: "Failed to send activation email. Check server email configuration." });
    }
  } catch (err) {
    console.error("Activate-free error:", err);
    res.status(500).json({ error: "Failed to generate activation link" });
  }
});

// GET /api/billing/activate/:token — validates token from email link and activates plan
router.get("/activate/:token", async (req, res) => {
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const { userId, planId } = decoded;

    if (planId !== "free-trial") return res.status(400).json({ error: "Invalid activation token" });

    const trialDays = 14;
    const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const user = await User.findByIdAndUpdate(
      userId,
      {
        plan: { id: "starter", maxPages: 3, customThemes: false, expiresAt },
        role: "starter",
        updatedAt: Date.now(),
      },
      { new: true }
    ).select("-password");

    if (!user) return res.status(404).json({ error: "User not found" });

    // Record as a free invoice
    try {
      const invoiceNumber = await generateInvoiceNumber();
      await Invoice.create({
        invoiceNumber,
        userId: user._id,
        orderId: "FREE-" + Date.now(),
        planId: "free-trial",
        planName: "Free Trial (14 days)",
        amount: 0,
        currency: "INR",
        paymentMethod: "free",
        status: "paid",
        userEmail: user.email || "",
        userName: user.name || user.username,
      });
    } catch (invErr) {
      console.error("Free trial invoice error:", invErr.message);
    }

    // Return a fresh auth token so the frontend can log the user in directly
    const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      message: "Free trial activated!",
      token: authToken,
      user: { id: user._id, username: user.username, name: user.name, role: user.role, plan: user.plan, email: user.email },
    });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(400).json({ error: "Activation link has expired. Please request a new one." });
    }
    console.error("Activate error:", err);
    res.status(400).json({ error: "Invalid or expired activation link" });
  }
});

module.exports = router;
