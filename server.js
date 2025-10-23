// server.js
const http = require("http");
const dotenv = require("dotenv");

const app = require("./src/app");
const { initTradeManager } = require("./src/tradeManager");
const {
  initAngelFeed,
  subscribeTokens,
  feedEmitter,
} = require("./src/services/angelFeed");
const { initSocketServer } = require("./src/services/socketServer");
const { autoLogin } = require("./src/controllers/authorizationController");

dotenv.config();

const PORT = process.env.PORT || 5050;
const server = http.createServer(app);

async function startServer() {
  try {
    // Start HTTP + Socket.IO
    server.listen(PORT, () => console.log(`🚀 Traderobot running on port ${PORT}`));
    const io = initSocketServer(server);

    // Auto-login SmartAPI
    const loginData = await autoLogin();
    const { jwtToken, feedToken } = loginData?.data || {};
    if (!jwtToken || !feedToken)
      throw new Error("Missing SmartAPI tokens");

    console.log("✅ SmartAPI Login Successful");

    // Initialize feeds
    await initAngelFeed({ jwtToken, feedToken });
    console.log("✅ Angel One WebSockets Active");

    // Subscribe to test instrument
    subscribeTokens("116750", "NFO");

    // Initialize Trade Manager (auto logic)
    initTradeManager();

    // Forward all events to connected clients


    // 8️⃣ Listen for live ticks
    feedEmitter.on("tick", (tick) => {
      console.log("📈 Tick received:", tick);
      // Example: you can broadcast ticks to all socket
      io.emit("tick", tick);
    });

    // 9️⃣ Listen for feed connection changes
    feedEmitter.on("feedStatus", (status) => {
      io.emit("feedStatus", status);
    });


    feedEmitter.on("orderUpdate", (order) => {
      console.log("📡 Broadcasting Order Update:", order.tradingsymbol, order.status);
      io.emit("orderUpdate", order);
    });

    console.log("🧠 Traderobot backend fully initialized ✅");
  } catch (err) {
    console.error("❌ Server failed to start:", err.message || err);
    process.exit(1);
  }
}

startServer();