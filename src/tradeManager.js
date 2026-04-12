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

  feedEmitter.on("tick", handleTick);
  feedEmitter.on("orderUpdate", handleOrderUpdate);

  console.log("📡 Trade Manager subscribed to feedEmitter ✅");
}

/**
 * Handle tick updates: update PnL, manage SL & trailing logic.
 */
function handleTick(tick) {
  try {
    // ─────────────────────────────────────────────
    // Normalize symboltoken
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // Normalize LTP
    // ─────────────────────────────────────────────
    const ltpRaw = tick.ltp ?? tick.last_traded_price;
    if (!ltpRaw || isNaN(ltpRaw)) return;

    const ltp = parseFloat(ltpRaw) / 100;
    if (ltp <= 0) return;

    // ─────────────────────────────────────────────
    // Update PnL
    // ─────────────────────────────────────────────
    updatePnL(symboltoken, ltp);

    // ─────────────────────────────────────────────
    // Process active trades for this symbol
    // ─────────────────────────────────────────────
    const symbolTrades = getActiveTrades().filter(
      (t) => t.symboltoken?.toString() === symboltoken,
    );

    for (const trade of symbolTrades) {
      if (trade.trade_status !== "running") continue;

      // ─────────────────────────────────────────────
      // Update highest profit
      // ─────────────────────────────────────────────
      if (trade.profit_loss > (trade.highest_profit || 0)) {
        updateTrade(symboltoken, {
          highest_profit: trade.profit_loss,
        });
      }

      // ─────────────────────────────────────────────
      // Stop-loss logic
      // ─────────────────────────────────────────────
      const loss = Number(trade.profit_loss || 0);
      const stopLoss = Number(trade.stop_loss || 800);

      if (loss <= -stopLoss) {
        console.log(`🚨 ${symboltoken} hit stop-loss | PnL: ₹${loss}`);

        updateTrade(symboltoken, { trade_status: "closing" });
        closeTrade(symboltoken);
        continue;
      }
      if (trade.highest_profit > 800 && stopLoss !== 10) {
        console.log(`🔒 Tightening stop-loss for ${symboltoken} to ₹10`);
        // closeTrade(symboltoken);ß
        updateTrade(symboltoken, { stop_loss: 10 });
        // updateTrade(tokenStr, { target: 50 });

      }

      // ─────────────────────────────────────────────
      // Trailing target logic
      // ─────────────────────────────────────────────
      handleTrailingTarget({
        trade,
        symboltoken,
      });
    }
  } catch (err) {
    console.error("❌ [TradeManager] Tick error:", err.message);
  }
}

/**
 * Percentage-based trailing profit booking
 */
function handleTrailingTarget({ trade, symboltoken }) {
  if (!trade) return;
  if (trade.trade_status !== "running") return;
  if (trade.target == null) return;
  if (trade.highest_profit <= 0) return;

  // Optional noise filter
  // if (trade.highest_profit < 500) return;

  const normalize = (v) => Math.round(v * 100) / 100;

  const targetPercent = Number(trade.target);
  if (Number.isNaN(targetPercent) || targetPercent <= 0) return;

  const targetPrice = normalize((trade.highest_profit * targetPercent) / 100);
  updateTrade(symboltoken, { target_Price: targetPrice });

  const currentProfit = normalize(trade.profit_loss);

  if (currentProfit > targetPrice) return;

  console.log(
    `🎯 Trailing target hit | ${symboltoken} | ` +
      `Highest: ₹${trade.highest_profit}, ` +
      `Current: ₹${currentProfit}, ` +
      `Target (${targetPercent}%): ₹${targetPrice}`,
  );

  updateTrade(symboltoken, { trade_status: "closing" });
  closeTrade(symboltoken);
}

/**
 * Handle order updates from broker
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
        if (order.producttype) updates.producttype = order.producttype;
        if (order.variety) updates.variety = order.variety;
        if (order.duration) updates.duration = order.duration;
      } else if (txnType === "SELL") {
        updates.trade_status = "closed";
        // updates.stop_loss = 10;
        updates.sell_price = order.averageprice || 0;
        setPnL(symboltoken, order.averageprice);
      }
    } else if (["cancelled", "rejected"].includes(status)) {
      if (txnType === "SELL") {
        console.log(`⚠️ SELL order ${status} — skipping close.`);
      } else {
        updates.trade_status = status;
        console.log(`⚠️ CANCELL order ${status} — skipping close.`);
      }
    } else {
      if (txnType === "SELL") {
        console.log(
          `🕒 SELL order pending (${status}) — adding to currentOrder...`,
        );

        // 🔍 Find the existing running trade for this token
        const runningTrade = getActiveTrades().find(
          (t) => t.symboltoken === symboltoken && t.trade_status === "running",
        );

        if (runningTrade) {
          // ✅ Replace or update currentOrder for this trade
          runningTrade.currentOrder = [
            {
              orderid: order.orderid,
              transactiontype: "SELL",
              price: order.price || 0,
              quantity: order.quantity || 1,
              status: status,
              triggerprice: order.triggerprice || 0,
              updatetime: order.updatetime || new Date().toISOString(),
            },
          ];

          runningTrade.updatedAt = new Date();
          console.log(`✅ Updated currentOrder for ${symboltoken} (${status})`);
        } else {
          console.warn(
            `⚠️ No running trade found for SELL ${symboltoken}, storing as pending.`,
          );
        }
      } else {
        updates.trade_status = status;
      }
    }

    updateTrade(symboltoken, updates);

    if (updates.trade_status)
      console.log(
        `✅ ${symboltoken} trade → ${updates.trade_status.toUpperCase()}`,
      );

    // Optional: keep this for debugging
    // console.log("📊 Current trades:", getTrades());
  } catch (err) {
    console.error("❌ [TradeManager] Order update error:", err.message);
  }
}

module.exports = { initTradeManager };
