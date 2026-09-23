/**
 * Small, dependency-free input validation helpers shared by all routes.
 *
 * [SECURITY FIX 2026-09-23] Request bodies/query strings were used without type checks. Express'
 * query parser turns `?search[$ne]=x` into an object, and JSON bodies can contain objects/arrays
 * where strings are expected — enabling NoSQL operator injection, crashes (500s) on `.trim()` of a
 * non-string, and unbounded payloads. These helpers make "is this really a short string?" explicit.
 */
const mongoose = require("mongoose");

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LIMITS = Object.freeze({
  NAME: 100,
  EMAIL: 254, // RFC 5321 maximum
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128, // bcrypt only uses the first 72 bytes; also stops huge-input hashing DoS
  SEARCH: 100,
  PAGE_NAME: 100,
  COMPONENT_ID: 64,
  COMPONENTS_PER_PAGE: 100,
  THEME_NAME: 60,
  CSS_VALUE: 200,
});

function isString(value) {
  return typeof value === "string";
}

/** True for a string whose trimmed length is between min and max (inclusive). */
function isStringOfLength(value, min, max) {
  return isString(value) && value.trim().length >= min && value.trim().length <= max;
}

function isValidEmail(value) {
  return isString(value) && value.length <= LIMITS.EMAIL && EMAIL_REGEX.test(value);
}

function isValidObjectId(value) {
  return isString(value) && mongoose.Types.ObjectId.isValid(value);
}

/** Escapes user text so it can be embedded in a RegExp as a literal (prevents ReDoS / regex injection). */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parses an integer query param and clamps it into [min, max]; falls back to `fallback` if invalid. */
function clampInt(value, { min, max, fallback }) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** Escapes text for safe interpolation into HTML (e-mail templates). */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Allows the characters used by colours, gradients and shadows (`#fff`, `rgba(0,0,0,.1)`,
 * `linear-gradient(135deg, #a, #b)`) and rejects anything that could break out of a CSS/HTML
 * context (`;`, `"`, `<`, `{`, `}` ...).
 */
const SAFE_CSS_VALUE_REGEX = /^[#a-zA-Z0-9\s(),.%-]*$/;

function isSafeCssValue(value) {
  return isString(value) && value.length <= LIMITS.CSS_VALUE && SAFE_CSS_VALUE_REGEX.test(value);
}

module.exports = {
  USERNAME_REGEX,
  EMAIL_REGEX,
  LIMITS,
  isString,
  isStringOfLength,
  isValidEmail,
  isValidObjectId,
  escapeRegex,
  clampInt,
  escapeHtml,
  isSafeCssValue,
};
