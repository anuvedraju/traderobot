const { getSmartApi } = require("./authorizationController");

exports.getPositions = async (req, res) => {
  try {
    const smartApi = getSmartApi();
    const response = await smartApi.getPositions();
    res.json({ success: true, data: response });
  } catch (err) {
    console.error("Positions error:", err);
    res.status(500).json({ success: false, error: err.message || err });
  }
};