// src/data/trades.js
const { subscribeTokens } = require("../services/angelFeed");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

const FILE_PATH = path.join(__dirname, "trades.json");
const tradeEmitter = new EventEmitter();

let trades = [];
let saveTimer = null;
let lastEmit = 0;

/**
 * Add a new trade and subscribe to its token feed.
 */
function addTrade(order = {}) {
  const { symboltoken, tradingsymbol, transactiontype } = order;

  if (!symboltoken || !tradingsymbol) {
    console.error("❌ Missing symboltoken/tradingsymbol:", order);
    return null;
  }

  const token = symboltoken.toString();
  const type = transactiontype?.toUpperCase() || "";

  // ✅ Common structure for every trade/order
  const tradeData = {
    tradingsymbol,
    symboltoken: token,
    exchange: order.exchange || "NSE",
    orderid: order.orderid || null,
    transactiontype: type,
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
    currentOrder: [
      {
        orderid: order.orderid,
        transactiontype: type,
        price: order.buy_price || order.price || 0,
        quantity: order.quantity || 1,
      },
    ],
  };

  // 🔍 Case 1: SELL order and a running BUY trade exists
  if (type === "SELL") {
    console.log("type SELL");
    const runningTrade = trades.find(
      (t) => t.symboltoken === token && t.trade_status === "running"
    );
    if (runningTrade) {
      console.log(
        `🔁 Running trade found for ${tradingsymbol}, replacing currentOrder...`
      );

      // ✅ Replace the existing currentOrder array entirely with the new SELL order
      runningTrade.currentOrder = [
        {
          orderid: order.orderid,
          transactiontype: "SELL",
          price: order.sell_price || order.price || 0,
          quantity: order.quantity || 1,
        },
      ];

      // Optional: update trade status to indicate it’s closing
      runningTrade.updatedAt = new Date();

      // Emit updated trade to frontend and persist
      emitTrade(runningTrade);
      scheduleSave();

      console.log(
        `✅ Replaced currentOrder for running trade: ${tradingsymbol}`
      );
      return runningTrade;
    }
  } else {
    trades.push(tradeData);
  }

  // 🔍 Case 2: BUY order or no running trade found

  console.log(`✅ Trade added: ${tradingsymbol} (${token})`);

  // Subscribe only for new trades
  subscribeTokens(token, tradeData.exchange);
  scheduleSave();
  emitTrade(tradeData);

  return tradeData;
}

/**
 * Update existing trade fields.
 */
function updateTrade(identifier, updates = {}) {
  if (!identifier || !Object.keys(updates).length) return;

  const id = identifier.toString();
  const trade = trades.find((t) => t.symboltoken === id || t.orderid === id);
  if (!trade) return console.warn(`⚠️ Trade not found for ${id}`);

  Object.assign(trade, updates, { updatedAt: new Date() });
  scheduleSave();
  emitTrade(trade);
}

/**
 * Update profit/loss for all trades with given token.
 */
function updatePnL(symboltoken, ltp) {
  if (!symboltoken || !ltp) return;
  const token = symboltoken.toString();

  const tokenTrades = trades.filter((t) => t.symboltoken === token);
  if (!tokenTrades.length) return;

  tokenTrades.forEach((t) => {
    t.last_traded_price = ltp;
    if (t.trade_status === "running") {
      t.profit_loss = Number(((ltp - t.buy_price) * t.quantity).toFixed(2));
      t.highest_profit = Math.max(t.highest_profit || 0, t.profit_loss);
    }
    t.updatedAt = new Date();
    console.debug("profit_updtaed", t.last_traded_price, t.profit_loss);
    emitTrade(t);
  });

  scheduleSave();
}
function setPnL(symboltoken, price) {
  if (!symboltoken || !price) return;
  const token = symboltoken.toString();

  const tokenTrades = trades.filter((t) => t.symboltoken === token);
  if (!tokenTrades.length) return;

  tokenTrades.forEach((t) => {
    t.profit_loss = Number(((price - t.buy_price) * t.quantity).toFixed(2));
    t.updatedAt = new Date();
    emitTrade(t);
  });

  scheduleSave();
}

// Emit trade update (debounced to reduce spam)
function emitTrade(trade) {
  const now = Date.now();
  if (now - lastEmit < 150) return; // Prevent spam during fast ticks
  lastEmit = now;
  tradeEmitter.emit("tradeUpdated", trade);
}

// Utility functions
function getTrades() {
  return trades;
}
function getTradesBySymbol(symbol) {
  const sym = symbol?.toString();
  return trades.find(
    (t) => t.symboltoken === sym || t.tradingsymbol === sym || t.orderid === sym
  );
}
function getActiveTrades() {
  return trades.filter((t) => t.trade_status === "running");
}
function clearTrades() {
  trades = [];
  saveToFile();
  console.log("🧹 Cleared all trades.");
}

// Debounced file save
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToFile, 1000);
}
function saveToFile() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(trades, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Save trades error:", err.message);
  }
}

module.exports = {
  addTrade,
  updateTrade,
  updatePnL,
  setPnL,
  getTrades,
  getActiveTrades,
  getTradesBySymbol,
  clearTrades,
  tradeEmitter,
};
