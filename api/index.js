const connectDB = require("../lib/db");
const app = require("../server");
const { seedDefaults } = require("../server");

let seeded = false;

module.exports = async (req, res) => {
  await connectDB();

  if (!seeded) {
    await seedDefaults();
    seeded = true;
  }

  return app(req, res);
};
