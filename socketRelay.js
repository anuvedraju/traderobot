// src/socketRelay.js
const { Server } = require("socket.io");
const SmartSocket = require("./modules/smartSocket");

function initSocketRelay(httpServer, creds) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  const smartFeed = new SmartSocket(creds);
  smartFeed.start();

  io.on("connection", (socket) => {
    console.log("📲 Frontend connected:", socket.id);

    socket.on("subscribe", (token) => smartFeed.subscribe(token));
    socket.on("unsubscribe", (token) => smartFeed.unsubscribe(token));

    socket.on("disconnect", () => {
      console.log("❎ Frontend disconnected:", socket.id);
    });
  });

  smartFeed.on("ltp", (tick) => {
    io.emit("ltp", tick);
  });

  smartFeed.on("order", (order) => {
    io.emit("order", order);
  });

  return io;
}

module.exports = initSocketRelay;