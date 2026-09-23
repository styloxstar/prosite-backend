const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 12;

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 30,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: "",
    maxlength: 254,
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    default: "",
    maxlength: 100,
  },
  role: {
    type: String,
    enum: ["admin", "pro", "starter", "demo"],
    default: "demo",
  },
  plan: {
    id: {
      type: String,
      // [SECURITY FIX 2026-09-23] "free-trial" is written by billing/admin routes but was missing from
      // the enum, so documents only stayed valid because those writes skipped validation.
      enum: ["starter", "pro", "enterprise", "demo", "free-trial"],
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
  // [SECURITY FIX 2026-09-23] Lets the auth middleware reject tokens issued before a password change.
  passwordChangedAt: {
    type: Date,
    default: null,
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
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// [SECURITY FIX 2026-09-23] Defence in depth: the bcrypt hash can never leak through res.json(user),
// even if a future route forgets `.select("-password")`.
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
