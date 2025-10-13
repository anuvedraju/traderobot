const express = require("express");
const router = express.Router();
const { loginSmartAPI } = require("../controllers/authorizationController");

router.post("/login", loginSmartAPI);

module.exports = router;