// src/data/trades.js
const { subscribeTokens } = require("../services/angelFeed");
const fs = require("fs");
const path = require("path");

let trades = [];
let saveTimer = null; // 🕒 Debounce file writes

const FILE_PATH = path.join(__dirname, "trades.json");

/**
 * Adds a new trade to memory and subscribes to its token feed.
 */
function addTrade(order = {}) {
  if (!order.symboltoken || !order.tradingsymbol) {
    console.error("❌ Cannot add trade — missing symboltoken/tradingsymbol:", order);
    return null;
  }

  const trade = {
    tradingsymbol: order.tradingsymbol,
    symboltoken: order.symboltoken.toString(),
    exchange: order.exchange || "NFO",
    orderid: order.orderid || null,
    producttype: order.producttype || "INTRADAY",
    variety: order.variety || "NORMAL",
    duration: order.duration || "DAY",
    quantity: Number(order.quantity) || 1,
    buy_price: Number(order.buy_price) || 0,
    last_traded_price: 0,
    profit_loss: 0,
    highest_profit: 0,
    limit_sell_price: Number(order.limit_sell_price) || null,
    stop_loss: Number(order.stop_loss) || 800,
    trail: order.trail || "none",
    trade_status: order.trade_status || "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  trades.push(trade);
  console.log(`✅ Trade added: ${trade.tradingsymbol} (${trade.symboltoken})`);

  // Save + subscribe
  scheduleSave();
  subscribeTokens(trade.symboltoken, trade.exchange);

  return trade;
}

/**
 * Updates an existing trade by symboltoken or orderid.
 */
function updateTrade(identifier, updateData = {}) {
  if (!identifier) return;

  const idStr = identifier.toString();
  const trade = trades.find(
    (t) => t.symboltoken === idStr || t.orderid === idStr
  );

  if (!trade) {
    console.warn(`⚠️ No trade found for identifier: ${identifier}`);
    return;
  }

  Object.assign(trade, updateData, { updatedAt: new Date() });
  scheduleSave();

  // Debug log (only for important changes)
  if (updateData.trade_status) {
    console.log(
      `📝 Trade ${trade.tradingsymbol} updated → ${updateData.trade_status.toUpperCase()}`
    );
  }
}

/**
 * Updates profit/loss (PnL) for all trades of a given symboltoken.
 */
function updatePnL(symboltoken, ltp) {
  if (!symboltoken || !ltp) return;

  const tokenStr = symboltoken.toString();
  const tokenTrades = trades.filter((t) => t.symboltoken === tokenStr);

  if (tokenTrades.length === 0) return;

  tokenTrades.forEach((t) => {
    t.last_traded_price = ltp;

    if (t.trade_status === "running") {
      const pnl = (ltp - t.buy_price) * t.quantity;
      t.profit_loss = Number(pnl.toFixed(2));
      t.highest_profit = Math.max(t.highest_profit || 0, t.profit_loss);
    }

    t.updatedAt = new Date();
  });

  scheduleSave();
}

/**
 * Returns all trades.
 */
function getTrades() {
  return trades;
}

/**
 * Returns a single trade by symboltoken or tradingsymbol.
 */
function getTradesBySymbol(symbol) {
  const symStr = symbol?.toString();
  return trades.find(
    (t) =>
      t.symboltoken === symStr ||
      t.tradingsymbol === symStr ||
      t.orderid === symStr
  );
}

/**
 * Returns only currently running trades.
 */
function getActiveTrades() {
  return trades.filter((t) => t.trade_status === "running");
}

/**
 * Clears all trades from memory and file.
 */
function clearTrades() {
  trades = [];
  saveToFile();
  console.log("🧹 Cleared all trades.");
}

/**
 * Schedules saving trades to disk (debounced for efficiency).
 */
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToFile, 1000); // ⏳ delay saves by 1s to batch updates
}

/**
 * Saves the current trades array to disk.
 */
function saveToFile() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(trades, null, 2), "utf-8");
    // console.log("💾 Trades saved.");
  } catch (err) {
    console.error("❌ Failed to save trades:", err.message);
  }
}

module.exports = {
  addTrade,
  updateTrade,
  updatePnL,
  getTrades,
  getActiveTrades,
  getTradesBySymbol,
  clearTrades,
};
