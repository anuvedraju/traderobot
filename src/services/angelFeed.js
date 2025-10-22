// src/services/angelFeed.js
const { WebSocketV2 } = require("smartapi-javascript");
const EventEmitter = require("events");

const feedEmitter = new EventEmitter();

let ws = null;
let isConnected = false;
let isFeedConnected = false;
let isSessionActive = false;
let reconnectTimer = null;
let listenersAttached = false;

async function initAngelFeed({ jwtToken, feedToken }) {
  const apiKey = process.env.ANGEL_ONE_API_KEY;
  const clientCode = process.env.ANGEL_ONE_USERNAME;

  if (!jwtToken || !feedToken)
    throw new Error("Missing jwtToken or feedToken for feed initialization");

  if (isConnected && ws) {
    console.log("⚙️ WebSocket already connected, skipping init.");
    return ws;
  }

  try {
    ws = new WebSocketV2({
      jwttoken: jwtToken,
      apikey: apiKey,
      clientcode: clientCode,
      feedtype: feedToken,
    });

    await ws.connect();
    isConnected = true;
    isFeedConnected = true;
    isSessionActive = true;

    console.log("📡 Angel One WebSocket connected ✅");
    emitFeedStatus();

    // Attach listeners safely
    attachWebSocketListeners(jwtToken, feedToken);

    return ws;
  } catch (err) {
    console.error("❌ Failed to connect Angel One feed:", err.message || err);
    isFeedConnected = false;
    emitFeedStatus();
    scheduleReconnect(jwtToken, feedToken);
  }
}

function attachWebSocketListeners(jwtToken, feedToken) {
  if (!ws || listenersAttached) return;
  if (typeof ws.on !== "function") {
    console.warn("⚠️ ws object does not support event listeners");
    return;
  }

  ws.on("tick", (data) => feedEmitter.emit("tick", data));

  ws.on("error", (err) => {
    console.error("❌ Feed error:", err.message || err);
    isFeedConnected = false;
    emitFeedStatus();
  });

  ws.on("close", () => {
    console.warn("🔌 Feed closed — retrying in 10s...");
    isConnected = false;
    isFeedConnected = false;
    emitFeedStatus();
    listenersAttached = false;
    scheduleReconnect(jwtToken, feedToken);
  });

  listenersAttached = true;
}

function scheduleReconnect(jwtToken, feedToken, delay = 10000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => reconnectFeed({ jwtToken, feedToken }), delay);
}

async function reconnectFeed({ jwtToken, feedToken }) {
  try {
    console.log("♻️ Reconnecting to Angel One feed...");
    await initAngelFeed({ jwtToken, feedToken });
  } catch (err) {
    console.error("❌ Reconnection failed:", err.message || err);
    scheduleReconnect(jwtToken, feedToken, 15000);
  }
}

function subscribeTokens(tokens, exchangeType = 2, mode = 1) {
  if (!ws || !isConnected)
    return console.warn("⚠️ WebSocket not ready yet. Cannot subscribe.");

  const subReq = {
    correlationID: `sub_${Date.now()}`,
    action: 1,
    mode,
    exchangeType,
    tokens: Array.isArray(tokens) ? tokens : [tokens],
  };

  try {
    ws.fetchData(subReq);
    console.log(`✅ Subscribed to ${subReq.tokens.join(", ")} [${exchangeType}]`);
  } catch (err) {
    console.error("⚠️ Subscription failed:", err.message || err);
  }
}

// unsubscribe also needed here

function emitFeedStatus() {
  const status = { isFeedConnected, isSessionActive };
  console.log("🚀 Emitting feedStatus:", status);
  feedEmitter.emit("feedStatus", status);
}

function getFeedStatus() {
  return { isFeedConnected, isSessionActive };
}

function setSessionStatus(status) {
  isSessionActive = Boolean(status);
  console.log(`🔐 Session active: ${isSessionActive}`);
  emitFeedStatus();
}

module.exports = {
  initAngelFeed,
  subscribeTokens,
  setSessionStatus,
  feedEmitter,
  getFeedStatus,
};