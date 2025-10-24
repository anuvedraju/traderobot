// src/data/trades.js
const { subscribeTokens } = require("../services/angelFeed");
const fs = require("fs");
const path = require("path");
let trades = [];

function addTrade(order) {
  const trade = {
    tradingsymbol: order.tradingsymbol,
    symboltoken: order.symboltoken,
    exchange: order.exchange || "NFO",
    orderid: order.orderid || null,
    producttype: order.producttype || "INTRADAY",
    variety: order.variety || "NORMAL",
    duration: order.duration || "DAY",
    quantity: order.quantity || 1,
    buy_price: order.buy_price || 0,
    last_traded_price: 0,
    profit_loss: 0,
    higest_profit: 0,
    limit_sell_price: order.limit_sell_price || null,
    stop_loss: order.stop_loss || 800,
    trail: order.trail || "none",
    trade_status: order.trade_status || "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    //sellprice added trade completion
  };

  trades.push(trade);
  console.log("✅ Trade added:", trade.tradingsymbol);
  saveTradesToFile();
  subscribeTokens(order.symboltoken, order.exchange); // subscribe dynamically
  return trade;
}

function updateTrade(identifier, updateData) {
  console.log("orderdata", identifier, updateData);
  const t = trades.find(
    (t) => t.symboltoken === identifier.toString() || t.orderid === identifier
  );
  if (!t) return;
  console.log("ttttt", t);

  Object.assign(t, updateData, { updatedAt: new Date() });
  saveTradesToFile();
}

function updatePnL(symboltoken, ltp) {
  console.log("update", symboltoken, ltp);

  // 🧩 Find ALL trades with the same symboltoken
  const matchingTrades = trades.filter(
    (t) => t.symboltoken.toString() === symboltoken.toString()
  );

  if (matchingTrades.length === 0) {
    console.log(`⚠️ No trades found for token ${symboltoken}`);
    return;
  }

  matchingTrades.forEach((t) => {
    // Update latest price
    t.last_traded_price = ltp;

    // Update P&L only for running trades
    if (t.trade_status === "running") {
      t.profit_loss = Number(((ltp - t.buy_price) * t.quantity).toFixed(2));
      t.higest_profit = Math.max(t.higest_profit || 0, t.profit_loss);
    }

    t.updatedAt = new Date();
  });

  saveTradesToFile();
}

function getTrades() {
  return trades;
}
function getActiveTrades() {
  return trades.filter((t) => t.trade_status === "running");
}
function closeTrade(symbol) {
  updateTrade(symbol, { trade_status: "closed" });
}
function clearTrades() {
  trades = [];
}

function saveTradesToFile() {
  const filePath = path.join(__dirname, "./trades.json");

  try {
    // Write formatted JSON (pretty 2-space indentation)
    fs.writeFileSync(filePath, JSON.stringify(trades, null, 2), "utf-8");
    // console.log("💾 Trades saved to file.");
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
  closeTrade,
  clearTrades,
};
