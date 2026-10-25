const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function load(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, __dirname: process.cwd() + '/src/data',
    console: { log() {}, warn() {}, error(message) { throw new Error(message); } },
    setTimeout() { return 1; }, clearTimeout() {},
    require: name => mocks[name] || require(name),
  });
  return module.exports;
}

(async () => {
  const feedEmitter = new EventEmitter();
  const store = load('src/data/trades.js', {
    '../services/angelFeed': { subscribeTokens() {} },
    fs: { writeFileSync() {} },
  });
  store.addTrade({ symboltoken: '123', tradingsymbol: 'TEST', transactiontype: 'BUY', orderid: 'entry1' });
  store.addTrade({ symboltoken: '123', tradingsymbol: 'TEST', transactiontype: 'BUY', orderid: 'entry2' });
  const events = [];
  store.tradeEmitter.on('tradeUpdated', trade => events.push({ ...trade }));
  store.updatePnL('123', 100);
  store.updateTrade('entry2', { trade_status: 'rejected' });
  assert.equal(events.at(-1).trade_status, 'rejected', 'tick must not suppress status updates');
  assert.equal(store.getTrades()[0].trade_status, 'pending', 'order ID must select the right trade');

  const closes = [];
  const manager = load('src/tradeManager.js', {
    './services/angelFeed': { feedEmitter }, './data/trades': store,
    './functions': { closeTrade(token) { closes.push(token); } },
    './services/searchCooldown': { startSearchCooldown() {} },
  });
  manager.initTradeManager();
  let calls = 0;
  const reconciliation = load('src/services/orderReconciliation.js', {
    '../controllers/authorizationController': { getSmartApi: () => ({ async getOrderBook() {
      calls++;
      return { status: true, data: [{ orderid: 'entry1', symboltoken: '123', transactiontype: 'BUY', orderstatus: 'complete', averageprice: 100, quantity: 3 }] };
    } }) },
    '../data/trades': store, './angelFeed': { feedEmitter },
  });
  await Promise.all([reconciliation.reconcileOrders(), reconciliation.reconcileOrders()]);
  assert.equal(calls, 1, 'concurrent requests must share the broker fetch');
  assert.equal(store.getTrades()[0].trade_status, 'running');
  assert.equal(store.getTrades()[1].trade_status, 'rejected');
  store.updateTrade('entry1', { trade_status: 'closed' });
  await reconciliation.reconcileOrders();
  assert.equal(store.getTrades()[0].trade_status, 'closed', 'old completed entries must not reopen closed positions');
  feedEmitter.emit('orderUpdate', { orderid: 'unrelated', symboltoken: '123', transactiontype: 'BUY', status: 'pending' });
  assert.equal(store.getTrades()[0].trade_status, 'closed');
  const external = { orderid: 'angel-app', symboltoken: '456', tradingsymbol: 'EXTERNAL', exchange: 'NFO', transactiontype: 'buy', status: ' OPEN ', quantity: '10', price: '500' };
  feedEmitter.emit('orderUpdate', external);
  const imported = store.getTrades().find(trade => trade.orderid === 'angel-app');
  assert.equal(imported.trade_status, 'open');
  assert.equal(imported.stop_loss, 2000);
  feedEmitter.emit('orderUpdate', { ...external, orderstatus: 'complete', averageprice: '501' });
  assert.equal(imported.trade_status, 'running');
  assert.equal(Number(imported.buy_price), 501);
  feedEmitter.emit('orderUpdate', external);
  store.addTrade({ ...external, transactiontype: 'BUY' });
  assert.equal(store.getTrades().filter(trade => trade.orderid === 'angel-app').length, 1);
  assert.equal(imported.trade_status, 'running');
  store.updateTrade('angel-app', { trade_status: 'closed' });
  feedEmitter.emit('orderUpdate', { ...external, status: 'complete' });
  assert.equal(imported.trade_status, 'closed');
  feedEmitter.emit('orderUpdate', { ...external, orderid: 'direct-fill', status: 'complete', averageprice: '502' });
  const filled = store.getTrades().find(trade => trade.orderid === 'direct-fill');
  assert.equal(filled.trade_status, 'running');
  assert.equal(filled.stop_loss, 2000);
  feedEmitter.emit('orderUpdate', { ...external, orderid: 'sell-only', transactiontype: 'SELL' });
  assert.equal(store.getTrades().some(trade => trade.orderid === 'sell-only'), false);
  assert.equal(closes.length, 0, 'order updates must not place exits');
  feedEmitter.emit('tick', { token: '456', ltp: 30300 });
  assert.equal(closes.length, 0, 'loss below 2000 must remain open');
  feedEmitter.emit('tick', { token: '456', ltp: 30200 });
  assert.equal(closes.length, 1, '2000 total position loss must submit an exit');
  feedEmitter.emit('tick', { token: '456', ltp: 30100 });
  assert.equal(closes.length, 1, 'subsequent ticks must not duplicate the exit');
  console.log('PASS: status delivery, order identity, reconciliation, concurrent fetch, and closed-position protection');
})().catch(error => { console.error(error); process.exitCode = 1; });
