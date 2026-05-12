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
    // 1️⃣ Start HTTP + Socket.IO
    server.listen(PORT, () =>
      console.log(`🚀 Traderobot running on port ${PORT}`)
    );
    
    const io = initSocketServer(server);

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`⚠️ Port ${PORT} is already in use.`);
        process.exit(1);
      } else {
        console.error("❌ Server error:", err);
        process.exit(1);
      }
    });

    // 2️⃣ Auto-login SmartAPI
    const loginData = await autoLogin();
    const { jwtToken, feedToken } = loginData?.data || {};
    if (!jwtToken || !feedToken) throw new Error("Missing SmartAPI tokens");

    console.log("✅ SmartAPI Login Successful");

    // 3️⃣ Initialize WebSockets (Tick + Order Feed)
    await initAngelFeed({ jwtToken, feedToken });
    console.log("✅ Angel One Feeds Active");

    // 4️⃣ Initialize Trade Manager (strategy brain)
    initTradeManager();

    // 5️⃣ Subscribe to feed events
    feedEmitter.on("tick", (tick) => {
      // console.log("📈 Tick received:", tick);
      // Example: you can broadcast ticks to all sockets
      io.emit("tick", tick);
    });

    feedEmitter.on("feedStatus", (status) => {
      io.emit("feedStatus", status);
    });

    feedEmitter.on("orderUpdate", (order) => {
      console.log(`📦 Order Update: ${order.tradingsymbol} → ${order.status}`);
      io.emit("orderUpdate", order);
    });

    console.log("🧠 Traderobot backend fully initialized ✅");
  } catch (err) {
    console.error("❌ Server failed to start:", err.message || err);
    process.exit(1);
  }
}

startServer();
