// tradeManager.js

const { feedEmitter } = require("./services/angelFeed");
const {
  updateTrade,
  updatePnL,
  getActiveTrades,
  getTrades,
  closeTrade,
} = require("./data/trades");
const { placeOrder } = require("./controllers/orderController");

/**
 * Initialize Trade Manager
 * Handles live price updates and trade logic decisions
 */
function initTradeManager() {
  console.log("🧠 Trade Manager running...");

  // Listen to every live tick from Angel Feed
  feedEmitter.on("tick", (tick) => {
    const symbol = tick.symbol || tick.tradingsymbol;
    const ltp = tick.ltp;

    if (!symbol || !ltp) return; // sanity check

    // Update trade LTP and PnL
    updatePnL(symbol, ltp);

    // Get all running trades
    const activeTrades = getActiveTrades();

    // Print for debugging (optional)
    // console.log("📊 Active Trades:", activeTrades);

    // Run strategy logic for each trade
    activeTrades.forEach((trade) => {
      const loss = trade.profit_loss || 0;
      const stopLoss = trade.stop_loss || 0;

      // 1️⃣ Stop-loss condition
      if (Math.abs(loss) >= stopLoss && trade.trade_status !== "closed") {
        console.log(`🚨 ${trade.tradingsymbol} loss ₹${loss} > SL ₹${stopLoss}, selling...`);

        // Close position (mock)
        placeOrder({
          tradingsymbol: trade.tradingsymbol,
          symboltoken: trade.symboltoken,
          exchange: trade.exchange,
          type: "SELL",
          quantity: trade.quantity,
          ordertype: "MARKET",
          producttype: trade.producttype,
        });

        closeTrade(trade.tradingsymbol);
        console.log(`✅ ${trade.tradingsymbol} position closed.`);
        return;
      }

      // 2️⃣ Optional: Trailing stop logic
      if (trade.trail === "50%" && loss > 0.5 * stopLoss) {
        const newSL = stopLoss / 2;
        updateTrade(trade.tradingsymbol, { stop_loss: newSL });
        console.log(`📈 ${trade.tradingsymbol} trailing SL moved to ₹${newSL}`);
      }

      if (trade.trail === "75%" && loss > 0.75 * stopLoss) {
        const newSL = stopLoss / 4;
        updateTrade(trade.tradingsymbol, { stop_loss: newSL });
        console.log(`📈 ${trade.tradingsymbol} trailing SL tightened to ₹${newSL}`);
      }

      // 3️⃣ Optional: Profit booking
      if (trade.limit_sell_price && ltp >= trade.limit_sell_price) {
        console.log(`🎯 ${trade.tradingsymbol} hit target ₹${ltp}, selling...`);
        placeOrder({
          tradingsymbol: trade.tradingsymbol,
          symboltoken: trade.symboltoken,
          exchange: trade.exchange,
          type: "SELL",
          quantity: trade.quantity,
          ordertype: "MARKET",
          producttype: trade.producttype,
        });
        closeTrade(trade.tradingsymbol);
      }
    });
  });

  console.log("📡 Trade Manager subscribed to feedEmitter ticks.");
}

module.exports = { initTradeManager };