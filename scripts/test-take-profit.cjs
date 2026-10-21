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

// Manual take_profit is a pullback floor, not an upward target.
for (const value of [500, '500', 0]) {
  const position = scenario(value, 'NSE');
  position.tick(100);
  position.tick(100 + Number(value) / 10);
  assert.equal(position.closes.length, 0, 'must first exceed the floor');
  position.tick(160);
  assert.equal(position.closes.length, 0, 'rising through floor must stay open');
  position.tick(100 + Number(value) / 10);
  assert.equal(position.closes.length, 1, 'return to floor must close');
  position.tick(100);
  assert.equal(position.closes.length, 1, 'subsequent ticks must not duplicate exit');
}

for (const value of [null, '', undefined, 'invalid']) {
  const position = scenario(value, 'NSE');
  position.tick(160);
  position.tick(140);
  assert.equal(position.closes.length, 0, 'unset floor must not exit');
}

for (const exchange of ['BFO', 'NFO']) {
  for (const pullback of [250, 240]) {
    const position = scenario(null, exchange);
    if (exchange === 'BFO') {
      position.tick(280);
      assert.equal(position.trade.take_profit, null, 'exactly 1800 must not activate BFO floor');
    }
    position.tick(290);
    assert.equal(position.trade.take_profit, 1500, 'exchange rule must set take_profit');
    assert.equal(position.trade.profit_floor, undefined, 'no separate profit_floor field');
    position.tick(310);
    position.tick(260);
    assert.equal(position.closes.length, 0, 'profit above floor must remain open');
    position.tick(pullback);
    assert.equal(position.closes.length, 1, 'pullback to or below floor must close');
    assert.equal(position.trade.trade_status, 'closing');
    position.tick(240);
    assert.equal(position.closes.length, 1, 'must not duplicate exit');
  }
}

console.log('PASS: take_profit pullback activation, equality, gap below floor, disabled values, NFO/BFO rules, and duplicate prevention');
