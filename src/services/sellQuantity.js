// Validate exits against live broker inventory, including outstanding sell orders.
function rows(response, label) {
  const body = response?.data && !Array.isArray(response.data) ? response.data : response;
  if (response?.status === false || body?.status === false || body?.success === false || !Array.isArray(body?.data)) {
    throw new Error(body?.message || `Cannot verify broker ${label}`);
  }
  return body.data;
}

async function prepareSell(api, params) {
  const requested = Number(params.quantity);
  if (!Number.isInteger(requested) || requested <= 0) throw new Error('Sell quantity must be a positive integer');
  const positions = rows(await api.getPosition(), 'positions');
  const matches = positions.filter(position =>
    String(position.symboltoken) === String(params.symboltoken) &&
    position.exchange === params.exchange &&
    (!params.producttype || position.producttype === params.producttype));
  if (matches.length !== 1) throw new Error('Cannot identify a unique broker position for this sell');
  const position = matches[0];
  const net = Number(position.netqty);
  if (!Number.isInteger(net) || net <= 0) throw new Error('No open long quantity available at broker');
  const orders = rows(await api.getOrderBook(), 'orders');
  let reserved = 0;
  for (const order of orders) {
    if (String(order.symboltoken) !== String(params.symboltoken) || order.exchange !== params.exchange ||
        order.producttype !== position.producttype || String(order.transactiontype).toUpperCase() !== 'SELL' ||
        ['complete', 'cancelled', 'rejected'].includes(String(order.orderstatus || order.status).trim().toLowerCase())) continue;
    const outstanding = order.unfilledshares != null && order.unfilledshares !== ''
      ? Number(order.unfilledshares) : Number(order.quantity) - Number(order.filledshares || 0);
    if (!Number.isFinite(outstanding) || outstanding < 0) throw new Error('Cannot verify outstanding sell quantity');
    reserved += outstanding;
  }
  const quantity = Math.min(requested, net - reserved);
  if (quantity <= 0) throw new Error('Open sell orders already cover the available broker quantity');
  return { ...params, producttype: position.producttype, quantity };
}

module.exports = { prepareSell };
