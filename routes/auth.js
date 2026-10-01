const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Settings = require("../models/Settings");
const Page = require("../models/Page");
const { authenticate } = require("../middleware/auth");
const { loginLimiter, registerLimiter, forgotPasswordLimiter, forgotPasswordTargetLimiter, resetPasswordLimiter } = require("../middleware/rateLimit");
const { signAuthToken, signPasswordResetToken, verifyPasswordResetToken, passwordFingerprint, PASSWORD_RESET_TTL_MINUTES } = require("../lib/tokens");
const { sendPasswordResetEmail, sendPasswordChangedEmail } = require("../utils/email");
const config = require("../lib/config");
const {
  USERNAME_REGEX,
  LIMITS,
  isString,
  isValidEmail,
} = require("../lib/validators");

const router = express.Router();

const USERNAME_RULE_MESSAGE = "Username must be 3-30 characters: letters, numbers, underscores only";
const PASSWORD_RULE_MESSAGE = `Password must be ${LIMITS.PASSWORD_MIN}-${LIMITS.PASSWORD_MAX} characters`;

// [SECURITY FIX 2026-09-23] A real bcrypt hash compared against when the username does not exist, so
// "unknown user" and "wrong password" take the same time (prevents username enumeration by timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("prosite-timing-equaliser", 12);

function isValidPassword(password) {
  return isString(password) && password.length >= LIMITS.PASSWORD_MIN && password.length <= LIMITS.PASSWORD_MAX;
}

/**
 * The public shape of a user returned to the frontend.
 * [SECURITY FIX 2026-09-23] `isFullAccess` used to be `username === "deepak"`, i.e. privileges tied to
 * a username anyone could register if that account were ever renamed/deleted. It is now role-based.
 */
function toPublicUser(user) {
  return {
    id: user._id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    isFullAccess: user.role === "admin",
    createdAt: user.createdAt,
  };
}

async function createDefaultWorkspace(userId) {
  await Settings.create({ userId });
  await Page.insertMany([
    { userId, pageId: "home", name: "Home", slug: "home", components: [], order: 0 },
    { userId, pageId: "about", name: "About", slug: "about", components: [], order: 1 },
  ]);
}

// POST /api/auth/register
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { username, password, email, name } = req.body;

    // [SECURITY FIX 2026-09-23] Type + format validation. Previously any JSON type was accepted (an
    // object here crashed `.toLowerCase()`), usernames had no format rule (while the profile route did,
    // so such users could never save their profile) and e-mail was stored unvalidated, then used as
    // the recipient of activation mails.
    if (!isString(username) || !isString(password)) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      return res.status(400).json({ error: USERNAME_RULE_MESSAGE });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: PASSWORD_RULE_MESSAGE });
    }

    const normalizedEmail = isString(email) ? email.trim().toLowerCase() : "";
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const displayName = isString(name) && name.trim() ? name.trim() : normalizedUsername;
    if (displayName.length > LIMITS.NAME) {
      return res.status(400).json({ error: `Name must be at most ${LIMITS.NAME} characters` });
    }

    if (await User.exists({ username: normalizedUsername })) {
      return res.status(409).json({ error: "Username already taken" });
    }
    if (normalizedEmail && (await User.exists({ email: normalizedEmail }))) {
      return res.status(409).json({ error: "Email is already in use by another account" });
    }

    // Role and plan are fixed server-side — never taken from the request body.
    const user = await User.create({
      username: normalizedUsername,
      password,
      email: normalizedEmail,
      name: displayName,
      role: "demo",
      plan: { id: "demo", maxPages: 2, customThemes: false },
    });

    await createDefaultWorkspace(user._id);

    res.status(201).json({ token: signAuthToken(user._id), user: toPublicUser(user) });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!isString(username) || !isString(password) || !username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    if (password.length > LIMITS.PASSWORD_MAX) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() });
    const isMatch = user
      ? await user.comparePassword(password)
      : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);

    if (!user || !isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ token: signAuthToken(user._id), user: toPublicUser(user) });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ── Forgot / reset password ────────────────────────────────────────────────────────────────────────
// Same answer whether or not an account matches, so the form can't be used to discover accounts.
const RESET_REQUESTED_MESSAGE = "If an account matches, we've sent a link to reset the password to its email address.";
const RESET_LINK_INVALID = "This reset link is invalid or has expired. Please request a new one.";

/** "deepak@example.com" → "de••••@example.com" (shown on the reset page so users know which account). */
function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return "";
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

/** The user a reset token belongs to, or null when the token is bad, expired or already used. */
async function userForResetToken(token) {
  if (!isString(token) || token.length > 2048) return null;
  let decoded;
  try { decoded = verifyPasswordResetToken(token); } catch { return null; }
  const user = await User.findById(decoded.userId);
  // Single use: the fingerprint changes as soon as the password does.
  if (!user || decoded.pf !== passwordFingerprint(user)) return null;
  return user;
}

// POST /api/auth/forgot-password  { identifier: email or username }
router.post("/forgot-password", forgotPasswordLimiter, forgotPasswordTargetLimiter, async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!isString(identifier) || !identifier.trim() || identifier.length > 254) {
      return res.status(400).json({ error: "Enter the email address or username of your account" });
    }
    const id = identifier.trim().toLowerCase();
    const user = await User.findOne(id.includes("@") ? { email: id } : { username: id });

    if (user?.email) {
      const token = signPasswordResetToken(user);
      const resetLink = `${config.PRIMARY_CLIENT_URL}?reset=${encodeURIComponent(token)}`;
      // Sent in the background: waiting for SMTP would make "account exists" measurably slower.
      sendPasswordResetEmail(user, resetLink, PASSWORD_RESET_TTL_MINUTES).catch((err) => {
        console.error("[EMAIL] Password reset email failed:", err.message);
      });
    }
    res.json({ message: RESET_REQUESTED_MESSAGE });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Couldn't process the request. Please try again." });
  }
});

// POST /api/auth/reset-password/check  { token } → whether the link still works (and for whom)
router.post("/reset-password/check", resetPasswordLimiter, async (req, res) => {
  try {
    const user = await userForResetToken(req.body?.token);
    if (!user) return res.status(400).json({ error: RESET_LINK_INVALID });
    res.json({ valid: true, username: user.username, email: maskEmail(user.email) });
  } catch (err) {
    console.error("Reset check error:", err);
    res.status(500).json({ error: "Couldn't check the link. Please try again." });
  }
});

// POST /api/auth/reset-password  { token, password } → sets the password and signs the user in
router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    const user = await userForResetToken(token);
    if (!user) return res.status(400).json({ error: RESET_LINK_INVALID });
    if (!isValidPassword(password)) return res.status(400).json({ error: PASSWORD_RULE_MESSAGE });
    if (await user.comparePassword(password)) {
      return res.status(400).json({ error: "Choose a password you haven't used for this account" });
    }

    user.password = password;
    await user.save(); // hashes it and sets passwordChangedAt, which signs out every other session
    sendPasswordChangedEmail(user).catch((err) => console.error("[EMAIL] Password changed notice failed:", err.message));

    res.json({ message: "Your password has been changed.", token: signAuthToken(user._id), user: toPublicUser(user) });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Couldn't reset the password. Please try again." });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// PUT /api/auth/profile — update name, email, username, optional new password
router.put("/profile", authenticate, async (req, res) => {
  try {
    const { name, email, username, currentPassword, newPassword } = req.body;
    const update = { updatedAt: Date.now() };
    const errors = [];

    // --- name ---
    if (name !== undefined) {
      if (!isString(name) || !name.trim()) errors.push("Name cannot be empty");
      else if (name.trim().length > LIMITS.NAME) errors.push(`Name must be at most ${LIMITS.NAME} characters`);
      else update.name = name.trim();
    }

    // --- email ---
    if (email !== undefined) {
      const trimmed = isString(email) ? email.trim().toLowerCase() : null;
      if (trimmed === null) {
        errors.push("Invalid email address");
      } else if (trimmed) {
        if (!isValidEmail(trimmed)) {
          errors.push("Invalid email address");
        } else {
          const taken = await User.findOne({ email: trimmed, _id: { $ne: req.user._id } });
          if (taken) errors.push("Email is already in use by another account");
          else update.email = trimmed;
        }
      } else {
        update.email = "";
      }
    }

    // --- username ---
    if (username !== undefined) {
      const trimmed = isString(username) ? username.trim().toLowerCase() : "";
      if (!trimmed) errors.push("Username cannot be empty");
      else if (!USERNAME_REGEX.test(trimmed)) errors.push(USERNAME_RULE_MESSAGE);
      else if (trimmed !== req.user.username) {
        const taken = await User.findOne({ username: trimmed });
        if (taken) errors.push("Username is already taken");
        else update.username = trimmed;
      }
    }

    // `req.user` is loaded without the password hash, so re-load the full document for the checks below.
    const user = await User.findById(req.user._id);

    // --- password change ---
    const isChangingPassword = Boolean(newPassword);
    if (isChangingPassword) {
      if (!isString(currentPassword) || !currentPassword) {
        return res.status(400).json({ error: "Current password is required to set a new one" });
      }
      // [SECURITY FIX 2026-09-23] This compared against `req.user`, which is selected WITHOUT the
      // password hash, so the check could never succeed (password change was broken).
      const match = await user.comparePassword(currentPassword);
      if (!match) return res.status(400).json({ error: "Current password is incorrect" });
      if (!isValidPassword(newPassword)) errors.push(`New ${PASSWORD_RULE_MESSAGE.toLowerCase()}`);
      else update.password = newPassword;
    }

    if (errors.length) return res.status(400).json({ error: errors.join(". ") });

    Object.assign(user, update);
    await user.save(); // triggers password hash hook + sets passwordChangedAt

    const response = { user: toPublicUser(user) };
    // [SECURITY FIX 2026-09-23] Changing the password revokes old tokens (see middleware/auth.js),
    // so hand the current session a fresh one to keep the user logged in on this device.
    if (update.password) response.token = signAuthToken(user._id);

    res.json(response);
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;
