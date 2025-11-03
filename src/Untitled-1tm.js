// src/tradeManager.js
const { feedEmitter } = require("./services/angelFeed");
const {
  updateTrade,
  updatePnL,
  getActiveTrades,
  getTrades,
} = require("./data/trades");
const { closeTrade, emitTrade } = require("./functions"); // ✅ emitTrade sends trade update via WebSocket

// ⚡ Cache active trades for O(1) lookup per symboltoken
const activeTradeMap = new Map();

/**
 * 🔁 Build or refresh the active trade cache
 */
function rebuildActiveTradeMap() {
  activeTradeMap.clear();
  const activeTrades = getActiveTrades();

  for (const trade of activeTrades) {
    const token = trade.symboltoken?.toString();
    if (!token) continue;
    if (!activeTradeMap.has(token)) activeTradeMap.set(token, []);
    activeTradeMap.get(token).push(trade);
  }

  console.log(`🧭 Active Trade Map rebuilt: ${activeTradeMap.size} tokens`);
}

/**
 * 🧠 Initialize trade manager — sets up tick & order listeners
 */
function initTradeManager() {
  console.log("🧠 Trade Manager initialized...");

  // Initial cache build
  rebuildActiveTradeMap();

  // 🔄 Subscribe to feed events
  feedEmitter.on("tick", handleTick);
  feedEmitter.on("orderUpdate", handleOrderUpdate);
  feedEmitter.on("orderUpdate", rebuildActiveTradeMap);

  console.log("📡 Trade Manager subscribed to feedEmitter ✅");
}

/**
 * ⚡ Handle live ticks: update PnL, check SL, and emit updates
 */
function handleTick(tick) {
  try {
    const symboltoken =
      tick.symboltoken ||
      tick.token ||
      tick.Token ||
      tick.symbol ||
      tick.tradingsymbol;

    if (!symboltoken) return;
    const tokenStr = symboltoken.toString().trim();

    const rawLtp = tick.ltp ?? tick.last_traded_price;
    if (!rawLtp || isNaN(rawLtp)) return;

    const ltp = parseFloat(rawLtp) / 100;
    if (!ltp || ltp <= 0) return;

    // 🔹 Get cached trades for this token
    const tokenTrades = activeTradeMap.get(tokenStr);
    if (!tokenTrades || tokenTrades.length === 0) return;

    // 🔹 Update all trades for this token
    updatePnL(tokenStr, ltp);

    // 🔹 Check stop-loss and emit live trade updates
    for (const trade of tokenTrades) {
      if (trade.trade_status !== "running") continue;

      const loss = Number(trade.profit_loss || 0);
      const stopLoss = Number(trade.stop_loss || 800);

      // Emit to frontend immediately (live PnL stream)
      if (loss <= -stopLoss) {
        console.log(`🚨 ${tokenStr} hit stop-loss ₹${loss}, closing...`);
        closeTrade(tokenStr);
      }
    }
  } catch (err) {
    console.error("❌ [TradeManager] Tick processing error:", err.message);
  }
}

/**
 * 📦 Handle order updates: sync with backend & notify frontend
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
        updates.buy_price = Number(order.averageprice) || 0;
        updates.quantity = Number(order.quantity) || 0;
      } else if (txnType === "SELL") {
        updates.trade_status = "closed";
        updates.sell_price = Number(order.averageprice) || 0;

        // Calculate realized PnL on SELL
        const trades = getTrades();
        const existing = trades.find(
          (t) => t.symboltoken?.toString() === symboltoken
        );
        if (existing) {
          const entry = Number(existing.buy_price);
          const exit = Number(order.averageprice);
          const qty = Number(existing.quantity);
          const pnl = (exit - entry) * qty;
          updates.profit_loss = Number(pnl.toFixed(2));
          updates.highest_profit = Math.max(
            existing.highest_profit || 0,
            pnl
          );
        }
      }
    } else if (["cancelled", "rejected"].includes(status)) {
      updates.trade_status = status;
    } else {
      updates.trade_status = status;
    }

    // 🔹 Apply trade updates
    updateTrade(symboltoken, updates);

    // 🔹 Emit to frontend immediately


    // 🔹 Keep cache in sync
    rebuildActiveTradeMap();

    console.log(`✅ ${symboltoken} → ${updates.trade_status?.toUpperCase()}`);
  } catch (err) {
    console.error("❌ [TradeManager] Order update error:", err.message);
  }
}

module.exports = { initTradeManager };