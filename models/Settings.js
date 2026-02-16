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
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Settings", settingsSchema);