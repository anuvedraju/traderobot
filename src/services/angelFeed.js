// src/services/angelFeed.js
const { WebSocketV2 } = require("smartapi-javascript");
const WebSocket = require("ws");
const EventEmitter = require("events");
const dotenv = require("dotenv");
const feedEmitter = new EventEmitter();
dotenv.config();

let marketWS = null;
let orderWS = null;
let isConnected = false;
let isFeedConnected = false;
let isSessionActive = false;
let reconnectTimer = null;
let listenersAttached = false;
let heartbeatTimer = null;
let orderReconnectTimer = null;
const pendingMarketSubscriptions = new Map();

const exchangeMap = {
  NSE: 1,
  NFO: 2,
  BSE: 3,
  BFO: 4,
  MCX: 5,
  NCO: 7,
  NCX: 7,
  CDS: 13,
  CDE: 13,
};
const orderStatusMap = {
  AB01: "open",
  AB02: "cancelled",
  AB03: "rejected",
  AB04: "modified",
  AB05: "complete",
  AB09: "pending",
  AB10: "trigger pending",
};

function normalizeExchangeType(exchangeType = "NFO") {
  if (typeof exchangeType === "number") return exchangeType;
  if (typeof exchangeType !== "string") return exchangeMap.NFO;
  return exchangeMap[exchangeType.toUpperCase()] || exchangeMap.NFO;
}

function normalizeTokens(tokens) {
  return (Array.isArray(tokens) ? tokens : [tokens])
    .map((token) => token?.toString().trim())
    .filter(Boolean);
}

function getSubscriptionKey(exchangeType, mode) {
  return `${normalizeExchangeType(exchangeType)}:${mode}`;
}

function queuePendingSubscription(tokens, exchangeType, mode) {
  const normalizedTokens = normalizeTokens(tokens);
  if (!normalizedTokens.length) return;

  const key = getSubscriptionKey(exchangeType, mode);
  if (!pendingMarketSubscriptions.has(key)) {
    pendingMarketSubscriptions.set(key, {
      exchangeType,
      mode,
      tokens: new Set(),
    });
  }

  const pending = pendingMarketSubscriptions.get(key);
  normalizedTokens.forEach((token) => pending.tokens.add(token));
}

function flushPendingSubscriptions() {
  if (!marketWS || !isConnected || !pendingMarketSubscriptions.size) return;

  const pending = [...pendingMarketSubscriptions.values()];
  pendingMarketSubscriptions.clear();

  pending.forEach(({ exchangeType, mode, tokens }) => {
    subscribeTokens([...tokens], exchangeType, mode);
  });
}

/**
 * Initialize both Market Feed and Order Status Feed
 */
async function initAngelFeed({ jwtToken, feedToken }) {
  const apiKey = process.env.ANGEL_ONE_API_KEY;
  const clientCode = process.env.ANGEL_ONE_USERNAME;

  if (!jwtToken || !feedToken)
    throw new Error("Missing jwtToken or feedToken for feed initialization");

  if (isConnected && marketWS) {
    console.log("⚙️ Market feed already connected.");
    return;
  }

  try {
    // --- Market Feed (LTP / Tick) ---
    marketWS = new WebSocketV2({
      jwttoken: jwtToken,
      apikey: apiKey,
      clientcode: clientCode,
      feedtype: feedToken,
    });

    await marketWS.connect();
    isConnected = isFeedConnected = isSessionActive = true;

    console.log("📡 Market WebSocket connected ✅");
    emitFeedStatus();
    attachMarketListeners(jwtToken, feedToken);
    flushPendingSubscriptions();

    // --- Order Feed (Status Updates) ---
    initOrderStatusFeed(jwtToken);

  } catch (err) {
    console.error("❌ Failed to connect Angel Feed:", err.message);
    isFeedConnected = false;
    emitFeedStatus();
    scheduleReconnect(jwtToken, feedToken);
  }
}

/**
 * Market feed listeners
 */
function attachMarketListeners(jwtToken, feedToken) {
  if (!marketWS || listenersAttached) return;

  marketWS.on("tick", (data) => feedEmitter.emit("tick", data));

  marketWS.on("error", (err) => {
    console.error("❌ Market feed error:", err.message);
    isFeedConnected = false;
    emitFeedStatus();
  });

  marketWS.on("close", () => {
    console.warn("🔌 Market feed closed — reconnecting...");
    isConnected = isFeedConnected = false;
    emitFeedStatus();
    listenersAttached = false;
    scheduleReconnect(jwtToken, feedToken);
  });

  listenersAttached = true;
  console.log("🎧 Market WebSocket listeners attached (tick)");
}

/**
 * Angel One Order Status WebSocket
 * wss://tns.angelone.in/smart-order-update
 */
function initOrderStatusFeed(jwtToken) {
  if (!process.env.ORDER_FEED_URL) {
    console.warn("⚠️ ORDER_FEED_URL missing, skipping order status feed.");
    return;
  }

  if (orderReconnectTimer) {
    clearTimeout(orderReconnectTimer);
    orderReconnectTimer = null;
  }

  if (orderWS) {
    try {
      orderWS.removeAllListeners();
      orderWS.terminate();
    } catch (err) {
      console.warn("⚠️ Failed to reset previous order feed socket:", err.message);
    }
    orderWS = null;
  }

  console.log("📦 Connecting to Order Status Feed...");
  orderWS = new WebSocket(process.env.ORDER_FEED_URL, {
    headers: { Authorization: `Bearer ${jwtToken}` },
  });

  orderWS.on("open", () => {
    console.log("📦 Order Feed connected ✅");
    startHeartbeat();
  });

  orderWS.on("message", (msg) => {
    try {
      const rawMessage = msg.toString().trim();
      if (rawMessage === "pong") return;

      const data = JSON.parse(rawMessage);
      if (data["status-code"] !== "200" || !data.orderData) return;

      const order = data.orderData;
      const code = data["order-status"];
      order.status = orderStatusMap[code] || "unknown";
      feedEmitter.emit("orderUpdate", order);
    } catch (err) {
      console.error("⚠️ Error parsing order message:", err.message);
    }
  });

  orderWS.on("close", () => {
    console.warn("🧱 Order feed closed — reconnecting in 10s...");
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    orderReconnectTimer = setTimeout(() => initOrderStatusFeed(jwtToken), 10000);
  });

  orderWS.on("error", (err) => {
    console.error("❌ Order feed error:", err.message);
  });
}

/**
 * Send periodic ping to keep WS alive
 */
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (orderWS?.readyState === WebSocket.OPEN) {
      orderWS.send("ping");
    }
  }, 10000);
}

/**
 * Reconnect Market Feed
 */
function scheduleReconnect(jwtToken, feedToken, delay = 10000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => reconnectFeed({ jwtToken, feedToken }), delay);
}

async function reconnectFeed({ jwtToken, feedToken }) {
  console.log("♻️ Reconnecting to Market Feed...");
  await initAngelFeed({ jwtToken, feedToken });
}

/**
 * Subscribe dynamically to instruments
 */
function subscribeTokens(tokens, exchangeType = "NFO", mode = 1) {
  const normalizedTokens = normalizeTokens(tokens);
  if (!normalizedTokens.length) return false;

  if (!marketWS || !isConnected) {
    queuePendingSubscription(normalizedTokens, exchangeType, mode);
    console.warn(
      `⚠️ Market feed not ready yet. Queued subscription for ${normalizedTokens.join(", ")} [${exchangeType || "NFO"}]`
    );
    return false;
  }

  const subReq = {
    correlationID: `sub_${Date.now()}`,
    action: 1,
    mode,
    exchangeType: normalizeExchangeType(exchangeType),
    tokens: normalizedTokens,
  };

  try {
    marketWS.fetchData(subReq);
    console.log(`✅ Subscribed to ${subReq.tokens.join(", ")} [${exchangeType}]`);
    return true;
  } catch (err) {
    console.error("⚠️ Subscription failed:", err.message);
    queuePendingSubscription(normalizedTokens, exchangeType, mode);
    return false;
  }
}

function unsubscribeTokens(tokens, exchangeType = "NFO", mode = 1) {
  if (!marketWS || !isConnected)
    return console.warn("⚠️ Market feed not ready yet.");

  const normalizedTokens = normalizeTokens(tokens);
  if (!normalizedTokens.length) return;

  const unsubReq = {
    correlationID: `unsub_${Date.now()}`,
    action: 0, // 0 = Unsubscribe
    mode,
    exchangeType: normalizeExchangeType(exchangeType),
    tokens: normalizedTokens,
  };

  try {
    marketWS.fetchData(unsubReq);
    console.log(`🛑 Unsubscribed from ${unsubReq.tokens.join(", ")} [${exchangeType}]`);
  } catch (err) {
    console.error("⚠️ Unsubscription failed:", err.message || err);
  }
}

/**
 * Feed status emitters
 */
function emitFeedStatus() {
  feedEmitter.emit("feedStatus", { isFeedConnected, isSessionActive });
}
function getFeedStatus() {
  return { isFeedConnected, isSessionActive };
}
function setSessionStatus(status) {
  isSessionActive = Boolean(status);
  emitFeedStatus();
}

module.exports = {
  initAngelFeed,
  subscribeTokens,
  unsubscribeTokens,
  setSessionStatus,
  feedEmitter,
  getFeedStatus,
};
