const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  activeTheme: {
    type: String,
    default: "dark-midnight",
  },
  sidebarCollapsed: {
    type: Boolean,
    default: false,
  },
  lastActivePage: {
    type: String,
    default: "home",
  },
  // Site font chosen on the Themes page (a Google Fonts family name).
  font: {
    type: String,
    default: "Inter",
  },
  // Site style chosen in the builder's Design panel (see routes/settings.js for the allowed values).
  design: {
    headingFont: { type: String, default: "" },
    radius: { type: String, default: "soft" },
    spacing: { type: String, default: "comfortable" },
    buttons: { type: String, default: "pill" },
    surface: { type: String, default: "glass" },
    effect: { type: String, default: "aurora" },
    motion: { type: String, default: "subtle" },
    backdrop: { type: String, default: "auto" },
    texture: { type: String, default: "auto" },
    frame: { type: String, default: "flow" },
    reveal: { type: String, default: "rise" },
    cascade: { type: String, default: "on" },
    headline: { type: String, default: "gradient" },
    hover: { type: String, default: "lift" },
  },
  // Site-wide extras for exported sites (validated in routes/settings.js).
  site: {
    progress: { type: Boolean, default: false },
    backToTop: { type: Boolean, default: true },
    cursorGlow: { type: Boolean, default: false },
    cookie: { type: Boolean, default: false },
    cookieText: { type: String, default: "We use cookies to give you the best experience on our site." },
    analyticsId: { type: String, default: "" },
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Settings", settingsSchema);