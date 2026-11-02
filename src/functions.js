const { prepareSell } = require("./services/sellQuantity");
const { getSmartApi } = require("./controllers/authorizationController");
const { getTrades, updateTrade } = require("./data/trades");
const { feedEmitter } = require("./services/angelFeed");




/**
 * Close an active trade at market price
 */
async function closeTrade(symbol) {
  try {
    const trade = getTrades().find(trade =>
      ["running", "closing"].includes(trade.trade_status) &&
      [trade.orderid, trade.symboltoken, trade.tradingsymbol].some(value => String(value) === String(symbol)));
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
    const currentOrders = Array.isArray(trade.currentOrder)
      ? trade.currentOrder
      : Array.isArray(trade.currentorder)
        ? trade.currentorder
        : [];

    const existingSellOrder = currentOrders.find((order) => {
      const orderTxnType = order?.transactiontype?.toUpperCase?.();
      const orderStatus = order?.status?.toLowerCase?.();

      return (
        orderTxnType === "SELL" &&
        order?.orderid &&
        !["complete", "cancelled", "rejected"].includes(orderStatus)
      );
    });

    if (existingSellOrder) {
      const cancelParams = {
        orderid: existingSellOrder.orderid,
        variety: trade.variety || "NORMAL",
      };

      console.log(
        `🛑 Cancelling existing SELL order for ${symbol}...`,
        cancelParams,
      );

      const cancellation = await smartApi.cancelOrder(cancelParams);
      const cancelBody = cancellation?.data && typeof cancellation.data === "object" ? cancellation.data : cancellation;
      if (cancellation?.status === false || cancelBody?.status === false || cancelBody?.success === false) {
        throw new Error(cancelBody?.message || "Could not cancel existing sell order");
      }

      updateTrade(symbol, {
        currentOrder: currentOrders.filter(
          (order) => order?.orderid !== existingSellOrder.orderid,
        ),
      });
    }

    const orderParams = await prepareSell(smartApi, {
      variety: "NORMAL",
      tradingsymbol: trade.tradingsymbol,
      symboltoken: trade.symboltoken,
      transactiontype: txnType,
      ordertag: "Traderobot",
      exchange: trade.exchange || "NSE",
      ordertype: "MARKET",
      producttype: trade.producttype || "INTRADAY",
      quantity: trade.quantity,
      duration: "DAY",
    });

    console.log(`📤 Placing market close order for ${symbol} (${txnType})...`, orderParams);

    const response = await smartApi.placeOrder(orderParams);
    console.log("📦 Full placeOrder response:", response);
    const body = response?.data && !Array.isArray(response.data) ? response.data : response;
    if (response?.status === false || body?.status === false || body?.success === false) {
      throw new Error(body?.message || "Broker rejected close order");
    }

    const orderId =
      response?.data?.orderid ||
      response?.data?.order?.orderid ||
      response?.orderid ||
      null;
    if (!orderId) throw new Error("Broker did not return a close order ID");

    console.log(`✅ Order placed successfully! Order ID: ${orderId}`);

    await updateTrade(symbol, {
      trade_status: "closing",
      currentOrder: [{ orderid: orderId, transactiontype: "SELL", status: "pending", ordertag: "Traderobot", order_source: "Traderobot", quantity: orderParams.quantity }],
      exit_price: "MARKET",
      exit_time: new Date().toISOString(),
      exit_order_id: orderId,
    });

    console.log(`💼 Trade closed successfully: ${symbol}`);

    feedEmitter.emit("order", {
      symbol,
      status: "closing",
      message: "Closed at market",
    });
  } catch (err) {
    updateTrade(symbol, { trade_status: "running" });
    console.error(`❌ Failed to close trade for ${symbol}:`, err.message || err);
  }
}

module.exports = { closeTrade };
