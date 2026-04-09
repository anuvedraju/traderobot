// src/app.js
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authorizationRoutes");
const orderRoutes = require("./routes/orderRoutes");
const searchRoutes = require("./routes/searchRoutes");
const positionRoutes = require("./routes/positionRoutes");
const tradesRoutes = require("./routes/tradesRoutes");
const {
  requireFrontendApiKey,
} = require("./middleware/requireFrontendApiKey");

const app = express();

app.use(cors());
app.use(express.json());

// Register all routes
app.use("/api/auth", authRoutes);
app.use("/api/order", requireFrontendApiKey, orderRoutes);
app.use("/api/search", requireFrontendApiKey, searchRoutes);
app.use("/api/trades", requireFrontendApiKey, tradesRoutes);
app.use("/api/positions", requireFrontendApiKey, positionRoutes);

module.exports = app;
