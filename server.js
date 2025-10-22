const http = require("http");
const dotenv = require("dotenv");

const app = require("./src/app");
const { initTradeManager } = require("./src/tradeManager");
const {
  initAngelFeed,
  subscribeTokens,
  feedEmitter,
  setSessionStatus,
} = require("./src/services/angelFeed");
const { initSocketServer } = require("./src/services/socketServer");
const { autoLogin } = require("./src/controllers/authorizationController");


dotenv.config();

const PORT = process.env.PORT || 5050;
const server = http.createServer(app);

// async function startServer() {
//   try {
//     // 1️⃣ Start Express
//     server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

//     // 2️⃣ Initialize Socket.IO *before* login/feed
//     const io = initSocketServer(server);
//     console.log("⚡ Socket.IO initialized");

//     // Log feed emitter activity to confirm linkage
//     feedEmitter.on("feedStatus", (status) => {
//       console.log("🛰️ feedEmitter triggered in server.js:", status);
//     });

//     // 3️⃣ Login to Angel One (auto)
//     const loginData = await autoLogin();
//     const { jwtToken, feedToken } = loginData?.data || {};
//     if (!jwtToken || !feedToken)
//       throw new Error("Missing SmartAPI tokens");

//     // 4️⃣ Initialize Angel One WebSocket feed
//     await initAngelFeed({ jwtToken, feedToken });
//     console.log("✅ Angel One WebSocket feed active");

//     // 5️⃣ Subscribe to a test symbol
//     subscribeTokens("116750", 2);

//     // 6️⃣ Listen to feed ticks
//     feedEmitter.on("tick", (tick) => {
//       console.log("📈 Tick received:", tick);
//     });
//   } catch (err) {
//     console.error("❌ Server failed to start:", err.message || err);
//   }
// }


async function startServer() {
  try {
    // 1️⃣ Start Express
    server.listen(PORT, () =>
      console.log(`🚀 Traderobot Server running on port ${PORT}`)
    );

    // 2️⃣ Initialize Socket.IO *before* login/feed
    const io = initSocketServer(server);
    console.log("⚡ Socket.IO initialized");

    // 3️⃣ Log feed emitter activity (for debugging connectivity)
    feedEmitter.on("feedStatus", (status) => {
      console.log("🛰️ feedEmitter triggered:", status);
    });

    // 4️⃣ Auto-login SmartAPI (Angel One)
    const loginData = await autoLogin();
    const { jwtToken, feedToken } = loginData?.data || {};
    if (!jwtToken || !feedToken)
      throw new Error("❌ Missing SmartAPI tokens from autoLogin()");

    console.log("✅ SmartAPI login successful");

    // 5️⃣ Initialize Angel Feed WebSocket
    await initAngelFeed({ jwtToken, feedToken });
    console.log("✅ Angel One WebSocket feed active");

    // 6️⃣ Subscribe to test symbol(s)
    subscribeTokens("116750", 2); // e.g. BANKNIFTY index token

    // 7️⃣ Initialize Trade Manager (strategy brain)
    initTradeManager();

    // 8️⃣ Listen for live ticks
    feedEmitter.on("tick", (tick) => {
      console.log("📈 Tick received:", tick);
      // Example: you can broadcast ticks to all sockets
      io.emit("tick", tick);
    });

    // 9️⃣ Listen for feed connection changes
    feedEmitter.on("feedStatus", (status) => {
      io.emit("feedStatus", status);
    });

    console.log("🧠 Traderobot backend fully initialized ✅");
  } catch (err) {
    console.error("❌ Server failed to start:", err.message || err);
    process.exit(1);
  }
}

startServer();