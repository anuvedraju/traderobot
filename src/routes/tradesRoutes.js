// src/routes/tradesRoutes.js
const express = require("express");
const router = express.Router();
const { getTradeBookData } = require("../controllers/tradesController");

// GET all trades
router.get("/gettrades", getTradeBookData);

module.exports = router;