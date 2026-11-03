const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const requests = [];
const sockets = [];
class Market {
  constructor() { sockets.push(this); this.handlers = {}; }
  reconnection(type) { assert.equal(type, 'simple'); }
  async connect() {}
  on(event, callback) { this.handlers[event] = callback; }
  fetchData(request) { requests.push(request); }
}
class Order extends EventEmitter { terminate() {} }
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync('src/services/angelFeed.js', 'utf8'), {
  module: moduleStub, exports: moduleStub.exports, console, process,
  setInterval, clearInterval, setTimeout, clearTimeout,
  require: name => name === 'smartapi-javascript' ? { WebSocketV2: Market } : name === 'ws' ? Order : name === 'dotenv' ? { config() {} } : require(name),
});
(async () => {
  const feed = moduleStub.exports;
  feed.subscribeTokens(['active', 'cancelled'], 'NFO');
  feed.unsubscribeTokens('cancelled', 'NFO');
  await feed.initAngelFeed({ jwtToken: 'test', feedToken: 'test' });
  assert.equal(requests.length, 1);
  assert.deepEqual(Array.from(requests[0].tokens), ['active']);
  sockets[0].handlers.close();
  feed.unsubscribeTokens('active', 'NFO');
  feed.subscribeTokens('new', 'NSE');
  await feed.initAngelFeed({ jwtToken: 'test', feedToken: 'test' });
  assert.deepEqual(Array.from(requests.at(-1).tokens), ['new']);
  assert.equal(requests.at(-1).exchangeType, 1);
  console.log('PASS: offline cancellation and reconnect restore only desired subscriptions');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
