const nodemailer = require("nodemailer");
const EmailLog = require("../models/EmailLog");

const CURRENCY_SYMBOLS = { INR: "\u20B9", USD: "$", EUR: "\u20AC", GBP: "\u00A3" };

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

function buildPaymentEmailHTML(invoice) {
  const symbol = CURRENCY_SYMBOLS[invoice.currency] || "\u20B9";
  const date = new Date(invoice.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Payment Receipt - ${invoice.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

      <!-- HEADER -->
      <tr><td style="background:linear-gradient(135deg,#3B82F6 0%,#8B5CF6 100%);border-radius:12px 12px 0 0;padding:36px 40px;text-align:center;">
        <div style="display:inline-block;width:42px;height:42px;background:rgba(255,255,255,0.2);border-radius:10px;line-height:42px;font-size:22px;font-weight:900;color:#fff;margin-bottom:10px;">P</div>
        <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px;">ProSite</div>
        <div style="color:rgba(255,255,255,0.75);font-size:13px;letter-spacing:1px;text-transform:uppercase;">Payment Receipt</div>
      </td></tr>

      <!-- BODY -->
      <tr><td style="background:#ffffff;padding:40px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

        <!-- Greeting -->
        <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">Payment Confirmed!</p>
        <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6;">
          Hi <strong style="color:#374151;">${invoice.userName}</strong>, your payment has been received and your ProSite plan is now active.
        </p>

        <!-- Invoice Meta -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding-bottom:4px;">Invoice Number</td>
            <td align="right" style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding-bottom:4px;">Date</td>
          </tr>
          <tr>
            <td style="font-size:15px;font-weight:800;color:#3B82F6;">${invoice.invoiceNumber}</td>
            <td align="right" style="font-size:14px;font-weight:600;color:#374151;">${date}</td>
          </tr>
        </table>

        <!-- Line Items -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px;">
          <tr style="background:#f9fafb;">
            <th align="left" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e5e7eb;">Description</th>
            <th align="right" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e5e7eb;">Amount</th>
          </tr>
          <tr>
            <td style="padding:16px;font-size:14px;color:#111827;font-weight:600;">${invoice.planName}
              <div style="font-size:12px;color:#6b7280;font-weight:400;margin-top:2px;">Subscription Plan</div>
            </td>
            <td align="right" style="padding:16px;font-size:14px;color:#111827;font-weight:600;">${symbol}${invoice.amount}</td>
          </tr>
          <tr style="background:#f9fafb;border-top:1px solid #e5e7eb;">
            <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#111827;">Total Paid</td>
            <td align="right" style="padding:14px 16px;font-size:18px;font-weight:800;color:#3B82F6;">${symbol}${invoice.amount}</td>
          </tr>
        </table>

        <!-- Payment Details -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:28px;">
          <tr><td colspan="2" style="padding:0 0 10px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Payment Details</td></tr>
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#6b7280;width:50%;">Method</td>
            <td style="padding:4px 0;font-size:13px;color:#374151;font-weight:600;">UPI</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#6b7280;">Transaction ID</td>
            <td style="padding:4px 0;font-size:13px;color:#374151;font-weight:600;">${invoice.upiTransactionId || "N/A"}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#6b7280;">Order ID</td>
            <td style="padding:4px 0;font-size:13px;color:#374151;font-weight:600;">${invoice.orderId}</td>
          </tr>
        </table>

        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.7;">
          A PDF copy of this invoice is available for download in your <strong style="color:#374151;">Billing</strong> section on the ProSite dashboard.
        </p>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#f9fafb;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">\u00A9 ${year} ProSite. All rights reserved.</p>
        <p style="margin:0;font-size:11px;color:#d1d5db;">This is an automated receipt. Please do not reply to this email.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function sendPaymentConfirmationEmail(invoice, userEmail) {
  const subject = `Payment Receipt - ${invoice.invoiceNumber} | ProSite`;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Email not configured (EMAIL_USER/EMAIL_PASS not set), skipping notification");
    return;
  }
  if (!userEmail) {
    console.warn("No user email provided, skipping notification");
    return;
  }
  const transporter = createTransporter();
  const html = buildPaymentEmailHTML(invoice);
  try {
    await transporter.sendMail({ from: `"ProSite" <${process.env.EMAIL_USER}>`, to: userEmail, subject, html });
    console.log(`Payment confirmation email sent to ${userEmail} for ${invoice.invoiceNumber}`);
    await saveEmailLog({ userId: invoice.userId, type: "payment", to: userEmail, subject, status: "sent", invoiceId: invoice._id });
  } catch (err) {
    await saveEmailLog({ userId: invoice.userId, type: "payment", to: userEmail, subject, status: "failed", errorMessage: err.message, invoiceId: invoice._id });
    throw err;
  }
}

function buildActivationEmailHTML(user, activationLink, trialDays) {
  const name = user.name || user.username || "there";
  const invoiceNum = "FREE-" + Date.now().toString().slice(-8);
  const date = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  const expiry = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Free Trial Order - ProSite</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

      <!-- HEADER -->
      <tr><td style="background:linear-gradient(135deg,#22C55E 0%,#16A34A 100%);border-radius:12px 12px 0 0;padding:36px 40px;text-align:center;">
        <div style="display:inline-block;width:42px;height:42px;background:rgba(255,255,255,0.2);border-radius:10px;line-height:42px;font-size:22px;font-weight:900;color:#fff;margin-bottom:10px;">P</div>
        <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px;">ProSite</div>
        <div style="color:rgba(255,255,255,0.75);font-size:13px;letter-spacing:1px;text-transform:uppercase;">Free Trial Order Confirmation</div>
      </td></tr>

      <!-- BODY -->
      <tr><td style="background:#ffffff;padding:40px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

        <!-- Greeting -->
        <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">Your free trial is ready!</p>
        <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6;">
          Hi <strong style="color:#374151;">${name}</strong>, click the button below to activate your <strong style="color:#16A34A;">${trialDays}-day free trial</strong> of ProSite Starter. No credit card required.
        </p>

        <!-- Order Meta -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding-bottom:4px;">Order Reference</td>
            <td align="right" style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding-bottom:4px;">Date</td>
          </tr>
          <tr>
            <td style="font-size:15px;font-weight:800;color:#22C55E;">${invoiceNum}</td>
            <td align="right" style="font-size:14px;font-weight:600;color:#374151;">${date}</td>
          </tr>
        </table>

        <!-- Line Items -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px;">
          <tr style="background:#f9fafb;">
            <th align="left" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e5e7eb;">Description</th>
            <th align="center" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e5e7eb;">Duration</th>
            <th align="right" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e5e7eb;">Amount</th>
          </tr>
          <tr>
            <td style="padding:16px;font-size:14px;color:#111827;font-weight:600;">ProSite Starter — Free Trial
              <div style="font-size:12px;color:#6b7280;font-weight:400;margin-top:2px;">3 pages · 6 themes · Basic components</div>
            </td>
            <td align="center" style="padding:16px;font-size:13px;color:#374151;">${trialDays} days<br><span style="font-size:11px;color:#9ca3af;">Until ${expiry}</span></td>
            <td align="right" style="padding:16px;font-size:14px;color:#16A34A;font-weight:700;">FREE</td>
          </tr>
          <tr style="background:#f9fafb;border-top:1px solid #e5e7eb;">
            <td colspan="2" style="padding:14px 16px;font-size:14px;font-weight:700;color:#111827;">Total Due Today</td>
            <td align="right" style="padding:14px 16px;font-size:18px;font-weight:800;color:#22C55E;">₹0.00</td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td align="center">
            <a href="${activationLink}"
              style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#22C55E,#16A34A);color:#ffffff;text-decoration:none;border-radius:10px;font-size:16px;font-weight:800;letter-spacing:0.3px;">
              Activate My Free Trial →
            </a>
            <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;">This link expires in 72 hours</p>
          </td></tr>
        </table>

        <!-- Features list -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:24px;">
          <tr><td style="padding:0 0 10px;font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.8px;">Included in your trial</td></tr>
          <tr><td>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:3px 16px 3px 0;font-size:13px;color:#374151;">✅ &nbsp;Up to 3 pages</td>
                <td style="padding:3px 16px 3px 0;font-size:13px;color:#374151;">✅ &nbsp;6 free themes</td>
              </tr>
              <tr>
                <td style="padding:3px 16px 3px 0;font-size:13px;color:#374151;">✅ &nbsp;Basic components</td>
                <td style="padding:3px 0;font-size:13px;color:#374151;">✅ &nbsp;No credit card needed</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.7;">
          If you did not request this trial, you can safely ignore this email — your account will not be charged.
        </p>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#f9fafb;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">© ${year} ProSite. All rights reserved.</p>
        <p style="margin:0;font-size:11px;color:#d1d5db;">This is an automated order confirmation. Please do not reply to this email.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function sendActivationEmail(user, activationLink, trialDays) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER / EMAIL_PASS not configured in .env");
  }
  const toEmail = (user.email || "").trim();
  console.log(`[EMAIL] sendActivationEmail → to="${toEmail}" from="${process.env.EMAIL_USER}"`);
  if (!toEmail) {
    throw new Error("User has no email address");
  }
  const subject = `Your Free Trial Order Confirmation - ProSite`;
  const transporter = createTransporter();
  const html = buildActivationEmailHTML(user, activationLink, trialDays);
  try {
    await transporter.sendMail({ from: `"ProSite" <${process.env.EMAIL_USER}>`, to: toEmail, subject, html });
    console.log(`[EMAIL] Activation email sent to ${toEmail}`);
    await saveEmailLog({ userId: user._id, type: "activation", to: toEmail, subject, status: "sent" });
  } catch (err) {
    await saveEmailLog({ userId: user._id, type: "activation", to: toEmail, subject, status: "failed", errorMessage: err.message });
    throw err;
  }
}

module.exports = { sendPaymentConfirmationEmail, sendActivationEmail };
