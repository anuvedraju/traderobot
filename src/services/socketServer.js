const { Server } = require("socket.io");
const { feedEmitter, getFeedStatus } = require("../services/angelFeed");

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    pingTimeout: 60000,
  });

  io.on("connection", (socket) => {
    console.log(`⚡ Client connected: ${socket.id}`);
    console.log("👥 Total clients:", io.engine.clientsCount);

    // ✅ Send initial feed/session status immediately
    const currentStatus = getFeedStatus();
    console.log("📡 Sending current feedStatus:", currentStatus);
    socket.emit("feedStatus", currentStatus);

    // ✅ Handle frontend subscriptions (optional for specific tokens)
    socket.on("subscribe", (token) => {
      socket.join(token);
      console.log(`📩 Client subscribed to ${token}`);

      // Re-send feed status on subscribe
      const status = getFeedStatus();
      socket.emit("feedStatus", status);
    });

    socket.on("disconnect", () => {
      console.log(`❌ Disconnected: ${socket.id}`);
      console.log("👥 Active clients:", io.engine.clientsCount);
    });
  });

  // =====================================
  // 🌍 Broadcast from Angel Feed → Clients
  // =====================================

  // 1️⃣ Live tick data (LTP updates)
  feedEmitter.on("tick", (tick) => {
    io.emit("tick", tick);
  });

  // 2️⃣ Order updates (execution/cancel/reject)
  feedEmitter.on("orderUpdate", (order) => {
    console.log(`📦 Broadcasting orderUpdate: ${order.tradingsymbol} → ${order.status}`);
    io.emit("orderUpdate", order);
  });

  // 3️⃣ Feed connection status
  feedEmitter.on("feedStatus", (status) => {
    console.log("📢 Broadcasting feedStatus update:", status);
    io.emit("feedStatus", status);
  });

  console.log("🔌 Socket.IO initialized and linked to feedEmitter ✅");
  return io;
}

module.exports = { initSocketServer };