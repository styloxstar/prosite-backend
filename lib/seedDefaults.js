/**
 * Seeds built-in themes and the initial accounts. Shared by server.js (on boot) and seed.js (CLI).
 *
 * [SECURITY FIX 2026-09-23] The server used to create `admin` / `admin` and `deepak` / `deepak@123`,
 * BOTH with the admin role, on every fresh database — including production — and those credentials
 * were published in the README, start.bat and on the login page. Anyone could log in as an admin.
 *
 * Now:
 *  - Production: an admin is created ONLY if SEED_ADMIN_USERNAME + SEED_ADMIN_PASSWORD are set
 *    (password must be at least 12 characters). Nothing is created otherwise.
 *  - Local development: the `deepak` demo workspace is still seeded for convenience, unless
 *    SEED_DEV_USER=false. It never runs in production.
 * Accounts that already exist are never modified.
 */
const Theme = require("../models/Theme");
const User = require("../models/User");
const Page = require("../models/Page");
const Settings = require("../models/Settings");
const DEFAULT_THEMES = require("./defaultThemes");
const { IS_PRODUCTION } = require("./config");

const MIN_SEED_ADMIN_PASSWORD_LENGTH = 12;
const ENTERPRISE_PLAN = { id: "enterprise", maxPages: 25, customThemes: true };

const DEV_USER = {
  username: "deepak",
  password: "deepak@123",
  name: "Deepak",
  email: "deepak@prosite.com",
};

const DEV_USER_PAGES = [
  { pageId: "home", name: "Home", slug: "home", components: ["navbar", "hero", "features", "stats", "testimonials", "footer"], order: 0 },
  { pageId: "about", name: "About", slug: "about", components: ["navbar", "gallery", "footer"], order: 1 },
  { pageId: "contact", name: "Contact", slug: "contact", components: ["navbar", "form", "footer"], order: 2 },
  { pageId: "admin", name: "Admin Panel", slug: "admin", components: ["sidebar", "dashboard", "table"], order: 3 },
  { pageId: "pricing-page", name: "Pricing", slug: "pricing", components: ["navbar", "pricing", "footer"], order: 4 },
];

async function seedThemes() {
  const themeCount = await Theme.countDocuments({ isCustom: false });
  if (themeCount > 0) return;
  await Theme.insertMany(DEFAULT_THEMES);
  console.log("  ✅ 24 default themes seeded (12 light + 12 dark)");
}

/** Creates a user with settings and pages, unless the username is already taken. */
async function createUserIfMissing({ username, password, name, email, role, plan, pages }) {
  if (await User.exists({ username })) return false;
  const user = await User.create({ username, password, name, email, role, plan });
  await Settings.create({ userId: user._id, activeTheme: "dark-midnight" });
  await Page.insertMany(pages.map((page) => ({ ...page, userId: user._id })));
  return true;
}

async function seedAdminFromEnv() {
  const username = (process.env.SEED_ADMIN_USERNAME || "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  if (!username || !password) return;

  if (password.length < MIN_SEED_ADMIN_PASSWORD_LENGTH) {
    console.warn(`  ⚠️  SEED_ADMIN_PASSWORD must be at least ${MIN_SEED_ADMIN_PASSWORD_LENGTH} characters — admin not seeded`);
    return;
  }

  const created = await createUserIfMissing({
    username,
    password,
    name: "Admin",
    email: (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase(),
    role: "admin",
    plan: ENTERPRISE_PLAN,
    pages: [{ pageId: "home", name: "Home", slug: "home", components: [], order: 0 }],
  });
  if (created) console.log(`  ✅ Admin user '${username}' seeded from environment`);
}

async function seedDevUser() {
  if (IS_PRODUCTION || process.env.SEED_DEV_USER === "false") return;

  const created = await createUserIfMissing({
    ...DEV_USER,
    role: "admin",
    plan: ENTERPRISE_PLAN,
    pages: DEV_USER_PAGES,
  });
  if (created) console.log(`  ✅ Dev user '${DEV_USER.username}' seeded (local development only)`);
}

async function seedDefaults() {
  try {
    await seedThemes();
    await seedAdminFromEnv();
    await seedDevUser();
  } catch (err) {
    console.error("  ❌ Seed error:", err.message);
  }
}

module.exports = { seedDefaults };
