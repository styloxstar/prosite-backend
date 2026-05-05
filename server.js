const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./lib/db");

// Import routes
const authRoutes = require("./routes/auth");
const themeRoutes = require("./routes/themes");
const pageRoutes = require("./routes/pages");
const contentRoutes = require("./routes/content");
const settingsRoutes = require("./routes/settings");
const billingRoutes = require("./routes/billing");
const emailLogsRoutes = require("./routes/emailLogs");
const adminRoutes = require("./routes/admin");

// Import models for seeding
const User = require("./models/User");
const Theme = require("./models/Theme");
const Page = require("./models/Page");
const Settings = require("./models/Settings");

const app = express();

// ============ MIDDLEWARE ============
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

// ============ ROUTES ============
app.use("/api/auth", authRoutes);
app.use("/api/themes", themeRoutes);
app.use("/api/pages", pageRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/email-logs", emailLogsRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/api/health", async (req, res) => {
  const mongoose = require("mongoose");
  const dbState = mongoose.connection.readyState; // 0=disconnected, 1=connected, 2=connecting
  let userCount = 0;
  let dbName = "unknown";
  try {
    dbName = mongoose.connection.db?.databaseName || "not connected";
    userCount = await User.countDocuments();
  } catch (e) {
    dbName = "error: " + e.message;
  }
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    db: { state: dbState, name: dbName, users: userCount },
  });
});

// Debug endpoint (REMOVE after fixing)
app.get("/api/debug-login", async (req, res) => {
  const bcrypt = require("bcryptjs");
  const result = { bodyReceived: req.body, bodyType: typeof req.body };
  try {
    const user = await User.findOne({ username: "deepak" });
    result.userFound = !!user;
    if (user) {
      result.storedPasswordLength = user.password?.length;
      result.isBcryptHash = user.password?.startsWith("$2");
      result.passwordMatch = await bcrypt.compare("deepak@123", user.password);
    }
  } catch (e) {
    result.error = e.message;
  }
  res.json(result);
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ============ SEED DEFAULT DATA ============
async function seedDefaults() {
  try {
    // Seed 16 default themes (6 light + 10 dark)
    const themeCount = await Theme.countDocuments({ isCustom: false });
    if (themeCount === 0) {
      const themes = [
        // Light themes
        { themeId: "light-minimal", name: "Clean Slate", type: "light", isCustom: false, colors: { bg: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#F1F5F9", text: "#0F172A", textSecondary: "#64748B", primary: "#2563EB", primaryHover: "#1D4ED8", accent: "#7C3AED", border: "#E2E8F0", card: "#FFFFFF", gradient: "linear-gradient(135deg, #2563EB, #7C3AED)", shadow: "0 1px 3px rgba(0,0,0,0.08)" } },
        { themeId: "light-warm", name: "Warm Sunrise", type: "light", isCustom: false, colors: { bg: "#FFFBF5", surface: "#FFFFFF", surfaceAlt: "#FFF7ED", text: "#1C1917", textSecondary: "#6E6560", primary: "#EA580C", primaryHover: "#C2410C", accent: "#F59E0B", border: "#FDE5CC", card: "#FFFFFF", gradient: "linear-gradient(135deg, #EA580C, #F59E0B)", shadow: "0 1px 3px rgba(234,88,12,0.08)" } },
        { themeId: "light-ocean", name: "Ocean Breeze", type: "light", isCustom: false, colors: { bg: "#F0FDFA", surface: "#FFFFFF", surfaceAlt: "#E6FAF5", text: "#134E4A", textSecondary: "#4D7C77", primary: "#0D9488", primaryHover: "#0F766E", accent: "#06B6D4", border: "#B2F0E4", card: "#FFFFFF", gradient: "linear-gradient(135deg, #0D9488, #06B6D4)", shadow: "0 1px 3px rgba(13,148,136,0.08)" } },
        { themeId: "light-rose", name: "Rose Petal", type: "light", isCustom: false, colors: { bg: "#FFF5F7", surface: "#FFFFFF", surfaceAlt: "#FFF0F3", text: "#1A1023", textSecondary: "#7D6B75", primary: "#E11D48", primaryHover: "#BE123C", accent: "#EC4899", border: "#FECDD3", card: "#FFFFFF", gradient: "linear-gradient(135deg, #E11D48, #EC4899)", shadow: "0 1px 3px rgba(225,29,72,0.08)" } },
        { themeId: "light-sage", name: "Sage Garden", type: "light", isCustom: false, colors: { bg: "#F5F7F2", surface: "#FFFFFF", surfaceAlt: "#F0F4EC", text: "#1A2E16", textSecondary: "#5C6E56", primary: "#4D7C0F", primaryHover: "#3F6212", accent: "#65A30D", border: "#D4E0C8", card: "#FFFFFF", gradient: "linear-gradient(135deg, #4D7C0F, #65A30D)", shadow: "0 1px 3px rgba(77,124,15,0.08)" } },
        { themeId: "light-arctic", name: "Arctic Frost", type: "light", isCustom: false, colors: { bg: "#F0F4F8", surface: "#FFFFFF", surfaceAlt: "#EDF1F7", text: "#1E293B", textSecondary: "#5B6B82", primary: "#0284C7", primaryHover: "#0369A1", accent: "#0EA5E9", border: "#CBD5E1", card: "#FFFFFF", gradient: "linear-gradient(135deg, #0284C7, #0EA5E9)", shadow: "0 1px 3px rgba(2,132,199,0.08)" } },
        // Dark themes
        { themeId: "dark-midnight", name: "Midnight Pro", type: "dark", isCustom: false, colors: { bg: "#0B0F1A", surface: "#151A2E", surfaceAlt: "#1E2440", text: "#F1F5F9", textSecondary: "#94A3B8", primary: "#3B82F6", primaryHover: "#60A5FA", accent: "#A78BFA", border: "#252B45", card: "#151A2E", gradient: "linear-gradient(135deg, #3B82F6, #A78BFA)", shadow: "0 1px 3px rgba(0,0,0,0.3)" } },
        { themeId: "dark-neon", name: "Neon Cyber", type: "dark", isCustom: false, colors: { bg: "#0A0A14", surface: "#13131F", surfaceAlt: "#1C1C32", text: "#E8E8FF", textSecondary: "#9090CC", primary: "#00F0FF", primaryHover: "#33F5FF", accent: "#FF00E5", border: "#28284A", card: "#13131F", gradient: "linear-gradient(135deg, #00F0FF, #FF00E5)", shadow: "0 1px 3px rgba(0,240,255,0.15)" } },
        { themeId: "dark-obsidian", name: "Obsidian Gold", type: "dark", isCustom: false, colors: { bg: "#08080A", surface: "#141416", surfaceAlt: "#1E1E22", text: "#FAFAF9", textSecondary: "#A1A1AA", primary: "#E8B828", primaryHover: "#FFD04A", accent: "#F59E0B", border: "#2A2A2E", card: "#141416", gradient: "linear-gradient(135deg, #E8B828, #F59E0B)", shadow: "0 1px 3px rgba(232,184,40,0.15)" } },
        { themeId: "dark-genesis", name: "Genesis", type: "dark", isCustom: false, colors: { bg: "#0A0B1E", surface: "#12143A", surfaceAlt: "#1A1C48", text: "#F0F0FF", textSecondary: "#8B8CC8", primary: "#E91E8D", primaryHover: "#FF3EA8", accent: "#FFB800", border: "#252660", card: "#12143A", gradient: "linear-gradient(135deg, #E91E8D, #FFB800)", shadow: "0 1px 3px rgba(233,30,141,0.15)" } },
        { themeId: "dark-phantom", name: "Phantom", type: "dark", isCustom: false, colors: { bg: "#0C0818", surface: "#171030", surfaceAlt: "#201845", text: "#F0ECFF", textSecondary: "#B0A0E0", primary: "#8B5CF6", primaryHover: "#A78BFA", accent: "#00D4FF", border: "#2A2050", card: "#171030", gradient: "linear-gradient(135deg, #8B5CF6, #00D4FF)", shadow: "0 1px 3px rgba(139,92,246,0.15)" } },
        { themeId: "dark-aurora", name: "Aurora Borealis", type: "dark", isCustom: false, colors: { bg: "#060D1A", surface: "#0C1B32", surfaceAlt: "#142845", text: "#E0F2FE", textSecondary: "#7DD3FC", primary: "#06B6D4", primaryHover: "#22D3EE", accent: "#A78BFA", border: "#1C3D5F", card: "#0C1B32", gradient: "linear-gradient(135deg, #06B6D4, #A78BFA)", shadow: "0 1px 3px rgba(6,182,212,0.15)" } },
        { themeId: "dark-cosmos", name: "Cosmos", type: "dark", isCustom: false, colors: { bg: "#080812", surface: "#121225", surfaceAlt: "#1A1A38", text: "#F0F0FF", textSecondary: "#9898C8", primary: "#EC4899", primaryHover: "#F472B6", accent: "#3B82F6", border: "#252545", card: "#121225", gradient: "linear-gradient(135deg, #EC4899, #3B82F6)", shadow: "0 1px 3px rgba(236,72,153,0.15)" } },
        { themeId: "dark-ember", name: "Ember Glow", type: "dark", isCustom: false, colors: { bg: "#140A0A", surface: "#1E1212", surfaceAlt: "#2C1A1A", text: "#FEF2F2", textSecondary: "#FCA5A5", primary: "#EF4444", primaryHover: "#F87171", accent: "#FB923C", border: "#3A2020", card: "#1E1212", gradient: "linear-gradient(135deg, #EF4444, #FB923C)", shadow: "0 1px 3px rgba(239,68,68,0.15)" } },
        { themeId: "dark-forest", name: "Emerald Night", type: "dark", isCustom: false, colors: { bg: "#060E0C", surface: "#0E1C18", surfaceAlt: "#182C25", text: "#ECFDF5", textSecondary: "#86EFAC", primary: "#10B981", primaryHover: "#34D399", accent: "#2DD4BF", border: "#1E3B32", card: "#0E1C18", gradient: "linear-gradient(135deg, #10B981, #2DD4BF)", shadow: "0 1px 3px rgba(16,185,129,0.15)" } },
        { themeId: "dark-carbon", name: "Carbon", type: "dark", isCustom: false, colors: { bg: "#0E0E10", surface: "#18181C", surfaceAlt: "#222228", text: "#F5F5F5", textSecondary: "#A0A0A8", primary: "#3B82F6", primaryHover: "#60A5FA", accent: "#38BDF8", border: "#2C2C32", card: "#18181C", gradient: "linear-gradient(135deg, #3B82F6, #38BDF8)", shadow: "0 1px 3px rgba(0,0,0,0.3)" } },
        { themeId: "dark-nebula", name: "Nebula", type: "dark", isCustom: false, colors: { bg: "#070510", surface: "#110E28", surfaceAlt: "#1A1540", text: "#F0EEFF", textSecondary: "#A89EDB", primary: "#C084FC", primaryHover: "#D8B4FE", accent: "#F0ABFC", border: "#251E50", card: "#110E28", gradient: "linear-gradient(135deg, #C084FC, #F0ABFC)", shadow: "0 1px 3px rgba(192,132,252,0.15)" } },
        { themeId: "dark-slate", name: "Slate Steel", type: "dark", isCustom: false, colors: { bg: "#0C0C0F", surface: "#161620", surfaceAlt: "#1E1E2C", text: "#EEEEF2", textSecondary: "#9898A8", primary: "#2DD4BF", primaryHover: "#5EEAD4", accent: "#34D399", border: "#28283A", card: "#161620", gradient: "linear-gradient(135deg, #2DD4BF, #34D399)", shadow: "0 1px 3px rgba(45,212,191,0.15)" } },
        // Light themes (continued)
        { themeId: "light-lavender", name: "Lavender Dream", type: "light", isCustom: false, colors: { bg: "#F5F3FF", surface: "#FFFFFF", surfaceAlt: "#F3F0FF", text: "#1E1B4B", textSecondary: "#6D6298", primary: "#7C3AED", primaryHover: "#6D28D9", accent: "#A78BFA", border: "#DDD6FE", card: "#FFFFFF", gradient: "linear-gradient(135deg, #7C3AED, #A78BFA)", shadow: "0 1px 3px rgba(124,58,237,0.08)" } },
        { themeId: "light-peach", name: "Peach Blossom", type: "light", isCustom: false, colors: { bg: "#FFF7F0", surface: "#FFFFFF", surfaceAlt: "#FFF2E8", text: "#2D1A0E", textSecondary: "#7A5E48", primary: "#F97316", primaryHover: "#EA580C", accent: "#FB923C", border: "#FDDCB5", card: "#FFFFFF", gradient: "linear-gradient(135deg, #F97316, #FB923C)", shadow: "0 1px 3px rgba(249,115,22,0.08)" } },
        { themeId: "light-mint", name: "Fresh Mint", type: "light", isCustom: false, colors: { bg: "#F0FDF4", surface: "#FFFFFF", surfaceAlt: "#ECFDF5", text: "#14532D", textSecondary: "#4D7C5E", primary: "#16A34A", primaryHover: "#15803D", accent: "#22C55E", border: "#BBF7D0", card: "#FFFFFF", gradient: "linear-gradient(135deg, #16A34A, #22C55E)", shadow: "0 1px 3px rgba(22,163,74,0.08)" } },
        { themeId: "light-sky", name: "Clear Sky", type: "light", isCustom: false, colors: { bg: "#F0F9FF", surface: "#FFFFFF", surfaceAlt: "#EFF8FF", text: "#0C4A6E", textSecondary: "#4B7FA0", primary: "#0EA5E9", primaryHover: "#0284C7", accent: "#38BDF8", border: "#BAE6FD", card: "#FFFFFF", gradient: "linear-gradient(135deg, #0EA5E9, #38BDF8)", shadow: "0 1px 3px rgba(14,165,233,0.08)" } },
        { themeId: "light-sand", name: "Desert Sand", type: "light", isCustom: false, colors: { bg: "#FDFAF5", surface: "#FFFFFF", surfaceAlt: "#FAF5E8", text: "#292014", textSecondary: "#7A6C52", primary: "#B45309", primaryHover: "#92400E", accent: "#D97706", border: "#E8DCC0", card: "#FFFFFF", gradient: "linear-gradient(135deg, #B45309, #D97706)", shadow: "0 1px 3px rgba(180,83,9,0.08)" } },
        { themeId: "light-coral", name: "Coral Reef", type: "light", isCustom: false, colors: { bg: "#FFF5F5", surface: "#FFFFFF", surfaceAlt: "#FFF0F0", text: "#450A0A", textSecondary: "#7A4545", primary: "#DC2626", primaryHover: "#B91C1C", accent: "#F87171", border: "#FECACA", card: "#FFFFFF", gradient: "linear-gradient(135deg, #DC2626, #F87171)", shadow: "0 1px 3px rgba(220,38,38,0.08)" } },
      ];
      await Theme.insertMany(themes);
      console.log("  ✅ 24 default themes seeded (12 light + 12 dark)");
    }

    // Seed default admin user (admin/admin)
    const adminUser = await User.findOne({ username: "admin" });
    if (!adminUser) {
      const a = await User.create({
        username: "admin",
        password: "admin",
        name: "Admin",
        email: "",
        role: "admin",
        plan: { id: "enterprise", maxPages: 25, customThemes: true },
      });
      await Settings.create({ userId: a._id, activeTheme: "dark-midnight" });
      await Page.insertMany([
        { userId: a._id, pageId: "home", name: "Home", slug: "home", components: [], order: 0 },
      ]);
      console.log("  ✅ Admin user seeded (admin/admin)");
    }

    // Seed deepak user with enterprise plan
    const deepak = await User.findOne({ username: "deepak" });
    if (!deepak) {
      const user = await User.create({
        username: "deepak",
        password: "deepak@123",
        name: "Deepak",
        email: "deepak@prosite.com",
        role: "admin",
        plan: { id: "enterprise", maxPages: 25, customThemes: true },
      });

      await Settings.create({ userId: user._id, activeTheme: "dark-midnight" });

      await Page.insertMany([
        { userId: user._id, pageId: "home", name: "Home", slug: "home", components: ["navbar", "hero", "features", "stats", "testimonials", "footer"], order: 0 },
        { userId: user._id, pageId: "about", name: "About", slug: "about", components: ["navbar", "gallery", "footer"], order: 1 },
        { userId: user._id, pageId: "contact", name: "Contact", slug: "contact", components: ["navbar", "form", "footer"], order: 2 },
        { userId: user._id, pageId: "admin", name: "Admin Panel", slug: "admin", components: ["sidebar", "dashboard", "table"], order: 3 },
        { userId: user._id, pageId: "pricing-page", name: "Pricing", slug: "pricing", components: ["navbar", "pricing", "footer"], order: 4 },
      ]);

      console.log("  ✅ User 'deepak' seeded (Enterprise plan, 5 pages)");
    }
  } catch (err) {
    console.error("  ❌ Seed error:", err.message);
  }
}

// ============ LOCAL DEV: CONNECT & START ============
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB()
    .then(async () => {
      console.log("\n🔗 Connected to MongoDB");
      console.log("📦 Seeding defaults...");
      await seedDefaults();

      app.listen(PORT, () => {
        console.log(`\n🚀 ProSite API running on http://localhost:${PORT}`);
        console.log("✨ Ready!\n");
      });
    })
    .catch((err) => {
      console.error("❌ MongoDB connection failed:", err.message);
      process.exit(1);
    });
}

module.exports = app;
module.exports.seedDefaults = seedDefaults;
