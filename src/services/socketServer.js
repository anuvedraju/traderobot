// src/services/socketServer.js
const { Server } = require("socket.io");
const {
  feedEmitter,
  getFeedStatus,
  subscribeTokens,
  unsubscribeTokens,
} = require("../services/angelFeed");

const { getTrades, updateTrade, tradeEmitter } = require("../data/trades");

/**
 * Initializes the Socket.IO server and manages client subscriptions, feed updates,
 * and real-time trade synchronization.
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
  });

  const activeSubscriptions = new Set();

  io.on("connection", (socket) => {
    console.log(
      `⚡ Client connected → ${socket.id} (${io.engine.clientsCount} total)`
    );

    // Send current feed/session status
    sendFeedStatus(socket);

    // ==============================
    // 🔔 SUBSCRIBE / UNSUBSCRIBE LOGIC
    // ==============================

    socket.on("subscribe", (token, exchange) => {
      if (!token) return;
      const tokenStr = token.toString().trim();

      socket.join(tokenStr);
      console.log(`📩 ${socket.id} subscribed → ${tokenStr}`);

      if (!activeSubscriptions.has(tokenStr)) {
        subscribeTokens(tokenStr, exchange);
        activeSubscriptions.add(tokenStr);
        console.log(`📡 Angel feed subscribed for ${tokenStr}`);
      }

      sendFeedStatus(socket);
    });

    socket.on("unsubscribe", (token, exchange) => {
      if (!token) return;
      const tokenStr = token.toString().trim();

      socket.leave(tokenStr);
      console.log(`📤 ${socket.id} unsubscribed → ${tokenStr}`);

      const clientsInRoom = io.sockets.adapter.rooms.get(tokenStr);
      const allTrades = getTrades();
      const isTradeExisting = allTrades.some(
        (t) => t.symboltoken?.toString() === tokenStr
      );

      if ((!clientsInRoom || clientsInRoom.size === 0) && !isTradeExisting) {
        unsubscribeTokens(tokenStr, exchange);
        activeSubscriptions.delete(tokenStr);
        console.log(`🛑 Angel feed unsubscribed for ${tokenStr}`);
      } else {
        console.log(
          isTradeExisting
            ? `⚠️ Skipping unsubscribe for ${tokenStr} — trade still exists.`
            : `⚠️ Skipping unsubscribe for ${tokenStr} — other clients still subscribed.`
        );
      }
    });

    // ==============================
    // ✏️ TRADE UPDATE HANDLER (from frontend)
    // ==============================
    socket.on("updateTrade", (data = {}) => {
      try {
        const { token, updates } = data;
        if (
          !token ||
          typeof updates !== "object" ||
          !Object.keys(updates).length
        )
          return console.warn("⚠️ Invalid updateTrade payload:", data);

        const tokenStr = token.toString().trim();
        console.log(
          `📝 Frontend requested trade update → ${tokenStr}`,
          updates
        );

        updateTrade(tokenStr, updates);

        // Emit updated trade to all clients watching this token
        io.to(tokenStr).emit("tradeUpdated", { token: tokenStr, updates });
      } catch (err) {
        console.error("❌ Failed to process trade update:", err.message);
      }
    });

    // ==============================
    // 🛰️ STATUS + CLEANUP
    // ==============================
    socket.on("getFeedStatus", () => sendFeedStatus(socket));

    socket.on("disconnect", (reason) => {
      console.log(`❌ Disconnected → ${socket.id} (${reason})`);

      // Cleanup unsubscribed rooms
      for (const tokenStr of activeSubscriptions) {
        const clientsInRoom = io.sockets.adapter.rooms.get(tokenStr);
        if (!clientsInRoom || clientsInRoom.size === 0) {
          unsubscribeTokens(tokenStr);
          activeSubscriptions.delete(tokenStr);
          console.log(`🧹 Auto-cleaned subscription → ${tokenStr}`);
        }
      }
    });

    socket.on("error", (err) => {
      console.error(`⚠️ Socket error (${socket.id}):`, err.message);
    });
  });

  // ==============================
  // 🌍 FEED → SOCKET EMITTERS
  // ==============================
  feedEmitter.on("tick", (tick) => {
    if (!tick?.symboltoken) return;
    io.to(tick.symboltoken.toString()).emit("tick", tick);
  });

  feedEmitter.on("orderUpdate", (order) => {
    if (!order) return;
    const sym = order.symboltoken?.toString() || order.tradingsymbol;
    if (sym) io.to(sym).emit("orderUpdate", order);
  });

  feedEmitter.on("feedStatus", (status) => {
    io.emit("feedStatus", status);
  });

  // ==============================
  // 💼 TRADE EMITTERS (backend updates)
  // ==============================
  const lastEmitted = new Map();

  tradeEmitter.on("tradeUpdated", (trade) => {
    if (!trade?.symboltoken) return;
    const tokenStr = trade.symboltoken.toString();

    const now = Date.now();
    const lastTime = lastEmitted.get(tokenStr) || 0;

    // Debounce frequent updates (like PnL)
    if (now - lastTime < 200) return;
    lastEmitted.set(tokenStr, now);

    io.to(tokenStr).emit("tradeUpdated", trade);
  });

  console.log("🔌 Socket.IO server ready and bound to feed/trade emitters ✅");
  return io;
}

// Helper to safely send feed status
function sendFeedStatus(socket) {
  try {
    socket.emit("feedStatus", getFeedStatus());
  } catch (err) {
    console.error("❌ sendFeedStatus error:", err.message);
  }
}

module.exports = { initSocketServer };
