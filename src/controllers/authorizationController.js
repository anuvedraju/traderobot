const { SmartAPI } = require("smartapi-javascript");
const totp = require("totp-generator");
const dotenv = require("dotenv");
const { setSessionStatus } = require("../services/angelFeed");

dotenv.config();

let smartApiInstance = null;
let sessionData = null;

function getFrontendAuthConfig(req, res) {
  res.json({
    success: true,
    authRequired: true,
    configured: Boolean(process.env.FRONTEND_API_AUTH_KEY),
    acceptedHeaders: ["x-api-key", "authorization"],
    authorizationFormat: "Bearer <FRONTEND_API_AUTH_KEY>",
  });
}

// 🔹 Express route: manual login
async function loginSmartAPI(req, res) {
  try {
    const code = totp(process.env.ANGEL_ONE_TOTP_SECRET);
    const smartApi = new SmartAPI({ api_key: process.env.ANGEL_ONE_API_KEY });

    const data = await smartApi.generateSession(
      process.env.ANGEL_ONE_USERNAME,
      process.env.ANGEL_ONE_PIN,
      code
    );

    smartApiInstance = smartApi;
    sessionData = data;

    res.json({ success: true, data });
  } catch (err) {
    console.error("Login error:", err.message || err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

// 🔹 Auto-login: runs at server startup
async function autoLogin() {
  try {
    const code = totp(process.env.ANGEL_ONE_TOTP_SECRET);
    console.log("🔢 Generated TOTP:", code);

    const smartApi = new SmartAPI({ api_key: process.env.ANGEL_ONE_API_KEY });

    const data = await smartApi.generateSession(
      process.env.ANGEL_ONE_USERNAME,
      process.env.ANGEL_ONE_PIN,
      code
    );

    smartApiInstance = smartApi;
    sessionData = data;


    // ✅ Fetch and print profile
    const profile = await smartApi.getProfile();
    console.log("✅ Angel One login successful!");
    console.log("👤 Profile Data:", profile.data);
    setSessionStatus(true);
    return data;
  } catch (err) {
    console.error("❌ Angel One auto-login failed:", err.message || err);
    setSessionStatus(false);
    throw err;
  }
}

// 🔹 Getter for SmartAPI instance
function getSmartApi() {
  if (!smartApiInstance) throw new Error("❌ SmartAPI not logged in yet!");
  return smartApiInstance;
}

module.exports = {
  getFrontendAuthConfig,
  loginSmartAPI,
  autoLogin,
  getSmartApi,
};
