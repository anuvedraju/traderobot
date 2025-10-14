const http = require("http");
const dotenv = require("dotenv");
const app = require("./src/app");
const { autoLogin } = require("./src/controllers/authorizationController");
const { startAngelFeed } = require("./src/services/angelFeed");
const { initSocketServer } = require("./src/services/socketServer");

dotenv.config();

const PORT = process.env.PORT || 5050;

// Create an HTTP server (Socket.io works with this, not directly with Express)
const server = http.createServer(app);

async function startServer() {
  try {
    // 1️⃣ Start the HTTP + Express server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    // 2️⃣ Initialize Socket.io
    const io = initSocketServer(server);
    console.log("⚡ Socket.io initialized");

    // 3️⃣ Login to Angel One SmartAPI
    const loginData = await autoLogin();
    const tokens = {
      jwtToken: loginData?.data?.jwtToken,
      feedToken: loginData?.data?.feedToken
    };

    // 4️⃣ Start WebSocket feed listener (for LTP + orders)
    await startAngelFeed(tokens);

    console.log("✅ Angel One WebSocket Feed listening...");

  } catch (err) {
    console.error("❌ Server initialization failed:", err.message);
  }
}

startServer();