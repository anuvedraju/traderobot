const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function load(file, mocks) {
  const filename = path.join(__dirname, '..', file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename),
    console: { log() {}, warn() {}, error(message) { throw new Error(message); } },
    setTimeout() { return 1; }, clearTimeout() {},
    require: name => mocks[name] || require(name),
  }, { filename });
  return module.exports;
}

function scenario(takeProfit, exchange = 'NFO') {
  const feedEmitter = new EventEmitter();
  const store = load('src/data/trades.js', {
    '../services/angelFeed': { subscribeTokens() {} },
    fs: { writeFileSync() {} },
  });
  const trade = store.addTrade({
    symboltoken: '123', tradingsymbol: 'TEST', transactiontype: 'BUY',
    orderid: 'entry', buy_price: 100, quantity: 10,
    trade_status: 'running', take_profit: takeProfit, exchange,
  });
  const closes = [];
  load('src/tradeManager.js', {
    './services/angelFeed': { feedEmitter }, './data/trades': store,
    './functions': { closeTrade: token => closes.push(token) },
    './services/searchCooldown': { startSearchCooldown() {} },
  }).initTradeManager();
  return { trade, closes, tick: price => feedEmitter.emit('tick', { token: '123', ltp: price * 100 }) };
}

const exact = scenario(500);
exact.tick(149.99);
assert.equal(exact.closes.length, 0, 'below target must remain open');
exact.tick(150);
assert.equal(exact.trade.profit_loss, 500);
assert.equal(exact.trade.trade_status, 'closing');
assert.deepEqual(exact.closes, ['123'], 'equal target must request a market close');
exact.tick(151);
assert.equal(exact.closes.length, 1, 'further ticks must not duplicate the close');

const jump = scenario('500');
jump.tick(160);
assert.equal(jump.closes.length, 1, 'jump above a string target must close');

for (const value of [null, '', undefined, 'invalid']) {
  const disabled = scenario(value);
  disabled.tick(160);
  assert.equal(disabled.closes.length, 0, 'unset or invalid targets must not close');
}

const zero = scenario(0);
zero.tick(100);
assert.equal(zero.closes.length, 1, 'explicit zero must not be treated as unset');

const bfo = scenario(null, 'BFO');
bfo.tick(290);
assert.equal(bfo.trade.take_profit, 1500, 'BFO branch must update the correct token');
bfo.tick(290);
assert.equal(bfo.closes.length, 1);

console.log('PASS: take-profit equality, overshoot, quantity-based PnL, disabled targets, duplicate prevention, and BFO branch');
