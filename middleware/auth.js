const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "prosite_secret";

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const requirePlan = (...allowedPlans) => {
  return (req, res, next) => {
    if (!allowedPlans.includes(req.user.plan.id) && req.user.role !== "admin") {
      return res.status(403).json({ error: "Upgrade your plan to access this feature" });
    }
    next();
  };
};

module.exports = { authenticate, requirePlan };