const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: name => mocks[name] || require(name), console, setTimeout, clearTimeout });
  return module.exports;
}
(async () => {
  const feedEmitter = new EventEmitter();
  const tradeEmitter = new EventEmitter();
  const trade = { symboltoken: '123', trade_status: 'running', currentOrder: [{ orderid: 'exit1', status: 'open' }] };
  let update;
  const manager = load('src/tradeManager.js', {
    './services/externalBuyGuard': { async exitExternalBuy() {} },
    './services/angelFeed': { feedEmitter },
    './services/searchCooldown': { startSearchCooldown() {} },
    './data/trades': { getTrades: () => [trade], getActiveTrades: () => [trade], updateTrade: (_, data) => { update = data; } },
    './functions': { closeTrade() {} },
  });
  manager.initTradeManager();
  feedEmitter.emit('orderUpdate', { symboltoken: '123', orderid: 'exit1', transactiontype: 'SELL', status: 'cancelled' });
  assert.equal(update.currentOrder[0].status, 'cancelled');
  assert.equal(update.trade_status, undefined, 'cancelled exit must preserve running position');
  const emitted = [];
  const liveTrades = [];
  const subscriptions = [];
  class Server extends EventEmitter {
    sockets = { adapter: { rooms: new Map() } };
    emit(event, payload) { emitted.push([event, payload]); return true; } }
  const { initSocketServer } = load('src/services/socketServer.js', {
    'socket.io': { Server },
    '../services/angelFeed': { feedEmitter: new EventEmitter(), subscribeTokens(token) { subscriptions.push(["subscribe", token]); }, unsubscribeTokens(token) { subscriptions.push(["unsubscribe", token]); } },
    '../data/trades': { tradeEmitter, getTrades: () => liveTrades },
    '../functions': {},
  });
  initSocketServer({});
  tradeEmitter.emit('tradeUpdated', { symboltoken: '123', trade_status: 'pending' });
  tradeEmitter.emit('tradeUpdated', { symboltoken: '123', trade_status: 'cancelled' });
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][1].trade_status, 'cancelled');
  tradeEmitter.emit('tradeUpdated', { ...trade, trade_status: 'closed' });
  tradeEmitter.emit('tradeDeleted', { symboltoken: '123' });
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(emitted.length, 2);
  assert.equal(emitted[1][0], 'tradeDeleted');
  tradeEmitter.emit('tradeUpdated', { ...trade, orderid: 'entryA', quantity: 65 });
  tradeEmitter.emit('tradeUpdated', { ...trade, orderid: 'entryB', quantity: 130 });
  await new Promise(resolve => setTimeout(resolve, 120));
  const separate = emitted.slice(-2).map(([, payload]) => payload);
  assert.deepEqual(separate.map(item => item.orderid).sort(), ['entryA', 'entryB']);
  assert.equal(separate.find(item => item.orderid === 'entryA').quantity, 65);
  liveTrades.push({ symboltoken: '123', trade_status: 'running' });
  tradeEmitter.emit('tradeUpdated', { ...liveTrades[0], orderid: 'live' });
  assert.deepEqual(subscriptions.at(-1), ['subscribe', '123']);
  const before = subscriptions.length;
  tradeEmitter.emit('tradeUpdated', { symboltoken: '123', orderid: 'history', trade_status: 'closed' });
  assert.equal(subscriptions.length, before, 'closed history must preserve another live trade subscription');
  liveTrades[0].trade_status = 'cancelled';
  tradeEmitter.emit('tradeUpdated', liveTrades[0]);
  assert.deepEqual(subscriptions.at(-1), ['unsubscribe', '123']);
  console.log('PASS: exit cancellation persistence, final-event delivery, delete prevents resurrection');
})().catch(error => { console.error(error); process.exitCode = 1; });
