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
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Settings", settingsSchema);