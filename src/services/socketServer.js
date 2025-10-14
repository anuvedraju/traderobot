const { Server } = require("socket.io");
const { feedEmitter } = require("../services/angelFeed");

function initSocketServer(httpServer) {
  const io = new Server(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log(`⚡ Frontend connected: ${socket.id}`);

    socket.on("subscribe", (token) => {
      socket.join(token);
    });

    socket.on("disconnect", () => console.log(`❌ Client disconnected: ${socket.id}`));
  });

  feedEmitter.on("tick", (tick) => io.emit("tick", tick));
  feedEmitter.on("order", (order) => io.emit("orderUpdate", order));

  return io;
}

module.exports = { initSocketServer };