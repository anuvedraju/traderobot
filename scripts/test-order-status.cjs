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

  const manager = load('src/tradeManager.js', {
    './services/angelFeed': { feedEmitter }, './data/trades': store,
    './functions': { closeTrade() { throw Error('Reconciliation must not place orders'); } },
    './services/searchCooldown': {},
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
  console.log('PASS: status delivery, order identity, reconciliation, concurrent fetch, and closed-position protection');
})().catch(error => { console.error(error); process.exitCode = 1; });
