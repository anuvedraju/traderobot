// src/tradeManager.js
const { feedEmitter } = require("./services/angelFeed");
const {
  updateTrade,
  updatePnL,
  getActiveTrades,
  getTrades,
} = require("./data/trades");
const { closeTrade } = require("./functions");

function initTradeManager() {
  console.log("🧠 Trade Manager running...");

  // ✅ Tick updates → update PnL and strategy logic
  feedEmitter.on("tick", (tick) => {
    // Extract and sanitize token properly
    let symboltoken =
      tick.symboltoken ||
      tick.token ||
      tick.Token ||
      tick.symbol ||
      tick.tradingsymbol;

    // ✅ Remove extra quotes and spaces
    symboltoken = symboltoken?.toString().replace(/['"]+/g, "").trim();

    const ltp = parseFloat(tick.ltp / 100 || tick.last_traded_price / 100);
    if (!symboltoken || !ltp) return;

    updatePnL(symboltoken, ltp);

    const active = getActiveTrades();
    // console.log("trade",getTrades())
    active.forEach((trade) => {
      const loss = trade.profit_loss;
      const stopLoss = trade.stop_loss || 800;

      if (loss <= -stopLoss && trade.trade_status === "running") {
        console.log(`🚨 ${symboltoken} hit stop-loss ₹${loss}, closing...`);
        closeTrade(symboltoken);
      }
    });
  });

  // ✅ Order updates → update trade status
  feedEmitter.on("orderUpdate", (order) => {
    console.log("orderUpdate", order);
    const symboltoken = order.symboltoken.toString();
    const status = order.status?.toLowerCase();
    console.log("orderdata", symboltoken, status);
    if (!symboltoken) return;

    if (status === "complete") {
      if (order.transactiontype === "BUY") {
        updateTrade(symboltoken, {
          trade_status: "running",
          buy_price: order.averageprice,
          quantity:order.quantity
        });
      } else if (order.transactiontype === "SELL") {
        updateTrade(symboltoken, { trade_status: "closed" });
        updateTrade(symboltoken, { sell_price: order.averageprice });
      }
      console.log(`✅ ${symboltoken} trade now RUNNING`);
    } else if (status === "cancelled" || status === "rejected") {
      updateTrade(symboltoken, { trade_status: status });
      console.log(`⚠️ ${symboltoken} trade ${status}`);
    } else {
      updateTrade(symboltoken, { trade_status: status });
    }

    console.log("trade", getTrades());
  });

  console.log("📡 Trade Manager subscribed to feedEmitter ✅");
}

module.exports = { initTradeManager };
