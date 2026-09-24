const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// Loads + validates env (throws if JWT_SECRET is missing/weak) — must be required first.
const config = require("./lib/config");
const connectDB = require("./lib/db");
const { seedDefaults } = require("./lib/seedDefaults");
const { securityHeaders, noStore } = require("./middleware/securityHeaders");
const { apiLimiter } = require("./middleware/rateLimit");

// Import routes
const authRoutes = require("./routes/auth");
const themeRoutes = require("./routes/themes");
const pageRoutes = require("./routes/pages");
const contentRoutes = require("./routes/content");
const settingsRoutes = require("./routes/settings");
const billingRoutes = require("./routes/billing");
const emailLogsRoutes = require("./routes/emailLogs");
const adminRoutes = require("./routes/admin");

const app = express();

// Largest accepted JSON body. Kept generous because builder content can embed images as data URLs.
const JSON_BODY_LIMIT = "10mb";

// ============ MIDDLEWARE ============
// [SECURITY FIX 2026-09-23] Don't advertise the framework; trust the first proxy (Vercel) so req.ip is
// the real client IP (used by the rate limiter); send defensive headers on every response.
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(securityHeaders);

const allowedOrigins = config.CLIENT_URL
  .split(",")
  .map((o) => o.trim());

class CorsRejectedError extends Error {}

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without an Origin header are not from a browser page (curl, server-to-server,
      // same-origin navigation) and are not subject to CORS.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new CorsRejectedError("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use("/api", apiLimiter, noStore);

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
// [SECURITY FIX 2026-09-23] This public endpoint used to return the database name, the total number
// of users and raw DB error messages. It now only reports whether the API and DB are up.
app.get("/api/health", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
  });
});

// [SECURITY FIX 2026-09-23] REMOVED the public `GET /api/debug-login` endpoint. Without any
// authentication it looked up the "deepak" admin account, revealed whether the password was bcrypt
// hashed and confirmed that the hard-coded password "deepak@123" was valid — a free admin-login oracle.

// ============ ERROR HANDLER ============
// [SECURITY FIX 2026-09-23] Map expected client errors to 4xx instead of a generic 500, and never
// leak internal error details to the client.
app.use((err, req, res, next) => {
  if (err instanceof CorsRejectedError) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large" });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ============ LOCAL DEV: CONNECT & START ============
if (require.main === module) {
  connectDB()
    .then(async () => {
      console.log("\n🔗 Connected to MongoDB");
      console.log("📦 Seeding defaults...");
      await seedDefaults();

      app.listen(config.PORT, () => {
        console.log(`\n🚀 ProSite API running on http://localhost:${config.PORT}`);
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
