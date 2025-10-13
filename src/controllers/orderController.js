const { getSmartApi } = require("./authorizationController");

exports.placeOrder = async (req, res) => {
  const { tradingsymbol, symboltoken, transactiontype, exchange, ordertype, producttype, price, quantity, variety, duration } = req.body;

  try {
    const smartApi = getSmartApi();

    const orderParams = {
      tradingsymbol,
      symboltoken,
      transactiontype,  // "BUY" or "SELL"
      exchange,
      ordertype,
      producttype,
      variety,
      duration,
      price,
      quantity
    };

    const response = await smartApi.placeOrder(orderParams);
    res.json({ success: true, data: response });
  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ success: false, error: err.message || err });
  }
};



// 🔹 Modify Existing Order
exports.modifyOrder = async (req, res) => {
  const {
    orderid,          // Required
    tradingsymbol,    // Optional, for safety
    symboltoken,      // Optional
    exchange,         // e.g., "NFO"
    ordertype,        // e.g., "LIMIT", "MARKET"
    producttype,      // e.g., "CNC", "MIS"
    duration,         // e.g., "DAY"
    price,            // New price if LIMIT
    quantity,         // New quantity
    triggerprice,     // Optional for SL orders
    variety           // e.g., "NORMAL", "STOPLOSS"
  } = req.body;

  try {
    const smartApi = getSmartApi();

    if (!orderid) {
      return res.status(400).json({
        success: false,
        message: "orderid is required to modify an order.",
      });
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

    res.json({
      success: true,
      message: "Order modified successfully",
      data: response,
    });
  } catch (err) {
    console.error("❌ Modify order error:", err.message || err);
    res.status(500).json({
      success: false,
      error: err.message || err,
    });
  }
};

// 🔹 Cancel Existing Order
exports.cancelOrder = async (req, res) => {
  const { orderid, variety } = req.body; // variety is optional (NORMAL/STOPLOSS)

  try {
    const smartApi = getSmartApi();

    if (!orderid) {
      return res.status(400).json({
        success: false,
        message: "orderid is required to cancel an order.",
      });
    }

    const cancelParams = {
      orderid,
      variety: variety || "NORMAL", // default variety
    };

    console.log("🛑 Cancelling order:", cancelParams);

    const response = await smartApi.cancelOrder(cancelParams);

    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: response,
    });
  } catch (err) {
    console.error("❌ Cancel order error:", err.message || err);
    res.status(500).json({
      success: false,
      error: err.message || err,
    });
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

    if (!tradingsymbol || !symboltoken || !quantity || !exchange) {
      return res.status(400).json({
        success: false,
        message: "tradingsymbol, symboltoken, exchange and quantity are required",
      });
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

    res.json({
      success: true,
      message: "Sell market order placed successfully",
      data: response,
    });
  } catch (err) {
    console.error("❌ Sell market error:", err.message || err);
    res.status(500).json({
      success: false,
      error: err.message || err,
    });
  }
};



// 🔹 Get All Orders
exports.getAllOrders = async (req, res) => {
  try {
    const smartApi = getSmartApi();

    console.log("📦 Fetching all orders...");

    const response = await smartApi.getOrderBook();

    res.json({
      success: true,
      count: response?.data?.length || 0,
      data: response.data,
    });
  } catch (err) {
    console.error("❌ Failed to fetch orders:", err.message || err);
    res.status(500).json({
      success: false,
      error: err.message || err,
    });
  }
};