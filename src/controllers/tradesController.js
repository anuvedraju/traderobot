// src/controllers/tradesController.js
const { getTrades } = require("../data/trades");

exports.getTradeBookData = (req, res) => {
  try {
    const response = getTrades(); // no need for await
    res.status(200).json({
      success: true,
      count: response.length,
      data: response,
    });
  } catch (err) {
    console.error("❌ getTradeBookData error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Internal Server Error",
    });
  }
};