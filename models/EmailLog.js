const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  type: { type: String, enum: ["activation", "payment", "other"], default: "other" },
  to: { type: String, required: true },
  subject: { type: String, required: true },
  status: { type: String, enum: ["sent", "failed"], default: "sent" },
  errorMessage: { type: String, default: "" },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
  sentAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EmailLog", emailLogSchema);
