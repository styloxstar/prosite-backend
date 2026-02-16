const mongoose = require("mongoose");

const themeSchema = new mongoose.Schema({
  themeId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["light", "dark"],
    required: true,
  },
  premium: {
    type: Boolean,
    default: false,
  },
  isCustom: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  colors: {
    bg: String,
    surface: String,
    surfaceAlt: String,
    text: String,
    textSecondary: String,
    primary: String,
    primaryHover: String,
    accent: String,
    border: String,
    card: String,
    gradient: String,
    shadow: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Theme", themeSchema);