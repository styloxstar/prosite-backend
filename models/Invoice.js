const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  orderId: {
    type: String,
    required: true,
  },
  planId: {
    type: String,
    required: true,
    enum: ["starter", "pro", "enterprise"],
  },
  planName: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: "INR",
  },
  paymentMethod: {
    type: String,
    default: "upi",
  },
  upiTransactionId: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["paid", "pending", "failed", "refunded"],
    default: "paid",
  },
  userEmail: {
    type: String,
    default: "",
  },
  userName: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Invoice", invoiceSchema);
