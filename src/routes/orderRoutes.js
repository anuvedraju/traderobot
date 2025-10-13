const express = require("express");
const router = express.Router();
const { placeOrder, modifyOrder, cancelOrder, sellMarket, getAllOrders } = require("../controllers/orderController");

router.post("/place", placeOrder);
router.post("/modify",modifyOrder)
router.post("/cancel", cancelOrder);
router.post("/sellmarket", sellMarket); // 🔹 New route
router.get("/book", getAllOrders); // 🆕 New route

module.exports = router;