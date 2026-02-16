const mongoose = require("mongoose");

const componentContentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  pageId: {
    type: String,
    required: true,
  },
  componentId: {
    type: String,
    required: true,
  },
  content: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

componentContentSchema.index(
  { userId: 1, pageId: 1, componentId: 1 },
  { unique: true }
);

module.exports = mongoose.model("ComponentContent", componentContentSchema);