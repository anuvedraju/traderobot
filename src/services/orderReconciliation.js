const { getSmartApi } = require("../controllers/authorizationController");
const { getTrades } = require("../data/trades");
const { feedEmitter } = require("./angelFeed");

let inFlight = null;
let timer = null;

function reconcileOrders() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const response = await getSmartApi().getOrderBook();
    const body = response?.data && !Array.isArray(response.data) ? response.data : response;
    if (body?.status === false || body?.success === false) {
      throw new Error(body.message || "Order book request failed");
    }
    const orders = Array.isArray(body?.data) ? body.data : null;
    if (!orders) throw new Error("Invalid broker order book response");

    for (const trade of getTrades()) {
      const pendingEntry = ["pending", "open", "trigger pending", "modified", "unknown"].includes(trade.trade_status);
      const exits = (Array.isArray(trade.currentOrder) ? trade.currentOrder : [trade.currentOrder])
        .filter((order) => order?.transactiontype === "SELL" &&
          !["complete", "cancelled", "rejected"].includes(order.status));
      const ids = new Set([
        ...(pendingEntry && trade.orderid ? [String(trade.orderid)] : []),
        ...exits.map((order) => String(order.orderid)),
      ]);
      for (const order of orders) {
        if (!ids.has(String(order.orderid))) continue;
        feedEmitter.emit("orderUpdate", {
          ...order,
          symboltoken: order.symboltoken || trade.symboltoken,
          status: (order.orderstatus || order.status || "").toString().trim().toLowerCase(),
        });
      }
    }
  })().finally(() => { inFlight = null; });
  return inFlight;
}

function startOrderReconciliation() {
  if (timer) return;
  const refresh = () => reconcileOrders().catch((error) =>
    console.error("❌ Order reconciliation failed:", error.message));
  refresh();
  timer = setInterval(refresh, 10000);
  timer.unref();
}

module.exports = { reconcileOrders, startOrderReconciliation };
