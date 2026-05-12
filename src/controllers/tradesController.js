// src/controllers/tradesController.js
const { getTrades, deleteClosedTradesBySymbolToken } = require("../data/trades");

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

exports.deleteClosedTrades = (req, res) => {
  try {
    const { symboltoken } = req.params;

    if (!symboltoken) {
      return res.status(400).json({
        success: false,
        error: "symboltoken is required",
      });
    }

    const result = deleteClosedTradesBySymbolToken(symboltoken);

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: `No trade found for symboltoken ${symboltoken}`,
      });
    }

    if (!result.deleted) {
      return res.status(409).json({
        success: false,
        error: `Trade ${symboltoken} is not closed`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Closed trade deleted",
      deleted: result.deleted,
      symboltoken: symboltoken.toString(),
    });
  } catch (err) {
    console.error("❌ deleteClosedTrades error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Internal Server Error",
    });
  }
};
