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

    // ✅ Emit the latest feed/session status right after connection
    const currentStatus = getFeedStatus();
    console.log("📡 Sending current feedStatus:", currentStatus);
    socket.emit("feedStatus", currentStatus);

    // Handle frontend subscription
    socket.on("subscribe", (token) => {
      socket.join(token);
      console.log(`📩 Client subscribed to ${token}`);

      // ✅ Also send feedStatus again on subscription
      const status = getFeedStatus();
      console.log("📡 Sending feedStatus on subscribe:", status);
      socket.emit("feedStatus", status);
    });

    socket.on("disconnect", () => {
      console.log(`❌ Disconnected: ${socket.id}`);
      console.log("👥 Active clients:", io.engine.clientsCount);
    });
  });

  // Broadcast updates to everyone
  feedEmitter.on("tick", (tick) => io.emit("tick", tick));
  feedEmitter.on("order", (order) => io.emit("orderUpdate", order));
  feedEmitter.on("feedStatus", (status) => {
    console.log("📢 Broadcasting feedStatus update:", status);
    io.emit("feedStatus", status);
  });

  return io;
}

module.exports = { initSocketServer };