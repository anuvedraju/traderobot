const express = require("express");
const router = express.Router();
const {
  getFrontendAuthConfig,
  loginSmartAPI,
} = require("../controllers/authorizationController");
const {
  requireFrontendApiKey,
} = require("../middleware/requireFrontendApiKey");

router.get("/config", getFrontendAuthConfig);
router.post("/login", requireFrontendApiKey, loginSmartAPI);

module.exports = router;
