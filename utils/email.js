const nodemailer = require("nodemailer");
const EmailLog = require("../models/EmailLog");
// [SECURITY FIX 2026-09-23] HTML injection in outgoing e-mail: user-controlled fields (display name,
// UPI transaction ID, etc.) were interpolated raw into the HTML, so anyone could set their name to
// `<a href="https://evil">Verify your account</a>` and have a phishing link delivered from the official
// ProSite account. The templates HTML-escape every dynamic value (see email-templates.js).
const { paymentReceiptEmail, trialActivationEmail } = require("./email-templates");

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

module.exports = { sendPaymentConfirmationEmail, sendActivationEmail };
