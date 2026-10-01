const mongoose = require("mongoose");

const pageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  pageId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
  },
  components: [
    {
      type: String,
    },
  ],
  // Search / social settings used by exported sites (validated in routes/pages.js).
  seo: {
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    favicon: { type: String, default: "" },
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
  order: {
    type: Number,
    default: 0,
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

module.exports = mongoose.model("Page", pageSchema);