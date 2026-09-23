const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const Invoice = require("../models/Invoice");
const { authenticate } = require("../middleware/auth");
const { emailLimiter, paymentLimiter } = require("../middleware/rateLimit");
const { sendPaymentConfirmationEmail, sendActivationEmail } = require("../utils/email");
const { generateInvoicePDF } = require("../utils/invoice-pdf");
const { signAuthToken, signActivationToken, verifyActivationToken } = require("../lib/tokens");
const { isString, isValidObjectId } = require("../lib/validators");
const config = require("../lib/config");

const router = express.Router();

// UPI Payee details — configured via UPI_PAYEE_ID / UPI_PAYEE_NAME env vars
const UPI_PAYEE_ID = config.UPI_PAYEE_ID;
const UPI_PAYEE_NAME = config.UPI_PAYEE_NAME || "   ";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAID_PLAN_DURATION_DAYS = 30;
const FREE_TRIAL_DAYS = 14;
const ORDER_TTL_MS = 30 * 60 * 1000;
const FREE_TRIAL_PLAN_ID = "free-trial";

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
    id: FREE_TRIAL_PLAN_ID,
    name: "Free Trial",
    prices: { USD: 0, INR: 0, EUR: 0, GBP: 0 },
    pages: 3,
    trialDays: FREE_TRIAL_DAYS,
    features: ["3 Pages", "6 Free Themes", "Basic Components", "14-Day Free Trial", "No Credit Card Needed"],
  },
];

const PLAN_CONFIG = {
  starter: { maxPages: 3, customThemes: false },
  pro: { maxPages: 8, customThemes: true },
  enterprise: { maxPages: 25, customThemes: true },
  "free-trial": { maxPages: 3, customThemes: false },
};

// [SECURITY FIX 2026-09-23] The free trial has its own e-mail-verified flow; allowing it through the
// paid order flow let users "confirm" a ₹0 order repeatedly and skip that flow entirely.
const PAYABLE_PLAN_IDS = ["starter", "pro", "enterprise"];

// A UPI UTR / transaction reference is alphanumeric (12 digits for most apps, longer for some).
const UPI_TRANSACTION_ID_REGEX = /^[A-Za-z0-9]{8,35}$/;

/**
 * Role granted by a plan.
 * [SECURITY FIX 2026-09-23] Buying (or "confirming") the Enterprise plan used to set `role: "admin"`,
 * giving any customer the admin panel: every user's data, all invoices, and the ability to edit or
 * delete other accounts. Plans now only grant customer roles; plan features come from `plan.*`.
 * Existing admins keep their role when they change plans.
 */
function roleForPlan(planId, currentRole) {
  if (currentRole === "admin") return "admin";
  if (planId === "pro" || planId === "enterprise") return "pro";
  return "starter";
}

// In-memory payment orders (use DB in production)
const pendingOrders = new Map();

function removeExpiredOrders() {
  const now = Date.now();
  for (const [id, order] of pendingOrders) {
    if (now - order.createdAt > ORDER_TTL_MS) pendingOrders.delete(id);
  }
}

// Auto-incrementing invoice number generator
async function generateInvoiceNumber() {
  const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 });
  if (!lastInvoice) return "INV-001";
  const lastNum = parseInt(lastInvoice.invoiceNumber.split("-")[1], 10);
  return "INV-" + String(lastNum + 1).padStart(3, "0");
}

const DUPLICATE_KEY_ERROR = 11000;
const INVOICE_NUMBER_RETRIES = 3;

/** Creates an invoice, retrying if two requests raced for the same invoice number. */
async function createInvoice(fields) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await Invoice.create({ ...fields, invoiceNumber: await generateInvoiceNumber() });
    } catch (err) {
      if (err.code !== DUPLICATE_KEY_ERROR || attempt >= INVOICE_NUMBER_RETRIES) throw err;
    }
  }
}

function toPublicUser(user) {
  return { id: user._id, username: user.username, name: user.name, role: user.role, plan: user.plan };
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
    const { planId } = req.body;

    if (!isString(planId) || !PAYABLE_PLAN_IDS.includes(planId)) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const plan = PLANS.find((p) => p.id === planId);

    // [SECURITY FIX 2026-09-23] UPI only settles in INR, but the amount used to be taken from the
    // client-chosen display currency: choosing "USD" produced `am=9&cu=INR`, i.e. the Pro plan for ₹9
    // instead of ₹499. Any currency key was also accepted (`"constructor"` → a function as amount).
    // The charge is now always the server-side INR price; `currency` from the client is ignored.
    const amount = plan.prices.INR;
    const currency = "INR";

    const orderId = "PS" + Date.now() + crypto.randomBytes(4).toString("hex").toUpperCase();

    // Build UPI deep link
    const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_PAYEE_ID)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${amount}&cu=${currency}&tn=${encodeURIComponent(`ProSite ${plan.name} Plan`)}&tr=${orderId}`;

    removeExpiredOrders();
    pendingOrders.set(orderId, {
      userId: req.user._id.toString(),
      planId,
      amount,
      currency,
      status: "pending",
      createdAt: Date.now(),
    });

    res.json({
      orderId,
      amount,
      currency,
      planName: plan.name,
      upiLink,
      upiId: UPI_PAYEE_ID,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// POST /api/billing/confirm-payment — user confirms UPI payment received
//
// ⚠️ KNOWN LIMITATION (documented 2026-09-23): the server cannot see the UPI transfer itself, so this
// endpoint still trusts the user's claim. The checks below stop replay/reuse and obvious fakes, but
// real protection needs a payment gateway webhook (Razorpay/Cashfree/PhonePe) or manual admin review.
router.post("/confirm-payment", authenticate, paymentLimiter, async (req, res) => {
  const { orderId, upiTransactionId } = req.body;

  if (!isString(orderId) || !orderId) {
    return res.status(400).json({ error: "Order ID required" });
  }

  const order = pendingOrders.get(orderId);
  if (!order) {
    return res.status(404).json({ error: "Order not found or expired" });
  }
  if (order.userId !== req.user._id.toString()) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  if (order.status !== "pending") {
    return res.status(400).json({ error: "Order already completed" });
  }

  // [SECURITY FIX 2026-09-23] The transaction ID was optional and never checked, so an upgrade needed
  // no payment evidence at all, and one real UTR could be reused for unlimited upgrades.
  const transactionId = isString(upiTransactionId) ? upiTransactionId.trim() : "";
  if (!UPI_TRANSACTION_ID_REGEX.test(transactionId)) {
    return res.status(400).json({ error: "Enter a valid UPI transaction / UTR number" });
  }

  // Claim the order synchronously so two parallel requests cannot both upgrade the account.
  order.status = "processing";

  try {
    if (await Invoice.exists({ upiTransactionId: transactionId })) {
      order.status = "pending";
      return res.status(409).json({ error: "This transaction ID has already been used" });
    }

    const planId = order.planId;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        plan: {
          id: planId,
          ...PLAN_CONFIG[planId],
          expiresAt: new Date(Date.now() + PAID_PLAN_DURATION_DAYS * DAY_MS),
        },
        role: roleForPlan(planId, req.user.role),
        payment: {
          method: "upi",
          lastOrderId: orderId,
          upiTransactionId: transactionId,
        },
        updatedAt: Date.now(),
      },
      { new: true }
    ).select("-password");

    order.status = "completed";

    // Generate invoice
    let invoice = null;
    try {
      const plan = PLANS.find((p) => p.id === planId);
      invoice = await createInvoice({
        userId: req.user._id,
        orderId,
        planId,
        planName: plan.name,
        amount: order.amount,
        currency: order.currency,
        paymentMethod: "upi",
        upiTransactionId: transactionId,
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
      user: toPublicUser(user),
      invoiceId: invoice?._id || null,
      invoiceNumber: invoice?.invoiceNumber || null,
    });
  } catch (err) {
    if (order.status === "processing") order.status = "pending";
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
    if (!isValidObjectId(req.params.invoiceId)) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    // Ownership is enforced in the query itself: users can only download their own invoices.
    const invoice = await Invoice.findOne({
      _id: req.params.invoiceId,
      userId: req.user._id,
    });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    const pdfBuffer = await generateInvoicePDF(invoice);
    const safeFileName = String(invoice.invoiceNumber).replace(/[^A-Za-z0-9-]/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Download invoice error:", err);
    res.status(500).json({ error: "Failed to generate invoice" });
  }
});

// [SECURITY FIX 2026-09-23] REMOVED `POST /api/billing/upgrade` ("legacy, backward compat").
// It upgraded ANY logged-in user to ANY plan — including Enterprise, which also granted the admin
// role — with no payment at all. The frontend no longer calls it; paid upgrades go through
// /create-order + /confirm-payment.

/** A trial may be taken once per account; the "free-trial" invoice is the record that it was used. */
function hasUsedFreeTrial(userId) {
  return Invoice.exists({ userId, planId: FREE_TRIAL_PLAN_ID });
}

// POST /api/billing/activate-free — zero-price free trial activation via email link
router.post("/activate-free", authenticate, emailLimiter, async (req, res) => {
  try {
    const { planId } = req.body;
    if (planId !== FREE_TRIAL_PLAN_ID) return res.status(400).json({ error: "Invalid plan for free activation" });

    if (!req.user.email) {
      return res.status(400).json({ error: "No email address on your account. Please update your profile with an email first." });
    }

    // [SECURITY FIX 2026-09-23] The trial could be re-activated forever (a new 14 days every time).
    if (await hasUsedFreeTrial(req.user._id)) {
      return res.status(409).json({ error: "The free trial has already been used on this account." });
    }

    const activationToken = signActivationToken(req.user._id, planId);
    const activationLink = `${config.PRIMARY_CLIENT_URL}?activate=${encodeURIComponent(activationToken)}`;
    // [SECURITY FIX 2026-09-23] The full activation link (a bearer credential) used to be written to the
    // server log here. Only the fact that one was generated is logged now.
    console.log(`[FREE TRIAL] Activation link generated for user ${req.user._id}`);

    try {
      await sendActivationEmail(req.user, activationLink, FREE_TRIAL_DAYS);
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
    const { userId, planId } = verifyActivationToken(req.params.token);

    if (planId !== FREE_TRIAL_PLAN_ID || !isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid activation token" });
    }

    // [SECURITY FIX 2026-09-23] Activation links are now single-use: the same link could previously be
    // replayed for 72h, resetting the trial and creating a new invoice each time.
    if (await hasUsedFreeTrial(userId)) {
      return res.status(409).json({ error: "This activation link has already been used." });
    }

    const existingUser = await User.findById(userId).select("role");
    if (!existingUser) return res.status(404).json({ error: "User not found" });

    const expiresAt = new Date(Date.now() + FREE_TRIAL_DAYS * DAY_MS);
    const user = await User.findByIdAndUpdate(
      userId,
      {
        plan: { id: "starter", maxPages: 3, customThemes: false, expiresAt },
        role: roleForPlan("starter", existingUser.role),
        updatedAt: Date.now(),
      },
      { new: true }
    ).select("-password");

    // Record as a free invoice (this is also what makes the link single-use)
    try {
      await createInvoice({
        userId: user._id,
        orderId: "FREE-" + Date.now(),
        planId: FREE_TRIAL_PLAN_ID,
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

    // Return a fresh auth token so the frontend can log the user in directly.
    // [SECURITY FIX 2026-09-23] This was signed as `{ id }` while the auth middleware reads `userId`,
    // so the returned token never worked; it now uses the shared, purpose-scoped signer.
    res.json({
      success: true,
      message: "Free trial activated!",
      token: signAuthToken(user._id),
      user: { ...toPublicUser(user), email: user.email },
    });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(400).json({ error: "Activation link has expired. Please request a new one." });
    }
    console.error("Activate error:", err.message);
    res.status(400).json({ error: "Invalid or expired activation link" });
  }
});

module.exports = router;
