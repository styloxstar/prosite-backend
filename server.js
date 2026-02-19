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
    // Seed 6 default themes
    const themeCount = await Theme.countDocuments({ isCustom: false });
    if (themeCount === 0) {
      const themes = [
        { themeId: "light-minimal", name: "Minimal Light", type: "light", isCustom: false, colors: { bg: "#FAFAFA", surface: "#FFFFFF", surfaceAlt: "#F3F4F6", text: "#111827", textSecondary: "#6B7280", primary: "#2563EB", primaryHover: "#1D4ED8", accent: "#8B5CF6", border: "#E5E7EB", card: "#FFFFFF", gradient: "linear-gradient(135deg, #2563EB, #8B5CF6)", shadow: "0 1px 3px rgba(0,0,0,0.08)" } },
        { themeId: "light-warm", name: "Warm Sunrise", type: "light", isCustom: false, colors: { bg: "#FFFBF5", surface: "#FFFFFF", surfaceAlt: "#FEF3E2", text: "#1C1917", textSecondary: "#78716C", primary: "#EA580C", primaryHover: "#C2410C", accent: "#F59E0B", border: "#FED7AA", card: "#FFFFFF", gradient: "linear-gradient(135deg, #EA580C, #F59E0B)", shadow: "0 1px 3px rgba(234,88,12,0.08)" } },
        { themeId: "light-ocean", name: "Ocean Breeze", type: "light", isCustom: false, colors: { bg: "#F0FDFA", surface: "#FFFFFF", surfaceAlt: "#CCFBF1", text: "#134E4A", textSecondary: "#5EEAD4", primary: "#0D9488", primaryHover: "#0F766E", accent: "#06B6D4", border: "#99F6E4", card: "#FFFFFF", gradient: "linear-gradient(135deg, #0D9488, #06B6D4)", shadow: "0 1px 3px rgba(13,148,136,0.08)" } },
        { themeId: "dark-midnight", name: "Midnight Pro", type: "dark", isCustom: false, colors: { bg: "#0F172A", surface: "#1E293B", surfaceAlt: "#334155", text: "#F1F5F9", textSecondary: "#94A3B8", primary: "#3B82F6", primaryHover: "#60A5FA", accent: "#A78BFA", border: "#334155", card: "#1E293B", gradient: "linear-gradient(135deg, #3B82F6, #A78BFA)", shadow: "0 1px 3px rgba(0,0,0,0.3)" } },
        { themeId: "dark-ember", name: "Dark Ember", type: "dark", isCustom: false, colors: { bg: "#1A1110", surface: "#2D1F1E", surfaceAlt: "#3D2B29", text: "#FDE8E8", textSecondary: "#F87171", primary: "#EF4444", primaryHover: "#F87171", accent: "#FB923C", border: "#4B2F2E", card: "#2D1F1E", gradient: "linear-gradient(135deg, #EF4444, #FB923C)", shadow: "0 1px 3px rgba(239,68,68,0.15)" } },
        { themeId: "dark-neon", name: "Neon Cyber", type: "dark", isCustom: false, colors: { bg: "#0A0A0F", surface: "#12121A", surfaceAlt: "#1A1A2E", text: "#E0E0FF", textSecondary: "#8888CC", primary: "#00F0FF", primaryHover: "#33F5FF", accent: "#FF00E5", border: "#2A2A4A", card: "#12121A", gradient: "linear-gradient(135deg, #00F0FF, #FF00E5)", shadow: "0 1px 3px rgba(0,240,255,0.15)" } },
      ];
      await Theme.insertMany(themes);
      console.log("  ✅ 6 default themes seeded");
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
