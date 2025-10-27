const { getSmartApi } = require("./controllers/authorizationController");
const { getTradesBySymbol, updateTrade } = require("./data/trades");
const { feedEmitter } = require("./services/angelFeed");




/**
 * Close an active trade at market price
 */
async function closeTrade(symbol) {
  try {
    const trade = await getTradesBySymbol(symbol);
    console.log("🔎 Trade fetched:", trade);

    if (!trade) {
      console.warn(`⚠️ No active trade found for symbol ${symbol}`);
      return;
    }

    if (trade.trade_status === "closed") {
      console.log(`ℹ️ Trade already closed for ${symbol}`);
      return;
    }

    if (!trade.tradingsymbol || !trade.symboltoken || !trade.quantity) {
      console.error("❌ Incomplete trade data, cannot place order:", trade);
      return;
    }

    const smartApi = getSmartApi();
    const txnType = "SELL";

    const orderParams = {
      variety: "NORMAL",
      tradingsymbol: trade.tradingsymbol,
      symboltoken: trade.symboltoken,
      transactiontype: txnType,
      exchange: trade.exchange || "NSE",
      ordertype: "MARKET",
      producttype: trade.producttype || "INTRADAY",
      quantity: trade.quantity,
      duration: "DAY",
    };

    console.log(`📤 Placing market close order for ${symbol} (${txnType})...`, orderParams);

    const response = await smartApi.placeOrder(orderParams);
    console.log("📦 Full placeOrder response:", response);

    const orderId =
      response?.data?.orderid ||
      response?.data?.order?.orderid ||
      response?.orderid ||
      "N/A";

    console.log(`✅ Order placed successfully! Order ID: ${orderId}`);

    await updateTrade(symbol, {
      trade_status: "closed",
      exit_price: "MARKET",
      exit_time: new Date().toISOString(),
      exit_order_id: orderId,
    });

    console.log(`💼 Trade closed successfully: ${symbol}`);

    feedEmitter.emit("order", {
      symbol,
      status: "closed",
      message: "Closed at market",
    });
  } catch (err) {
    console.error(`❌ Failed to close trade for ${symbol}:`, err.message || err);
  }
}

module.exports = { closeTrade };