const connectDB = require("../lib/db");
const app = require("../server");

module.exports = async (req, res) => {
  await connectDB();
  return app(req, res);
};
