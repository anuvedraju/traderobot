require("dotenv").config();
const totp = require("totp-generator");
const { SmartAPI } = require("smartapi-javascript");

let SmartWebSocket;
try {
  SmartWebSocket = require("smartapi-javascript").SmartWebSocket;
  if (!SmartWebSocket) {
    SmartWebSocket = require("smartapi-javascript/lib/smartapi-websocket");
  }
} catch (e) {
  SmartWebSocket = require("smartapi-javascript/lib/smartapi-websocket");
}

(async () => {
  const code = totp(process.env.ANGEL_ONE_TOTP_SECRET);
  const smartApi = new SmartAPI({ api_key: process.env.ANGEL_ONE_API_KEY });
  const session = await smartApi.generateSession(
    process.env.ANGEL_ONE_USERNAME,
    process.env.ANGEL_ONE_PIN,
    code
  );

  console.log("✅ Login success, tokens:", session.data.jwtToken.slice(0, 10));

  const ws = new SmartWebSocket(
    session.data.jwtToken,
    process.env.ANGEL_ONE_API_KEY,
    process.env.ANGEL_ONE_USERNAME,
    session.data.feedToken
  );

  ws.on("open", () => {
    console.log("📡 Connected to Angel Feed");
    ws.subscribe("nfo|116750");
  });

  ws.on("tick", (msg) => console.log("💹 Tick:", msg));
  ws.on("error", (e) => console.error("❌ Error:", e));
  ws.connect();
})();