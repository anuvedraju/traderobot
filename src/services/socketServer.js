// src/services/socketServer.js
const { Server } = require("socket.io");
const {
  feedEmitter,
  getFeedStatus,
  subscribeTokens,
  unsubscribeTokens,
} = require("../services/angelFeed");

const { getTrades, updateTrade, tradeEmitter } = require("../data/trades");
const { closeTrade } = require("../functions");

/**
 * Initializes the Socket.IO server and manages client subscriptions, feed updates,
 * and real-time trade synchronization.
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
  });

  const activeSubscriptions = new Map();

  const normalizeToken = (value) =>
    value
      ?.toString()
      .replace(/['"\s]+/g, "")
      .trim();

  const normalizeExchange = (exchange) =>
    exchange?.toString().trim().toUpperCase() || "NFO";

  const getTickToken = (tick = {}) =>
    normalizeToken(
      tick.symboltoken ||
        tick.token ||
        tick.Token ||
        tick.symbol ||
        tick.tradingsymbol
    );

  const shouldUnsubscribeToken = (tokenStr) => {
    const clientsInRoom = io.sockets.adapter.rooms.get(tokenStr);
    const isTradeExisting = getTrades().some(
      (t) => t.symboltoken?.toString() === tokenStr
    );

    return {
      shouldUnsubscribe: (!clientsInRoom || clientsInRoom.size === 0) && !isTradeExisting,
      isTradeExisting,
    };
  };

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
      const tokenStr = normalizeToken(token);
      if (!tokenStr) return;
      const exchangeName = normalizeExchange(exchange);

      socket.join(tokenStr);
      console.log(`📩 ${socket.id} subscribed → ${tokenStr} [${exchangeName}]`);

      const activeExchange = activeSubscriptions.get(tokenStr);
      if (!activeExchange || activeExchange !== exchangeName) {
        if (activeExchange) {
          unsubscribeTokens(tokenStr, activeExchange);
        }
        subscribeTokens(tokenStr, exchangeName);
        activeSubscriptions.set(tokenStr, exchangeName);
        console.log(`📡 Angel feed subscribed for ${tokenStr} [${exchangeName}]`);
      }

      sendFeedStatus(socket);
    });

    socket.on("unsubscribe", (token, exchange) => {
      if (!token) return;
      const tokenStr = normalizeToken(token);
      if (!tokenStr) return;
      const exchangeName = activeSubscriptions.get(tokenStr) || normalizeExchange(exchange);

      socket.leave(tokenStr);
      console.log(`📤 ${socket.id} unsubscribed → ${tokenStr} [${exchangeName}]`);

      const { shouldUnsubscribe, isTradeExisting } =
        shouldUnsubscribeToken(tokenStr);

      if (shouldUnsubscribe) {
        unsubscribeTokens(tokenStr, exchangeName);
        activeSubscriptions.delete(tokenStr);
        console.log(`🛑 Angel feed unsubscribed for ${tokenStr} [${exchangeName}]`);
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
    socket.on("updateTrade", async (data = {}) => {
      try {
        const { token, type } = data;
        if (!token || !type)
          return console.warn("⚠️ Invalid updateTrade payload:", data);
    
        const tokenStr = token.toString().trim();
        console.log(`📝 Frontend requested action → ${tokenStr}`, type);
    
        switch (type) {
          case "10":
            console.log("➡️ Setting stop-loss = 10");
            updateTrade(tokenStr, { stop_loss: 10 });
            break;
    
          case "450":
            console.log("➡️ Setting stop-loss = 450");
            updateTrade(tokenStr, { stop_loss: 450 });
            break;

          case "800":
            console.log("➡️ Setting stop-loss = 800");
            updateTrade(tokenStr, { stop_loss: 800 });
            break;

          case "50%":
            console.log("➡️ Setting target = 50");
            updateTrade(tokenStr, { target: 50 });
            break;

          case "70%":
            console.log("➡️ Setting target = 70");
            updateTrade(tokenStr, { target: 70 });
            break;
    
          case "M":  // Market close
            console.log("➡️ Closing trade at MARKET");
            await closeTrade(tokenStr);
            break;
    
          default:
            console.warn("⚠️ Unknown action type:", type);
            return;
        }
    
        // Emit updated trade to frontend
        io.to(tokenStr).emit("tradeUpdated", {
          token: tokenStr,
          type,
        });
    
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
      for (const [tokenStr, exchangeName] of [...activeSubscriptions.entries()]) {
        const { shouldUnsubscribe, isTradeExisting } =
          shouldUnsubscribeToken(tokenStr);

        if (shouldUnsubscribe) {
          unsubscribeTokens(tokenStr, exchangeName);
          activeSubscriptions.delete(tokenStr);
          console.log(`🧹 Auto-cleaned subscription → ${tokenStr} [${exchangeName}]`);
        } else if (isTradeExisting) {
          console.log(`⚠️ Keeping ${tokenStr} subscribed — trade still exists.`);
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
    const tokenStr = getTickToken(tick);
    if (!tokenStr) return;

    io.to(tokenStr).emit("tick", {
      ...tick,
      symboltoken: tokenStr,
      token: tokenStr,
    });
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

    io.emit("tradeUpdated", trade);
  });

  tradeEmitter.on("tradeDeleted", ({ symboltoken }) => {
    if (!symboltoken) return;
    io.emit("tradeDeleted", { symboltoken: symboltoken.toString() });
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
