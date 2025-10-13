// src/modules/smartSocket.js
const WebSocket = require("ws");
const EventEmitter = require("events");

class SmartSocket extends EventEmitter {
  constructor({ authToken, feedToken, clientCode }) {
    super();
    this.ws = null;
    this.authToken = authToken;
    this.feedToken = feedToken;
    this.clientCode = clientCode;
    this.subscribedTokens = new Set();
  }

  start() {
    const wsUrl = `wss://smartapisocket.angelone.in/smart-stream`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      console.log("✅ Connected to Angel One WebSocket feed");
      this.authenticate();
    });

    this.ws.on("message", (msg) => {
      const data = JSON.parse(msg.toString());
      if (data && data.tk && data.lp) {
        // Example tick: { tk: "3045", lp: "197.5", ... }
        this.emit("ltp", { token: data.tk, ltp: parseFloat(data.lp) });
      }
      if (data && data.event === "order") {
        this.emit("order", data);
      }
    });

    this.ws.on("close", () => {
      console.log("⚠️ Smart feed disconnected — reconnecting...");
      setTimeout(() => this.start(), 2000);
    });

    this.ws.on("error", (err) => {
      console.error("❌ Smart feed error:", err.message);
    });
  }

  authenticate() {
    const payload = {
      action: 1,
      key: this.feedToken,
      user: this.clientCode,
      token: this.authToken,
      task: "cn",
    };
    this.ws.send(JSON.stringify(payload));
  }

  subscribe(token) {
    if (!this.subscribedTokens.has(token)) {
      this.subscribedTokens.add(token);
      const subPayload = {
        action: 1,
        key: this.feedToken,
        user: this.clientCode,
        token: `nse_cm|${token}`,
        task: "mw", // "mw" = Market Watch mode
      };
      this.ws.send(JSON.stringify(subPayload));
      console.log(`📡 Subscribed to token ${token}`);
    }
  }

  unsubscribe(token) {
    if (this.subscribedTokens.has(token)) {
      this.subscribedTokens.delete(token);
      const unsubPayload = {
        action: 0,
        key: this.feedToken,
        user: this.clientCode,
        token: `nse_cm|${token}`,
        task: "mw",
      };
      this.ws.send(JSON.stringify(unsubPayload));
      console.log(`❌ Unsubscribed from token ${token}`);
    }
  }
}

module.exports = SmartSocket;
