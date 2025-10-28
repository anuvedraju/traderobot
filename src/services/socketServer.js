// src/services/socketServer.js
const { Server } = require("socket.io");
const { feedEmitter, getFeedStatus } = require("../services/angelFeed");
const { subscribeTokens, unsubscribeTokens } = require("../services/angelFeed");
const { getActiveTrades } = require("../data/trades");

function initSocketServer(httpServer) {
  // Initialize Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
  });

  // Track which tokens are subscribed by at least one client
  const activeSubscriptions = new Set();

  // ========================
  // 🧠 Connection Management
  // ========================
  io.on("connection", (socket) => {
    console.log(`⚡ Client connected → ${socket.id} (${io.engine.clientsCount} total)`);

    // --- Emit current feed/session status immediately ---
    sendFeedStatus(socket);

    // --- Client subscribes to specific token ---
    socket.on("subscribe", (token,exchange) => {
      if (!token) return;
      const tokenStr = token.toString().trim();

      socket.join(tokenStr);
      console.log(`📩 ${socket.id} subscribed → ${tokenStr}`);

      // Subscribe to Angel One feed only if first user subscribes
      if (!activeSubscriptions.has(tokenStr)) {
        subscribeTokens(tokenStr,exchange);
        activeSubscriptions.add(tokenStr);
        console.log(`📡 Subscribed to Angel feed for token ${tokenStr}`);
      }

      sendFeedStatus(socket);
    });

// --- Client unsubscribes from a token ---
socket.on("unsubscribe", (token, exchange) => {
  if (!token) return;
  const tokenStr = token.toString().trim();

  socket.leave(tokenStr);
  console.log(`📤 ${socket.id} unsubscribed → ${tokenStr}`);

  // 1️⃣ Check if any clients still in the room
  const clientsInRoom = io.sockets.adapter.rooms.get(tokenStr);

  // 2️⃣ Check if trade for this token is still running
  const activeTrades = getActiveTrades();
  const isTradeRunning = activeTrades.some(
    (t) => t.symboltoken?.toString() === tokenStr && t.trade_status === "running"
  );

  // 3️⃣ Only unsubscribe from Angel feed if:
  //   - no clients left
  //   - AND no trade is running for that token
  if ((!clientsInRoom || clientsInRoom.size === 0) && !isTradeRunning) {
    unsubscribeTokens(tokenStr, exchange);
    activeSubscriptions.delete(tokenStr);
    console.log(`🛑 Unsubscribed from Angel feed for token ${tokenStr}`);
  } else {
    if (isTradeRunning) {
      console.log(
        `⚠️ Skipping unsubscribe for ${tokenStr} — trade is still running.`
      );
    } else {
      console.log(
        `⚠️ Not unsubscribing ${tokenStr} — other clients still subscribed.`
      );
    }
  }
});

    // --- Manual request for feed status ---
    socket.on("getFeedStatus", () => sendFeedStatus(socket));

    // --- Disconnect handler ---
    socket.on("disconnect", (reason) => {
      console.log(`❌ Client disconnected → ${socket.id} (${reason})`);

      // Optional: cleanup — remove tokens if no one left in the room
      for (const tokenStr of activeSubscriptions) {
        const clientsInRoom = io.sockets.adapter.rooms.get(tokenStr);
        if (!clientsInRoom || clientsInRoom.size === 0) {
          unsubscribeTokens(tokenStr);
          activeSubscriptions.delete(tokenStr);
          console.log(`🧹 Cleaned up empty subscription → ${tokenStr}`);
        }
      }
    });

    socket.on("error", (err) => {
      console.error(`⚠️ Socket error from ${socket.id}:`, err.message);
    });
  });

  // ===============================
  // 🌍 Broadcast feed updates → UI
  // ===============================

  // --- Live tick updates ---
  feedEmitter.on("tick", (tick) => {
    if (!tick?.symboltoken) return;
    const tokenStr = tick.symboltoken.toString();
    io.to(tokenStr).emit("tick", tick);
  });

  // --- Order updates ---
  feedEmitter.on("orderUpdate", (order) => {
    if (!order) return;
    const sym = order?.symboltoken || order?.tradingsymbol;
    if (sym) io.to(sym.toString()).emit("orderUpdate", order);
    io.emit("orderUpdateAll", order); // optional global broadcast
  });

  // --- Feed/Session connection status updates ---
  feedEmitter.on("feedStatus", (status) => {
    io.emit("feedStatus", status);
  });

  console.log("🔌 Socket.IO initialized and connected to feedEmitter ✅");
  return io;
}

// =======================
// 📡 Helper: emit status
// =======================
function sendFeedStatus(socket) {
  try {
    const status = getFeedStatus();
    socket.emit("feedStatus", status);
  } catch (err) {
    console.error("❌ Failed to send feed status:", err.message);
  }
}

module.exports = { initSocketServer };