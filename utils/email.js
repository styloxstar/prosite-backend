const nodemailer = require("nodemailer");
const EmailLog = require("../models/EmailLog");
// [SECURITY FIX 2026-09-23] HTML injection in outgoing e-mail: user-controlled fields (display name,
// UPI transaction ID, etc.) were interpolated raw into the HTML, so anyone could set their name to
// `<a href="https://evil">Verify your account</a>` and have a phishing link delivered from the official
// ProSite account. The templates HTML-escape every dynamic value (see email-templates.js).
const { paymentReceiptEmail, trialActivationEmail, passwordResetEmail, passwordChangedEmail } = require("./email-templates");
const { IS_PRODUCTION } = require("../lib/config");

async function saveEmailLog({ userId, type, to, subject, status, errorMessage, invoiceId }) {
  try {
    await EmailLog.create({ userId: userId || null, type, to, subject, status, errorMessage: errorMessage || "", invoiceId: invoiceId || null });
  } catch (e) {
    console.error("[EMAIL LOG] Failed to save email log:", e.message);
  }
}

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendPaymentConfirmationEmail(invoice, userEmail) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Email not configured (EMAIL_USER/EMAIL_PASS not set), skipping notification");
    return;
  }
  if (!userEmail) {
    console.warn("No user email provided, skipping notification");
    return;
  }
  const { subject, html, text } = paymentReceiptEmail(invoice);
  const transporter = createTransporter();
  try {
    await transporter.sendMail({ from: `"ProSite" <${process.env.EMAIL_USER}>`, to: userEmail, subject, html, text });
    console.log(`Payment confirmation email sent for ${invoice.invoiceNumber}`);
    await saveEmailLog({ userId: invoice.userId, type: "payment", to: userEmail, subject, status: "sent", invoiceId: invoice._id });
  } catch (err) {
    await saveEmailLog({ userId: invoice.userId, type: "payment", to: userEmail, subject, status: "failed", errorMessage: err.message, invoiceId: invoice._id });
    throw err;
  }
}

async function sendActivationEmail(user, activationLink, trialDays) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER / EMAIL_PASS not configured in .env");
  }
  const toEmail = (user.email || "").trim();
  // [SECURITY FIX 2026-09-23] Stopped logging recipient and sender addresses (PII in server logs).
  if (!toEmail) {
    throw new Error("User has no email address");
  }
  const { subject, html, text } = trialActivationEmail(user, activationLink, trialDays);
  const transporter = createTransporter();
  try {
    await transporter.sendMail({ from: `"ProSite" <${process.env.EMAIL_USER}>`, to: toEmail, subject, html, text });
    console.log(`[EMAIL] Activation email sent for user ${user._id}`);
    await saveEmailLog({ userId: user._id, type: "activation", to: toEmail, subject, status: "sent" });
  } catch (err) {
    await saveEmailLog({ userId: user._id, type: "activation", to: toEmail, subject, status: "failed", errorMessage: err.message });
    throw err;
  }
}

const isEmailConfigured = () => Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

/** Sends one account e-mail and records the outcome in EmailLog. */
async function sendAccountEmail(user, type, { subject, html, text }) {
  const toEmail = (user.email || "").trim();
  if (!toEmail) throw new Error("User has no email address");
  try {
    await createTransporter().sendMail({ from: `"ProSite" <${process.env.EMAIL_USER}>`, to: toEmail, subject, html, text });
    await saveEmailLog({ userId: user._id, type, to: toEmail, subject, status: "sent" });
  } catch (err) {
    await saveEmailLog({ userId: user._id, type, to: toEmail, subject, status: "failed", errorMessage: err.message });
    throw err;
  }
}

async function sendPasswordResetEmail(user, resetLink, minutes) {
  if (!isEmailConfigured()) {
    // Local development without SMTP: print the link so the flow can still be tried. Never in
    // production, where the link is as good as the password and must only reach the inbox.
    if (!IS_PRODUCTION) console.warn(`[DEV] Email not configured. Password reset link for ${user.username}: ${resetLink}`);
    else console.error("[EMAIL] Password reset requested but EMAIL_USER / EMAIL_PASS are not configured");
    return;
  }
  await sendAccountEmail(user, "password-reset", passwordResetEmail(user, resetLink, minutes));
  console.log(`[EMAIL] Password reset email sent for user ${user._id}`);
}

async function sendPasswordChangedEmail(user) {
  if (!isEmailConfigured() || !user.email) return;
  await sendAccountEmail(user, "security", passwordChangedEmail(user));
}

module.exports = { sendPaymentConfirmationEmail, sendActivationEmail, sendPasswordResetEmail, sendPasswordChangedEmail };
