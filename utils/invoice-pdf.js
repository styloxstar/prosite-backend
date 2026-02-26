const PDFDocument = require("pdfkit");

const CURRENCY_SYMBOLS = { INR: "\u20B9", USD: "$", EUR: "\u20AC", GBP: "\u00A3" };

async function generateInvoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const symbol = CURRENCY_SYMBOLS[invoice.currency] || "\u20B9";
    const date = new Date(invoice.createdAt).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // ─── Header ───
    doc.rect(0, 0, 595.28, 100).fill("#3B82F6");
    doc.fontSize(28).font("Helvetica-Bold").fillColor("#FFFFFF").text("ProSite", 50, 30);
    doc.fontSize(11).font("Helvetica").fillColor("rgba(255,255,255,0.85)").text("Website Builder Platform", 50, 62);

    // Invoice label on right
    doc.fontSize(22).font("Helvetica-Bold").fillColor("#FFFFFF").text("INVOICE", 400, 30, { align: "right", width: 145 });
    doc.fontSize(11).font("Helvetica").fillColor("rgba(255,255,255,0.85)").text(invoice.invoiceNumber, 400, 58, { align: "right", width: 145 });

    // ─── Invoice Meta ───
    const metaY = 130;
    doc.fillColor("#6B7280").fontSize(10).font("Helvetica");
    doc.text("Date", 50, metaY);
    doc.text("Invoice No.", 50, metaY + 20);
    doc.text("Status", 50, metaY + 40);

    doc.fillColor("#111827").font("Helvetica-Bold");
    doc.text(date, 140, metaY);
    doc.text(invoice.invoiceNumber, 140, metaY + 20);
    doc.text(invoice.status.toUpperCase(), 140, metaY + 40);

    // ─── Bill To ───
    doc.fillColor("#6B7280").fontSize(10).font("Helvetica");
    doc.text("Bill To", 350, metaY);
    doc.fillColor("#111827").font("Helvetica-Bold");
    doc.text(invoice.userName || "Customer", 350, metaY + 20);
    if (invoice.userEmail) {
      doc.font("Helvetica").fillColor("#6B7280").text(invoice.userEmail, 350, metaY + 36);
    }

    // ─── Divider ───
    doc.moveTo(50, 200).lineTo(545, 200).lineWidth(1).strokeColor("#E5E7EB").stroke();

    // ─── Table Header ───
    const tableTop = 220;
    doc.rect(50, tableTop, 495, 30).fill("#F3F4F6");
    doc.fillColor("#374151").fontSize(10).font("Helvetica-Bold");
    doc.text("Description", 60, tableTop + 9);
    doc.text("Qty", 340, tableTop + 9, { width: 50, align: "center" });
    doc.text("Amount", 430, tableTop + 9, { width: 105, align: "right" });

    // ─── Table Row ───
    const rowY = tableTop + 40;
    doc.fillColor("#111827").fontSize(10).font("Helvetica");
    doc.text(`${invoice.planName} Plan — Monthly Subscription`, 60, rowY);
    doc.text("1", 340, rowY, { width: 50, align: "center" });
    doc.font("Helvetica-Bold").text(`${symbol}${invoice.amount}`, 430, rowY, { width: 105, align: "right" });

    // ─── Divider ───
    doc.moveTo(50, rowY + 25).lineTo(545, rowY + 25).strokeColor("#E5E7EB").stroke();

    // ─── Total ───
    const totalY = rowY + 40;
    doc.fillColor("#6B7280").fontSize(10).font("Helvetica").text("Subtotal", 350, totalY);
    doc.fillColor("#111827").font("Helvetica").text(`${symbol}${invoice.amount}`, 430, totalY, { width: 105, align: "right" });

    doc.fillColor("#6B7280").text("Tax", 350, totalY + 20);
    doc.fillColor("#111827").text(`${symbol}0`, 430, totalY + 20, { width: 105, align: "right" });

    doc.moveTo(350, totalY + 42).lineTo(545, totalY + 42).strokeColor("#E5E7EB").stroke();

    doc.fillColor("#111827").fontSize(14).font("Helvetica-Bold").text("Total", 350, totalY + 52);
    doc.fillColor("#3B82F6").fontSize(14).font("Helvetica-Bold").text(`${symbol}${invoice.amount}`, 430, totalY + 52, { width: 105, align: "right" });

    // ─── Payment Info ───
    const payY = totalY + 100;
    doc.moveTo(50, payY - 15).lineTo(545, payY - 15).strokeColor("#E5E7EB").stroke();

    doc.fillColor("#374151").fontSize(11).font("Helvetica-Bold").text("Payment Information", 50, payY);
    doc.fillColor("#6B7280").fontSize(10).font("Helvetica");
    doc.text(`Payment Method: UPI`, 50, payY + 22);
    doc.text(`Transaction ID: ${invoice.upiTransactionId || "N/A"}`, 50, payY + 38);
    doc.text(`Order ID: ${invoice.orderId}`, 50, payY + 54);

    // ─── Footer ───
    const footY = 720;
    doc.moveTo(50, footY).lineTo(545, footY).strokeColor("#E5E7EB").stroke();
    doc.fillColor("#9CA3AF").fontSize(9).font("Helvetica");
    doc.text("Thank you for choosing ProSite!", 50, footY + 15, { align: "center", width: 495 });
    doc.text("This is a computer-generated invoice and does not require a signature.", 50, footY + 30, { align: "center", width: 495 });

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
