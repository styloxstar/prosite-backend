const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: "",
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    default: "",
  },
  role: {
    type: String,
    enum: ["admin", "pro", "starter", "demo"],
    default: "demo",
  },
  plan: {
    id: {
      type: String,
      enum: ["starter", "pro", "enterprise", "demo"],
      default: "demo",
    },
    maxPages: {
      type: Number,
      default: 2,
    },
    customThemes: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  payment: {
    cardLast4: { type: String, default: "" },
    cardBrand: { type: String, default: "" },
    billingEmail: { type: String, default: "" },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre("save", async function (next) {
  this.updatedAt = Date.now();
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);