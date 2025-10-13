const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authorizationRoutes");
const orderRoutes = require("./routes/orderRoutes");
const searchRoutes = require("./routes/searchRoutes");
const positionRoutes = require("./routes/positionRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/positions", positionRoutes);

module.exports = app;