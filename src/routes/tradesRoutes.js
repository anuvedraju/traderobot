// src/routes/tradesRoutes.js
const express = require("express");
const router = express.Router();
const {
  getTradeBookData,
  deleteClosedTrades,
} = require("../controllers/tradesController");

// GET all trades
router.get("/gettrades", getTradeBookData);
router.delete("/closed/:symboltoken", deleteClosedTrades);

module.exports = router;
