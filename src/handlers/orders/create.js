const { v4: uuid } = require('uuid');
const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { created, badRequest } = require('../../lib/http');
const { getClaims } = require('../../lib/auth');
const { validateOrderCreate } = require('../../validators/orders');

exports.handler = async (event) => {
  if (!event.body) return badRequest('Missing body');

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return badRequest('Invalid JSON body');
  }

  let sanitized;
  try {
    sanitized = await validateOrderCreate(payload);
  } catch (err) {
    return badRequest(err.message || 'Invalid order payload');
  }

  const claims = getClaims(event);
  const now = new Date().toISOString();

  const item = {
    [PrimaryKey]: uuid(),
    entity: 'ORDER',
    createdAt: now,
    ownerSub: claims.sub,
    ...sanitized
  };

  if (item.notes === undefined) {
    delete item.notes;
  }

  await ddb.put({ TableName, Item: item }).promise();
  return created(item);
};
