const app = require("./src/app");
const dotenv = require("dotenv");
const totp = require("totp-generator")
const { autoLogin, loginSmartAPI } = require("./src/controllers/authorizationController");
const { autoSearch } = require("./src/controllers/searchController");

dotenv.config();

const PORT = process.env.PORT || 5050;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // ✅ Generate your TOTP
  const code = totp(process.env.ANGEL_ONE_TOTP_SECRET);
  console.log("Your current TOTP:", code);

  // ✅ Auto login when server starts
  await autoLogin();


});