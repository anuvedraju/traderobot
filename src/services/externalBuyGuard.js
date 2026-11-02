const fs = require("fs");
const path = require("path");
const { getSmartApi } = require("../controllers/authorizationController");
const { updateTrade } = require("../data/trades");
const { prepareSell } = require("./sellQuantity");

// Keep submission attempts across restarts. An uncertain submission must never
// be retried automatically: the first request may already have reached the broker.
const journalPath = path.join(__dirname, "../data/external-buy-exits.json");
let attempts = {};
if (fs.existsSync(journalPath)) attempts = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const busy = new Set();
function record(id, value) {
  attempts[id] = value;
  fs.writeFileSync(`${journalPath}.tmp`, JSON.stringify(attempts, null, 2));
  fs.renameSync(`${journalPath}.tmp`, journalPath);
}
function body(response) {
  const value = response?.data && !Array.isArray(response.data) ? response.data : response;
  if (response?.status === false || value?.status === false || value?.success === false) {
    throw new Error(value?.message || "Broker request failed");
  }
  return value;
}

async function exitExternalBuy(trade) {
  const id = String(trade.orderid || "");
  const key = `${trade.exchange}:${trade.symboltoken}:${trade.producttype}`;
  if (!id || trade.order_source === "Traderobot" || trade.ordertag === "Traderobot" ||
      trade.trade_status !== "running" || attempts[id] || busy.has(key)) return;
  busy.add(key);
  updateTrade(id, { trade_status: "closing", external_buy_guard: "checking" });
  let submitting = false;
  try {
    const api = getSmartApi();
    const book = body(await api.getOrderBook());
    if (!Array.isArray(book?.data)) throw new Error("Cannot verify buy order source");
    const buy = book.data.find(order => String(order.orderid) === id);
    if (!buy || String(buy.transactiontype).toUpperCase() !== "BUY" ||
        String(buy.orderstatus || buy.status).trim().toLowerCase() !== "complete") {
      throw new Error("Buy execution not yet confirmed by broker");
    }
    // Recheck local attribution after the await: placeOrder may just have returned.
    if (buy.ordertag === "Traderobot" || trade.order_source === "Traderobot") {
      updateTrade(id, { trade_status: "running", order_source: "Traderobot", ordertag: "Traderobot", external_buy_guard: null });
      return;
    }
    const filled = Number(buy.filledshares || buy.quantity);
    const params = await prepareSell(api, {
      tradingsymbol: buy.tradingsymbol, symboltoken: buy.symboltoken,
      exchange: buy.exchange, producttype: buy.producttype,
      quantity: filled, transactiontype: "SELL", ordertype: "MARKET",
      variety: "NORMAL", duration: "DAY", ordertag: "Traderobot", price: 0,
    });
    // Do not silently unwind fewer units and call the protection successful.
    if (params.quantity !== filled) throw new Error("Cannot unwind full buy: broker quantity is reserved or has changed");
    record(id, { state: "submitting", quantity: filled, at: new Date().toISOString() });
    submitting = true;
    updateTrade(id, { external_buy_guard: "submitting" });
    const response = body(await api.placeOrder(params));
    const exitId = response?.data?.orderid || response?.orderid;
    if (!exitId) throw new Error("No exit order ID received; verify broker order book before retrying");
    record(id, { state: "submitted", orderid: exitId, quantity: filled });
    updateTrade(id, {
      external_buy_guard: "submitted", external_buy_guard_error: null,
      exit_order_id: exitId,
      currentOrder: [{ ...params, orderid: exitId, status: "pending", order_source: "Traderobot" }],
    });
  } catch (error) {
    updateTrade(id, {
      trade_status: submitting ? "closing" : "running",
      external_buy_guard: submitting ? "verify_required" : "error",
      external_buy_guard_error: error.message,
    });
    console.error(`External buy exit ${id}: ${error.message}`);
  } finally {
    busy.delete(key);
  }
}
module.exports = { exitExternalBuy };
