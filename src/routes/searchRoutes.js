const express = require("express");
const router = express.Router();
const { searchSymbol } = require("../controllers/searchController");

router.get("/:query", searchSymbol);

module.exports = router;