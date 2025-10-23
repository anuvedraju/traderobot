// src/services/angelFeed.js
const { WebSocketV2 } = require("smartapi-javascript");
const WebSocket = require("ws");
const EventEmitter = require("events");

const feedEmitter = new EventEmitter();

// Global state
let marketWS = null;
let orderWS = null;
let isConnected = false;
let isFeedConnected = false;
let isSessionActive = false;
let reconnectTimer = null;
let listenersAttached = false;

// 🔹 Exchange Mapping
const exchangeMap = { NSE: 1, NFO: 2, BSE: 3, BFO: 4, MCX: 5 };

/**
 * Initialize Market Feed WebSocket
 */
async function initAngelFeed({ jwtToken, feedToken }) {
  const apiKey = process.env.ANGEL_ONE_API_KEY;
  const clientCode = process.env.ANGEL_ONE_USERNAME;

  if (!jwtToken || !feedToken)
    throw new Error("Missing jwtToken or feedToken for feed initialization");

  if (isConnected && marketWS) {
    console.log("⚙️ Market feed already connected, skipping init.");
    return marketWS;
  }

  try {
    marketWS = new WebSocketV2({
      jwttoken: jwtToken,
      apikey: apiKey,
      clientcode: clientCode,
      feedtype: feedToken,
    });

    await marketWS.connect();
    isConnected = true;
    isFeedConnected = true;
    isSessionActive = true;

    console.log("📡 Market WebSocket connected ✅");
    emitFeedStatus();

    attachMarketListeners(jwtToken, feedToken);

    // ✅ Initialize Order Status WebSocket
    initOrderStatusFeed(jwtToken, clientCode);

    return marketWS;
  } catch (err) {
    console.error("❌ Failed to connect Angel One Market Feed:", err.message || err);
    isFeedConnected = false;
    emitFeedStatus();
    scheduleReconnect(jwtToken, feedToken);
  }
}

/**
 * Attach listeners for Market Feed
 */
function attachMarketListeners(jwtToken, feedToken) {
  if (!marketWS || listenersAttached) return;

  marketWS.on("tick", (data) => feedEmitter.emit("tick", data));

  marketWS.on("error", (err) => {
    console.error("❌ Market feed error:", err.message || err);
    isFeedConnected = false;
    emitFeedStatus();
  });

  marketWS.on("close", () => {
    console.warn("🔌 Market feed closed — retrying in 10s...");
    isConnected = false;
    isFeedConnected = false;
    emitFeedStatus();
    listenersAttached = false;
    scheduleReconnect(jwtToken, feedToken);
  });

  listenersAttached = true;
  console.log("🎧 Market WebSocket listeners attached (tick)");
}

/**
 * ✅ Initialize the official Angel One Order Status WebSocket
 * Endpoint: wss://tns.angelone.in/smart-order-update
 */
function initOrderStatusFeed(jwtToken, clientCode) {
  const ORDER_FEED_URL = "wss://tns.angelone.in/smart-order-update";

  try {
    console.log("📦 Connecting to Angel One Order Status WebSocket...");

    orderWS = new WebSocket(ORDER_FEED_URL, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });

    orderWS.on("open", () => {
      console.log("📦 Order Status WebSocket connected ✅");
      // Send initial ping every 10s to keep the connection alive
      setInterval(() => {
        if (orderWS.readyState === WebSocket.OPEN) {
          orderWS.send(JSON.stringify({ ping: "ping" }));
        }
      }, 10000);
    });

    orderWS.on("message", (msg) => {
      try {
        // 🧩 1️⃣ Handle plain "pong" text from server
        if (msg === "pong" || msg.toString().trim() === "pong") {
          // Optional: console.log("🔁 Pong received (connection alive)");
          return;
        }
    
        // 🧩 2️⃣ Parse JSON messages only
        const data = JSON.parse(msg);
    
        // 🧩 3️⃣ Handle valid order update messages
        if (data["status-code"] === "200" && data.orderData) {
          const order = data.orderData;
          const statusCode = data["order-status"];
    
          const statusMap = {
            AB01: "open",
            AB02: "cancelled",
            AB03: "rejected",
            AB04: "modified",
            AB05: "complete",
            AB09: "pending",
            AB10: "trigger pending",
          };
    
          order.status = statusMap[statusCode] || order.status || "unknown";
    
          console.log(
            `📬 Order Update: ${order.tradingsymbol} (${order.orderid}) → ${order.status}`
          );
    
          feedEmitter.emit("orderUpdate", order);
        }
      } catch (err) {
        console.error("⚠️ Error parsing order message:", err.message);
      }
    });

    orderWS.on("close", () => {
      console.warn("🧱 Order Status WebSocket closed — reconnecting in 10s...");
      setTimeout(() => initOrderStatusFeed(jwtToken, clientCode), 10000);
    });

    orderWS.on("error", (err) => {
      console.error("❌ Order Status WebSocket error:", err.message);
    });
  } catch (err) {
    console.error("❌ Failed to connect Order Status Feed:", err.message || err);
  }
}

/**
 * Schedule reconnection for Market Feed
 */
function scheduleReconnect(jwtToken, feedToken, delay = 10000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(
    () => reconnectFeed({ jwtToken, feedToken }),
    delay
  );
}

/**
 * Attempt reconnection
 */
async function reconnectFeed({ jwtToken, feedToken }) {
  try {
    console.log("♻️ Reconnecting to Market Feed...");
    await initAngelFeed({ jwtToken, feedToken });
  } catch (err) {
    console.error("❌ Market feed reconnection failed:", err.message || err);
    scheduleReconnect(jwtToken, feedToken, 15000);
  }
}

/**
 * Subscribe to market tokens dynamically
 */
function subscribeTokens(tokens, exchangeType = "NFO", mode = 1) {
  if (!marketWS || !isConnected)
    return console.warn("⚠️ Market feed not ready yet. Cannot subscribe.");

  const exType =
    typeof exchangeType === "string"
      ? exchangeMap[exchangeType.toUpperCase()] || 1
      : exchangeType;

  const subReq = {
    correlationID: `sub_${Date.now()}`,
    action: 1,
    mode,
    exchangeType: exType,
    tokens: Array.isArray(tokens) ? tokens : [tokens],
  };

  try {
    marketWS.fetchData(subReq);
    console.log(`✅ Subscribed to ${subReq.tokens.join(", ")} [${exchangeType} → ${exType}]`);
  } catch (err) {
    console.error("⚠️ Subscription failed:", err.message || err);
  }
}

/**
 * Emit feed status
 */
function emitFeedStatus() {
  const status = { isFeedConnected, isSessionActive };
  feedEmitter.emit("feedStatus", status);
}

/**
 * Get current feed status
 */
function getFeedStatus() {
  return { isFeedConnected, isSessionActive };
}

/**
 * Toggle session status
 */
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



