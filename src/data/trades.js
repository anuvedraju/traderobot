/**
 * @typedef {Object} Trade
 * @property {string} tradingsymbol - e.g. BANKNIFTY
 * @property {string} symboltoken - token ID (used for LTP feed)
 * @property {string} exchange - e.g. "NFO", "BFO", "NSE", "BSE"
 * @property {string} orderid - Order ID from broker
 * @property {number} quantity - Order quantity
 * @property {number} [buy_price] - Buy/entry price
 * @property {number} [last_traded_price] - LTP (from feed)
 * @property {number} [profit_loss] - Current P/L in rupees
 * @property {number} [higest_profit] - Max profit seen so far
 * @property {number} [limit_sell_price] - Target or limit sell level
 * @property {number} [sell_price] - Target or limit sell level
 * @property {number} [stop_loss] - Stop-loss amount (₹ below entry)
 * @property {string} [trail] - Trailing logic ("50%"|"75%"|"cost"|"800"|"1000")
 * @property {"running"|"pending"|"closed"|"cancelled"} trade_status
 * @property {string} producttype - "DELIVERY"|"INTRADAY"
 * @property {string} variety - e.g. "NORMAL"
 * @property {string} duration - e.g. "DAY"
 * @property {Date} createdAt - Time of order creation
 * @property {Date} [updatedAt] - Last update time
 */

const { subscribeTokens } = require("../services/angelFeed");

let trades = [];

/**
 * Add a new trade
 * @param {Partial<Trade>} order
 */
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
    last_traded_price: order.last_traded_price || 0,
    profit_loss: order.profit_loss || 0,
    higest_profit: order.higest_profit || 0,
    limit_sell_price: order.limit_sell_price || null,
    sell_price: 0,
    stop_loss: order.stop_loss || null,
    trail: order.trail || "none",
    trade_status: order.trade_status || "pending",

    createdAt: new Date(),
    updatedAt: new Date(),
  };

  trades.push(trade);
  console.log("tradeadded",trade)
  const exType = getExchangeType(order.exchange);
  subscribeTokens(order.symboltoken, 1);
  
  
  return trade;
}

/**
 * Update any trade by tradingsymbol or orderid
 * @param {string} identifier - symbol or orderid
 * @param {Partial<Trade>} updateData
 */
function updateTrade(identifier, updateData) {
  const t = trades.find(
    (t) => t.tradingsymbol === identifier || t.orderid === identifier
  );
  if (t) {
    Object.assign(t, updateData, { updatedAt: new Date() });

    // Track highest profit dynamically
    if (typeof t.profit_loss === "number") {
      if (!t.higest_profit || t.profit_loss > t.higest_profit) {
        t.higest_profit = t.profit_loss;
      }
    }
  }
}

/**
 * Calculate profit/loss for a symbol using latest LTP
 * @param {string} symbol
 * @param {number} ltp
 */
function updatePnL(symbol, ltp) {
  const trade = trades.find((t) => t.tradingsymbol === symbol);
  if (trade) {
    trade.last_traded_price = ltp;
    trade.profit_loss = (ltp - trade.buy_price) * trade.quantity;
    trade.updatedAt = new Date();
  }
}

function getExchangeType(exchange) {
  const map = {
    NSE: 1,
    NFO: 2,
    BSE: 3,
    BFO: 4,
    MCX: 5,
  };
  return map[exchange] || 1; // default NSE if unknown
}

/**
 * Get all trades
 * @returns {Trade[]}
 */
function getTrades() {
  return trades;
}

/**
 * Get active/running trades
 * @returns {Trade[]}
 */
function getActiveTrades() {
  return trades.filter((t) => t.trade_status === "running");
}

/**
 * Close a trade (set status = closed)
 * @param {string} symbol
 */
function closeTrade(symbol) {
  updateTrade(symbol, { trade_status: "closed" });
}

/**
 * Remove a trade completely
 * @param {string} symbol
 */
function removeTrade(symbol) {
  trades = trades.filter((t) => t.tradingsymbol !== symbol);
}

/**
 * Reset all trades (useful for testing)
 */
function clearTrades() {
  trades = [];
}

module.exports = {
  addTrade,
  updateTrade,
  updatePnL,
  getTrades,
  getActiveTrades,
  closeTrade,
  removeTrade,
  clearTrades,
};
