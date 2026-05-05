const express = require("express");
const XLSX = require("xlsx");
const User = require("../models/User");
const Invoice = require("../models/Invoice");
const EmailLog = require("../models/EmailLog");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// ── Admin guard ──────────────────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

router.use(authenticate, requireAdmin);

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const [
      totalUsers, newUsers30d, newUsers7d,
      planDist, totalRevenue, revenueByMonth,
      totalInvoices, emailStats,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      User.aggregate([{ $group: { _id: "$plan.id", count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Invoice.aggregate([
        { $match: { status: "paid", createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, revenue: { $sum: "$amount" }, count: { $sum: 1 } } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      Invoice.countDocuments(),
      EmailLog.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    res.json({
      totalUsers,
      newUsers30d,
      newUsers7d,
      planDist,
      totalRevenue: totalRevenue[0]?.total || 0,
      revenueByMonth,
      totalInvoices,
      emailStats,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const q = search ? {
      $or: [
        { username: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    } : {};

    const [users, total] = await Promise.all([
      User.find(q).select("-password").sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(Number(limit)).lean(),
      User.countDocuments(q),
    ]);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ── PUT /api/admin/users/:id ──────────────────────────────────────────────────
router.put("/users/:id", async (req, res) => {
  try {
    const { name, email, role, planId, maxPages } = req.body;

    const VALID_ROLES = ["admin", "pro", "starter", "demo"];
    const VALID_PLANS = ["demo", "free-trial", "starter", "pro", "enterprise"];

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
    }
    if (planId && !VALID_PLANS.includes(planId)) {
      return res.status(400).json({ error: `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}` });
    }

    // Email uniqueness check
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      const taken = await User.findOne({ email: email.trim().toLowerCase(), _id: { $ne: req.params.id } });
      if (taken) return res.status(400).json({ error: "Email already in use by another account" });
    }

    const PLAN_PAGES = { demo: 2, "free-trial": 3, starter: 3, pro: 8, enterprise: 25 };
    const update = { updatedAt: Date.now() };
    if (name)   update.name = name.trim();
    if (email)  update.email = email.trim().toLowerCase();
    if (role)   update.role = role;
    if (planId) {
      update["plan.id"] = planId;
      update["plan.maxPages"] = maxPages || PLAN_PAGES[planId] || 2;
      update["plan.customThemes"] = ["pro", "enterprise"].includes(planId);
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password").lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error("Admin update user error:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete("/users/:id", async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ── GET /api/admin/invoices ───────────────────────────────────────────────────
router.get("/invoices", async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const q = search ? {
      $or: [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
      ],
    } : {};

    const [invoices, total] = await Promise.all([
      Invoice.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
      Invoice.countDocuments(q),
    ]);

    res.json({ invoices, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// ── GET /api/admin/email-logs ─────────────────────────────────────────────────
router.get("/email-logs", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [logs, total] = await Promise.all([
      EmailLog.find().sort({ sentAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
      EmailLog.countDocuments(),
    ]);
    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch email logs" });
  }
});

// ── GET /api/admin/export/users ───────────────────────────────────────────────
router.get("/export/users", async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();
    const rows = users.map((u) => ({
      Username: u.username,
      Name: u.name || "",
      Email: u.email || "",
      Role: u.role,
      Plan: u.plan?.id || "demo",
      "Max Pages": u.plan?.maxPages || 2,
      "Plan Expires": u.plan?.expiresAt ? new Date(u.plan.expiresAt).toLocaleDateString("en-IN") : "",
      "Joined On": new Date(u.createdAt).toLocaleDateString("en-IN"),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Users");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="prosite-users-${Date.now()}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

// ── GET /api/admin/export/invoices ────────────────────────────────────────────
router.get("/export/invoices", async (req, res) => {
  try {
    const invoices = await Invoice.find().lean();
    const rows = invoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      "User": inv.userName || "",
      "Email": inv.userEmail || "",
      "Plan": inv.planName || inv.planId,
      "Amount": inv.amount,
      "Currency": inv.currency,
      "Method": inv.paymentMethod || "upi",
      "Transaction ID": inv.upiTransactionId || "",
      "Status": inv.status,
      "Date": new Date(inv.createdAt).toLocaleDateString("en-IN"),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="prosite-invoices-${Date.now()}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

// ── GET /api/admin/export/email-logs ─────────────────────────────────────────
router.get("/export/email-logs", async (req, res) => {
  try {
    const logs = await EmailLog.find().lean();
    const rows = logs.map((l) => ({
      Type: l.type,
      Recipient: l.to,
      Subject: l.subject,
      Status: l.status,
      Error: l.errorMessage || "",
      "Sent At": new Date(l.sentAt).toLocaleString("en-IN"),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 50 }, { wch: 8 }, { wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, "Email Logs");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="prosite-email-logs-${Date.now()}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

module.exports = router;
