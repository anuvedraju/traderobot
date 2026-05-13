const { addTrade } = require("../data/trades");
const { getSmartApi } = require("./authorizationController");

const ALLOWED_STOP_LOSSES = [450, 800, 1500, 2000, 4000];
const DEFAULT_STOP_LOSS = 800;

function sendSuccess(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({ success: true, ...data });
}

function sendError(res, err, fallbackMessage, statusCode = 500) {
  const error = err?.message || err || fallbackMessage;
  console.error(fallbackMessage, error);
  return res.status(statusCode).json({ success: false, error });
}

function requireFields(res, body, fields) {
  const missing = fields.filter((field) => !body[field]);
  if (!missing.length) return false;

  res.status(400).json({
    success: false,
    error: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`,
  });
  return true;
}

function toOrderQuantity(quantity) {
  return Number(quantity) || quantity;
}

function parseStopLoss(stoploss) {
  if (stoploss === undefined || stoploss === null || stoploss === "") {
    return DEFAULT_STOP_LOSS;
  }

  const value = Number(stoploss);
  return ALLOWED_STOP_LOSSES.includes(value) ? value : null;
}

exports.placeOrder = async (req, res) => {
  const {
    tradingsymbol,
    symboltoken,
    transactiontype,
    exchange,
    ordertype,
    producttype,
    price,
    triggerprice,
    quantity,
    variety,
    duration,
    stoploss,
  } = req.body;

  try {
    if (
      requireFields(res, req.body, [
        "tradingsymbol",
        "symboltoken",
        "transactiontype",
        "exchange",
        "ordertype",
        "quantity",
      ])
    ) {
      return;
    }

    const smartApi = getSmartApi();
    const stopLossValue = parseStopLoss(stoploss);

    if (!stopLossValue) {
      return sendError(
        res,
        `stoploss must be one of ${ALLOWED_STOP_LOSSES.join(", ")}.`,
        "Order validation error:",
        400
      );
    }

    const orderParams = {
      tradingsymbol,
      symboltoken,
      transactiontype, // "BUY" or "SELL"
      exchange,
      ordertype,
      producttype,
      triggerprice,
      variety,
      duration,
      price,
      quantity: toOrderQuantity(quantity),
    };

    const response = await smartApi.placeOrder(orderParams);

    addTrade({
      tradingsymbol: orderParams.tradingsymbol,
      symboltoken: orderParams.symboltoken,
      exchange: orderParams.exchange,
      transactiontype: orderParams.transactiontype,
      orderid: response.data.orderid,
      producttype: orderParams.producttype,
      variety: orderParams.variety,
      duration: orderParams.duration,
      buy_price: orderParams.price,
      quantity: orderParams.quantity,
      stop_loss: stopLossValue,
      trail: "50%",
      trade_status: "pending",
    });

    return sendSuccess(res, { data: response });
  } catch (err) {
    return sendError(res, err, "Order error:");
  }
};

// 🔹 Modify Existing Order
exports.modifyOrder = async (req, res) => {
  const {
    orderid, // Required
    tradingsymbol, // Optional, for safety
    symboltoken, // Optional
    exchange, // e.g., "NFO"
    ordertype, // e.g., "LIMIT", "MARKET"
    producttype, // e.g., "CNC", "MIS"
    duration, // e.g., "DAY"
    price, // New price if LIMIT
    quantity, // New quantity
    triggerprice, // Optional for SL orders
    variety, // e.g., "NORMAL", "STOPLOSS"
  } = req.body;

  try {
    const smartApi = getSmartApi();

    if (!orderid) {
      return sendError(
        res,
        "orderid is required to modify an order.",
        "Modify order validation error:",
        400
      );
    }

    const modifyParams = {
      orderid,
      tradingsymbol,
      symboltoken,
      exchange,
      ordertype,
      producttype,
      duration,
      price,
      quantity,
      triggerprice,
      variety,
    };

    console.log("🔄 Modifying order:", modifyParams);

    const response = await smartApi.modifyOrder(modifyParams);

    return sendSuccess(res, {
      message: "Order modified successfully",
      data: response,
    });
  } catch (err) {
    return sendError(res, err, "Modify order error:");
  }
};

// 🔹 Cancel Existing Order
exports.cancelOrder = async (req, res) => {
  const { orderid, variety } = req.body; // variety is optional (NORMAL/STOPLOSS)

  try {
    const smartApi = getSmartApi();

    if (!orderid) {
      return sendError(
        res,
        "orderid is required to cancel an order.",
        "Cancel order validation error:",
        400
      );
    }

    const cancelParams = {
      orderid,
      variety: variety || "NORMAL", // default variety
    };

    console.log("🛑 Cancelling order:", cancelParams);

    const response = await smartApi.cancelOrder(cancelParams);

    return sendSuccess(res, {
      message: "Order cancelled successfully",
      data: response,
    });
  } catch (err) {
    return sendError(res, err, "Cancel order error:");
  }
};

// 🔹 Sell at Market Price (Instant)
exports.sellMarket = async (req, res) => {
  const {
    tradingsymbol,
    symboltoken,
    exchange,
    producttype,
    quantity,
    variety,
    duration,
  } = req.body;

  try {
    const smartApi = getSmartApi();

    if (
      requireFields(res, req.body, [
        "tradingsymbol",
        "symboltoken",
        "exchange",
        "quantity",
      ])
    ) {
      return;
    }

    const sellParams = {
      tradingsymbol,
      symboltoken,
      transactiontype: "SELL", // 🔹 Always SELL
      exchange,
      ordertype: "MARKET", // 🔹 Market Order
      producttype: producttype || "NRML",
      variety: variety || "NORMAL",
      duration: duration || "DAY",
      price: 0, // Market order ignores price
      quantity,
    };

    console.log("🔻 Selling at market:", sellParams);

    const response = await smartApi.placeOrder(sellParams);

    return sendSuccess(res, {
      message: "Sell market order placed successfully",
      data: response,
    });
  } catch (err) {
    return sendError(res, err, "Sell market error:");
  }
};

// 🔹 Get All Orders
exports.getAllOrders = async (req, res) => {
  try {
    const smartApi = getSmartApi();

    console.log("📦 Fetching all orders...");

    const response = await smartApi.getOrderBook();

    return sendSuccess(res, {
      count: response?.data?.length || 0,
      data: response?.data || [],
    });
  } catch (err) {
    return sendError(res, err, "Failed to fetch orders:");
  }
};
