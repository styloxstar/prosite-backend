/**
 * CLI seeder: `npm run seed`.
 *
 * [SECURITY FIX 2026-09-23] This file duplicated the theme list and hard-coded an admin account
 * (`deepak` / `deepak@123`). It now reuses the single, environment-aware seeder in lib/seedDefaults.js,
 * which never creates hard-coded admin credentials in production.
 */
const mongoose = require("mongoose");
const config = require("./lib/config");
const { seedDefaults } = require("./lib/seedDefaults");

async function seed() {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log("Connected to MongoDB");
    await seedDefaults();
    console.log("\n🎉 Seed complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seed();
