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
        { themeId: "dark-midnight", name: "Midnight Pro", type: "dark", isCustom: false, colors: { bg: "#0F172A", surface: "#1E293B", surfaceAlt: "#334155", text: "#F1F5F9", textSecondary: "#94A3B8", primary: "#3B82F6", primaryHover: "#60A5FA", accent: "#A78BFA", border: "#334155", card: "#1E293B", gradient: "linear-gradient(135deg, #3B82F6, #A78BFA)", shadow: "0 1px 3px rgba(0,0,0,0.3)" } },
        { themeId: "dark-neon", name: "Neon Cyber", type: "dark", isCustom: false, colors: { bg: "#0A0A0F", surface: "#12121A", surfaceAlt: "#1A1A2E", text: "#E0E0FF", textSecondary: "#9090D0", primary: "#00F0FF", primaryHover: "#33F5FF", accent: "#FF00E5", border: "#2A2A4A", card: "#12121A", gradient: "linear-gradient(135deg, #00F0FF, #FF00E5)", shadow: "0 1px 3px rgba(0,240,255,0.15)" } },
        { themeId: "dark-obsidian", name: "Obsidian Gold", type: "dark", isCustom: false, colors: { bg: "#09090B", surface: "#141416", surfaceAlt: "#1E1E22", text: "#FAFAF9", textSecondary: "#A1A1AA", primary: "#D4A017", primaryHover: "#FACC15", accent: "#F59E0B", border: "#2A2A2E", card: "#141416", gradient: "linear-gradient(135deg, #D4A017, #F59E0B)", shadow: "0 1px 3px rgba(212,160,23,0.15)" } },
        { themeId: "dark-ember", name: "Ember Glow", type: "dark", isCustom: false, colors: { bg: "#1A0E0E", surface: "#261616", surfaceAlt: "#331F1F", text: "#FEF2F2", textSecondary: "#FCA5A5", primary: "#EF4444", primaryHover: "#F87171", accent: "#FB923C", border: "#3D2525", card: "#261616", gradient: "linear-gradient(135deg, #EF4444, #FB923C)", shadow: "0 1px 3px rgba(239,68,68,0.15)" } },
        { themeId: "dark-forest", name: "Emerald Night", type: "dark", isCustom: false, colors: { bg: "#071210", surface: "#0F1F1B", surfaceAlt: "#1A2E28", text: "#ECFDF5", textSecondary: "#86EFAC", primary: "#10B981", primaryHover: "#34D399", accent: "#2DD4BF", border: "#1E3B32", card: "#0F1F1B", gradient: "linear-gradient(135deg, #10B981, #2DD4BF)", shadow: "0 1px 3px rgba(16,185,129,0.15)" } },
        { themeId: "dark-aurora", name: "Aurora Borealis", type: "dark", isCustom: false, colors: { bg: "#050D1A", surface: "#0C1B32", surfaceAlt: "#142845", text: "#E0F2FE", textSecondary: "#7DD3FC", primary: "#06B6D4", primaryHover: "#22D3EE", accent: "#A78BFA", border: "#1C3D5F", card: "#0C1B32", gradient: "linear-gradient(135deg, #06B6D4, #A78BFA)", shadow: "0 1px 3px rgba(6,182,212,0.15)" } },
        { themeId: "dark-violet", name: "Violet Haze", type: "dark", isCustom: false, colors: { bg: "#0E0B1A", surface: "#1A1428", surfaceAlt: "#261E3A", text: "#F5F3FF", textSecondary: "#C4B5FD", primary: "#A855F7", primaryHover: "#C084FC", accent: "#D946EF", border: "#2F2548", card: "#1A1428", gradient: "linear-gradient(135deg, #A855F7, #D946EF)", shadow: "0 1px 3px rgba(168,85,247,0.15)" } },
        { themeId: "dark-carbon", name: "Carbon Fiber", type: "dark", isCustom: false, colors: { bg: "#111111", surface: "#1A1A1C", surfaceAlt: "#252527", text: "#F5F5F5", textSecondary: "#A0A0A5", primary: "#3B82F6", primaryHover: "#60A5FA", accent: "#38BDF8", border: "#303032", card: "#1A1A1C", gradient: "linear-gradient(135deg, #3B82F6, #38BDF8)", shadow: "0 1px 3px rgba(0,0,0,0.3)" } },
        { themeId: "dark-sapphire", name: "Sapphire Depth", type: "dark", isCustom: false, colors: { bg: "#080C1A", surface: "#0E1530", surfaceAlt: "#172042", text: "#E8ECFF", textSecondary: "#93A5E0", primary: "#4F6EF7", primaryHover: "#6D8AFF", accent: "#818CF8", border: "#1E2654", card: "#0E1530", gradient: "linear-gradient(135deg, #4F6EF7, #818CF8)", shadow: "0 1px 3px rgba(79,110,247,0.15)" } },
        { themeId: "dark-mocha", name: "Mocha Luxe", type: "dark", isCustom: false, colors: { bg: "#151210", surface: "#1E1A16", surfaceAlt: "#2A2520", text: "#FAF8F5", textSecondary: "#B5A99B", primary: "#D97706", primaryHover: "#F59E0B", accent: "#CA8A04", border: "#3D3630", card: "#1E1A16", gradient: "linear-gradient(135deg, #D97706, #CA8A04)", shadow: "0 1px 3px rgba(217,119,6,0.15)" } },
      ];
      await Theme.insertMany(themes);
      console.log("  ✅ 16 default themes seeded (6 light + 10 dark)");
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
