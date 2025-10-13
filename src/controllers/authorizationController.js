import { SmartAPI } from "smartapi-javascript";
import totp from "totp-generator";
import dotenv from "dotenv";

dotenv.config();

let smartApiInstance = null;
let sessionData = null;

// 🔹 This version is for Express route (manual call)
export async function loginSmartAPI(req, res) {
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
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

// 🔹 This version is for auto-login (server startup)
export async function autoLogin() {
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

    // ✅ Await the getProfile() call
    const profile = await smartApi.getProfile()

    console.log("✅ Angel One login successful!");
    console.log("👤 Profile Data:", profile.data);

    return data;
  } catch (err) {
    console.error("❌ Angel One auto-login failed:", err.message || err);
  }
}

export function getSmartApi() {
  if (!smartApiInstance) throw new Error("Not logged in yet!");
  return smartApiInstance;
}