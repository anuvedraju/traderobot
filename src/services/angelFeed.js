const { WebSocketV2 } = require("smartapi-javascript");
const EventEmitter = require("events");

const feedEmitter = new EventEmitter();
let web_socket = null;

async function startAngelFeed({ jwtToken, feedToken }) {
  try {
    const apiKey = process.env.ANGEL_ONE_API_KEY;
    const clientCode = process.env.ANGEL_ONE_USERNAME;

    if (!jwtToken || !feedToken) {
      throw new Error("Missing tokens — please login first.");
    }

    console.log("🔗 Connecting to Angel One WebSocket V2...");

    // ✅ Create WebSocketV2 instance
    web_socket = new WebSocketV2({
      jwttoken: jwtToken,
      apikey: apiKey,
      clientcode: clientCode,
      feedtype: feedToken, // Angel One’s V2 feed token (type: 'feedToken')
    });

    // ✅ Connect to WebSocket server
    await web_socket.connect();

    console.log("📡 Connected to Angel One WebSocket V2 ✅");

    // Example subscription request (as per docs)
    const subReq = {
      correlationID: "sub_001",
      action: 1, // 1 = subscribe
      mode: 1,   // 1 = LTP (or use 2 for Quote, 3 for Depth)
      exchangeType: 4, // 1 = NSE_CM, 2 = NFO, 3 = CDS,4=BFO, 5 = MCX
      tokens: ["877897"], // Replace with your symboltoken ------divide by /100
    }; 

    // Send subscription
    web_socket.fetchData(subReq);
    console.log("📩 Subscribed to:", subReq.tokens);

    // ✅ Handle incoming ticks
    web_socket.on("tick", (data) => {
      feedEmitter.emit("tick", data);
      console.log("💹 Tick:", data);
    });

    // ✅ Handle errors
    web_socket.on("error", (err) => {
      console.error("❌ WebSocket error:", err.message || err);
    });
    
    web_socket.on("close", () => {
      console.log("🔌 WebSocket closed. Reconnecting in 15s...");
      setTimeout(() => startAngelFeed({ jwtToken, feedToken }), 15000);
    });

  } catch (err) {
    console.error("❌ Failed to connect Angel Feed:", err.message);
  }
}

function subscribe(token) {
  if (!web_socket) return console.warn("⚠️ WebSocket not connected.");
  const msg = {
    correlationID: `sub_${token}`,
    action: 1, // subscribe
    mode: 1, // LTP
    exchangeType: 2, // NFO
    tokens: [token],
  };
  web_socket.fetchData(msg);
  console.log("✅ Subscribed dynamically:", token);
}

function unsubscribe(token) {
  if (!web_socket) return console.warn("⚠️ WebSocket not connected.");
  const msg = {
    correlationID: `unsub_${token}`,
    action: 0, // unsubscribe
    mode: 1,
    exchangeType: 2,
    tokens: [token],
  };
  web_socket.fetchData(msg);
  console.log("🛑 Unsubscribed:", token);
}

module.exports = { startAngelFeed, feedEmitter, subscribe, unsubscribe };