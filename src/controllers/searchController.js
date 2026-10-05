const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { getSearchCooldownRemainingMs } = require("../services/searchCooldown");

const CACHE_PATH = path.join(__dirname, "../data/scripmaster.json");
let cachedData = null; // in-memory cache

// ✅ Load and cache the scrip master (once per 24 hrs)
async function loadScripMaster() {
  try {
    if (cachedData) return cachedData;

    if (fs.existsSync(CACHE_PATH)) {
      const ageHrs = (Date.now() - fs.statSync(CACHE_PATH).mtimeMs) / 36e5;
      if (ageHrs < 24) {
        console.log("📦 Using cached ScripMaster");
        cachedData = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
        return cachedData;
      }
    }

    console.log("⬇️ Downloading ScripMaster JSON...");
    const { data } = await axios.get(
      "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
    );

    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data));
    cachedData = data;
    console.log("✅ Cached ScripMaster successfully!");
    return data;
  } catch (err) {
    console.error("❌ Failed to load ScripMaster:", err.message);
    throw err;
  }
}

// ✅ Parse expiry formats (e.g., 30OCT2025 → Date)
function parseExpiry(expiry) {
  if (!expiry) return new Date("9999-12-31");
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return new Date(expiry);

  const match = expiry.match(/^(\d{1,2})([A-Z]{3})(\d{2,4})$/);
  if (match) {
    const [, day, mon, yr] = match;
    const months = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
    };
    const fullYear = yr.length === 2 ? "20" + yr : yr;
    return new Date(fullYear, months[mon], parseInt(day));
  }
  return new Date("9999-12-31");
}

// ✅ Smart orderless search (any order: PFC 400 CE)
exports.searchSymbol = async (req, res) => {
  try {
    const remainingMs = getSearchCooldownRemainingMs();
    if (remainingMs > 0) {
      const retryAfterSeconds = Math.ceil(remainingMs / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: "Search is disabled for 5 minutes after a stop-loss is hit.",
        retryAfterSeconds,
      });
    }

    const query = req.params.query?.toUpperCase().trim();
    if (!query)
      return res.status(400).json({ success: false, message: "Query required" });

    console.time("⏱ Search Time");
    const master = await loadScripMaster();

    const tokens = query.split(/\s+/).filter(Boolean); // split by space
    if (!tokens.length)
      return res.status(400).json({ success: false, message: "Invalid query" });

    // 🔥 FAST SEARCH: pre-lowercase combined field once
    const results = [];
    for (const s of master) {
      const combined = [
        s.symbol,
        s.tradingsymbol,
        s.name,
        s.exch_seg,
        s.strike*100,
        (s.symbol || "").slice(-2) // for CE/PE
      ]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();

      // Check all tokens (orderless match)
      let match = true;
      for (const token of tokens) {
        if (!combined.includes(token)) {
          match = false;
          break;
        }
      }

      if (match) results.push(s);
    }

    console.timeEnd("⏱ Search Time");

    if (!results.length)
      return res
        .status(404)
        .json({ success: false, message: "No matching instruments" });

    // 🧠 Sort by nearest expiry first
    results.sort((a, b) => parseExpiry(a.expiry) - parseExpiry(b.expiry));

    // Simplify output for frontend
    const simplified = results.slice(0, 25).map((r) => ({
      tradingsymbol: r.tradingsymbol,
      name: `${r.name} ${r.strike/100} ${r.symbol.slice(-2)}`,
      symbol: r.symbol,
      lotsize:r.lotsize,
      token:r.token,
      strike: r.strike/100,
      expiry: r.expiry,
      optiontype: r.optiontype,
      exchange: r.exch_seg,
      instrumenttype: r.instrumenttype,
    }));

    console.log(`✅ ${simplified.length} results for "${query}"`);
    res.json({
      success: true,
      count: simplified.length,
      data: simplified,
    });
  } catch (err) {
    console.error("❌ Search failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
