const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup({ tag = '', fail = false, available = 10, journal = {} } = {}) {
  const trade = { orderid: 'buy1', symboltoken: '123', exchange: 'NFO', producttype: 'INTRADAY', trade_status: 'running', quantity: 10, order_source: 'angelone' };
  const calls = [];
  let saved = JSON.stringify(journal);
  const api = {
    async getOrderBook() { return { status: true, data: [{ ...trade, tradingsymbol: 'TEST', transactiontype: 'BUY', orderstatus: 'complete', quantity: '10', ordertag: tag }] }; },
    async placeOrder(params) { calls.push(params); if (fail) throw new Error('connection lost'); return { status: true, data: { orderid: 'exit1' } }; },
  };
  const mocks = {
    fs: { existsSync: () => true, readFileSync: () => saved, writeFileSync: (_, data) => { saved = data; }, renameSync() {} },
    '../controllers/authorizationController': { getSmartApi: () => api },
    '../data/trades': { updateTrade: (_, updates) => Object.assign(trade, updates) },
    './sellQuantity': { prepareSell: async (_, params) => ({ ...params, quantity: available }) },
  };
  const module = { exports: {} };
  const load = () => {
    vm.runInNewContext(fs.readFileSync('src/services/externalBuyGuard.js', 'utf8'), { module, __dirname: '/tmp', require: name => mocks[name] || require(name), console: { error() {} } });
    return module.exports;
  };
  return { trade, calls, api, load, guard: load(), journal: () => JSON.parse(saved) };
}
(async () => {
  let s = setup();
  await Promise.all([s.guard.exitExternalBuy(s.trade), s.guard.exitExternalBuy(s.trade)]);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].transactiontype, 'SELL');
  assert.equal(s.calls[0].ordertype, 'MARKET');
  assert.equal(s.calls[0].ordertag, 'Traderobot');
  assert.equal(s.trade.trade_status, 'closing');
  s.trade.trade_status = 'running';
  await s.load().exitExternalBuy(s.trade);
  assert.equal(s.calls.length, 1, 'restart must not duplicate submission');
  s = setup({ tag: 'Traderobot' });
  await s.guard.exitExternalBuy(s.trade);
  assert.equal(s.calls.length, 0, 'broker tag must protect locally misclassified app buys');
  assert.equal(s.trade.order_source, 'Traderobot');
  s = setup(); s.trade.order_source = 'Traderobot';
  await s.guard.exitExternalBuy(s.trade); assert.equal(s.calls.length, 0);
  s = setup({ fail: true });
  await s.guard.exitExternalBuy(s.trade);
  assert.equal(s.trade.external_buy_guard, 'verify_required');
  s.trade.trade_status = 'running'; await s.guard.exitExternalBuy(s.trade);
  assert.equal(s.calls.length, 1, 'ambiguous network failure must not submit twice');
  s = setup({ available: 5 }); await s.guard.exitExternalBuy(s.trade);
  assert.equal(s.calls.length, 0, 'must not claim success for incomplete unwind');
  assert.equal(s.trade.external_buy_guard, 'error');
  s = setup(); s.api.getOrderBook = async () => ({ status: false });
  await s.guard.exitExternalBuy(s.trade); assert.equal(s.calls.length, 0, 'failed source verification must not sell');
  console.log('PASS: external buy market exit, Traderobot exemption, duplicate and restart protection, uncertain response, and live quantity checks');
})().catch(error => { console.error(error); process.exitCode = 1; });
