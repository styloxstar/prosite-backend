const mongoose = require("mongoose");
const { MONGO_URI } = require("./config");

// [SECURITY FIX 2026-09-23] Drop query-filter paths that aren't defined in the schema instead of
// sending them to MongoDB, so unexpected keys from user input can't change what a query matches.
mongoose.set("strictQuery", true);

// Reuse one connection across serverless invocations (Vercel keeps the module warm between requests).
let cached = global._mongooseCache;

if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI).then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Don't cache a failed connection forever — let the next request retry.
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

module.exports = connectDB;
