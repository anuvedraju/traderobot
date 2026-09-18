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
    './services/angelFeed': { feedEmitter },
    './data/trades': { getActiveTrades: () => [trade], updateTrade: (_, data) => { update = data; } },
    './functions': { closeTrade() {} },
  });
  manager.initTradeManager();
  feedEmitter.emit('orderUpdate', { symboltoken: '123', orderid: 'exit1', transactiontype: 'SELL', status: 'cancelled' });
  assert.equal(update.currentOrder[0].status, 'cancelled');
  assert.equal(update.trade_status, undefined, 'cancelled exit must preserve running position');
  const emitted = [];
  class Server extends EventEmitter { emit(event, payload) { emitted.push([event, payload]); return true; } }
  const { initSocketServer } = load('src/services/socketServer.js', {
    'socket.io': { Server },
    '../services/angelFeed': { feedEmitter: new EventEmitter() },
    '../data/trades': { tradeEmitter },
    '../functions': {},
  });
  initSocketServer({});
  tradeEmitter.emit('tradeUpdated', { symboltoken: '123', trade_status: 'pending' });
  tradeEmitter.emit('tradeUpdated', { symboltoken: '123', trade_status: 'cancelled' });
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][1].trade_status, 'cancelled');
  tradeEmitter.emit('tradeUpdated', trade);
  tradeEmitter.emit('tradeDeleted', { symboltoken: '123' });
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(emitted.length, 2);
  assert.equal(emitted[1][0], 'tradeDeleted');
  console.log('PASS: exit cancellation persistence, final-event delivery, delete prevents resurrection');
})().catch(error => { console.error(error); process.exitCode = 1; });
