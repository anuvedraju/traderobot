// src/tradeManager.js
const { feedEmitter } = require("./services/angelFeed");
const {
  updateTrade,
  updatePnL,
  getActiveTrades,
  getTrades,
  setPnL,
} = require("./data/trades");
const { closeTrade } = require("./functions");

/**
 * Initialize and manage trade updates from live ticks and orders.
 */
function initTradeManager() {
  console.log("🧠 Trade Manager initialized...");

  // --- Handle live ticks ---
  feedEmitter.on("tick", handleTick);
  // --- Handle order updates ---
  feedEmitter.on("orderUpdate", handleOrderUpdate);

  console.log("📡 Trade Manager subscribed to feedEmitter ✅");
}

/**
 * Handle tick updates: update PnL, manage stop-loss logic.
 */
function handleTick(tick) {
  try {
    // --- Normalize symboltoken ---
    let symboltoken =
      tick.symboltoken ||
      tick.token ||
      tick.Token ||
      tick.symbol ||
      tick.tradingsymbol;

    symboltoken = symboltoken
      ?.toString()
      .replace(/['"\s]+/g, "")
      .trim();

    if (!symboltoken) return;

    // --- Normalize LTP ---
    const ltpRaw = tick.ltp ?? tick.last_traded_price;
    if (!ltpRaw || isNaN(ltpRaw)) return;

    const ltp = parseFloat(ltpRaw) / 100;
    if (!ltp || ltp <= 0) return;

    // --- Update trade PnL ---
    updatePnL(symboltoken, ltp);

    // --- Check stop-loss condition for this symbol ---
    const activeTrades = getActiveTrades();

    // Find only the matching trades to minimize loop overhead
    const symbolTrades = activeTrades.filter(
      (t) => t.symboltoken?.toString() === symboltoken.toString()
    );

    for (const trade of symbolTrades) {
      const loss = Number(trade.profit_loss || 0);
      const stopLoss = Number(trade.stop_loss || 800);

      if (trade.trade_status === "running" && loss <= -stopLoss) {
        console.log(`🚨 ${symboltoken} hit stop-loss ₹${loss}, closing...`);
        closeTrade(symboltoken);
      }
    }
  } catch (err) {
    console.error("❌ [TradeManager] Tick processing error:", err.message);
  }
}

/**
 * Handle order updates: sync trade states with SmartAPI order feed.
 */
function handleOrderUpdate(order) {
  try {
    if (!order) return;

    const symboltoken = order.symboltoken?.toString().trim();
    const status = order.status?.toLowerCase();
    const txnType = order.transactiontype?.toUpperCase();

    if (!symboltoken || !status) return;

    console.log(`📦 Order update: ${symboltoken} → ${status}`);

    const updates = {};

    if (status === "complete") {
      if (txnType === "BUY") {
        updates.trade_status = "running";
        updates.buy_price = order.averageprice || 0;
        updates.quantity = order.quantity || 0;
      } else if (txnType === "SELL") {
        updates.trade_status = "closed";
        updates.sell_price = order.averageprice || 0;
        setPnL(symboltoken, order.averageprice);
      }
    } else if (["cancelled", "rejected"].includes(status)) {
      if (txnType === "SELL") {
        console.log("orderRejected or cancelled");
      } else {
        updates.trade_status = status;
      }
    } else {
      updates.trade_status = status;
    }

    updateTrade(symboltoken, updates);

    if (updates.trade_status)
      console.log(
        `✅ ${symboltoken} trade → ${updates.trade_status.toUpperCase()}`
      );

    // Optional: keep this for debugging
    // console.log("📊 Current trades:", getTrades());
  } catch (err) {
    console.error("❌ [TradeManager] Order update error:", err.message);
  }
}

module.exports = { initTradeManager };
