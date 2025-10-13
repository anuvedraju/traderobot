// test-search.js
import axios from "axios";
import { SmartAPI } from "smartapi-javascript";
import totp from "totp-generator";
import dotenv from "dotenv";
dotenv.config();

(async () => {
  try {
    const code = totp(process.env.ANGEL_ONE_TOTP_SECRET);
    const smartApi = new SmartAPI({ api_key: process.env.ANGEL_ONE_API_KEY });
    const session = await smartApi.generateSession(
      process.env.ANGEL_ONE_USERNAME,
      process.env.ANGEL_ONE_PIN,
      code
    );

    const jwt = session.data.jwtToken;
    console.log("✅ Logged in, token starts with:", jwt.slice(0, 20));

    const query = "PFC 390 CE";
    const url = `https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/search/${encodeURIComponent(
      query
    )}`;

    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-PrivateKey": process.env.ANGEL_ONE_API_KEY,
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "fe80::a00:27ff:fe4e:66a1",
        "X-UserAgent": "Mozilla/5.0",
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Search OK:", res.data);
  } catch (err) {
    console.error("❌ Search failed:", err.response?.data || err.message);
  }
})();