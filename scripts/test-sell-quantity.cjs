const assert = require('node:assert/strict');
const { prepareSell } = require('../src/services/sellQuantity');
(async () => {
  const params = { symboltoken: '123', exchange: 'NFO', producttype: 'INTRADAY', quantity: 150 };
  let positions = [{ ...params, netqty: '75' }];
  let orders = [];
  const api = {
    getPosition: async () => ({ status: true, data: positions }),
    getOrderBook: async () => ({ status: true, data: orders }),
  };
  assert.equal((await prepareSell(api, params)).quantity, 75, 'stale local quantity must be capped at broker inventory');
  orders = [{ ...params, transactiontype: 'SELL', orderstatus: 'open', quantity: '50', filledshares: '25', unfilledshares: '25' }];
  assert.equal((await prepareSell(api, params)).quantity, 50, 'remaining pending sell units must be reserved');
  orders[0].unfilledshares = '75';
  await assert.rejects(prepareSell(api, params), /already cover/);
  orders[0].orderstatus = 'cancelled';
  assert.equal((await prepareSell(api, params)).quantity, 75);
  assert.equal((await prepareSell(api, { ...params, quantity: 25 })).quantity, 25, 'intentional smaller exits must stay smaller');
  positions[0].netqty = '0';
  await assert.rejects(prepareSell(api, params), /No open long/);
  positions[0].netqty = '75';
  await assert.rejects(prepareSell(api, { ...params, producttype: 'CARRYFORWARD' }), /unique broker position/);
  const inferred = await prepareSell(api, { ...params, producttype: undefined });
  assert.equal(inferred.producttype, 'INTRADAY');
  await assert.rejects(prepareSell({ ...api, getPosition: async () => ({ status: false, data: [] }) }, params), /Cannot verify/);
  console.log('PASS: broker inventory, pending sells, product matching, partial exits, and failed broker reads');
})().catch(error => { console.error(error); process.exitCode = 1; });
