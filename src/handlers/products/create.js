const { v4: uuid } = require('uuid');
const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { created, badRequest } = require('../../lib/http');
const { getClaims, isAdmin } = require('../../lib/auth');
const { validateProductCreate } = require('../../validators/products');

exports.handler = async (event) => {
  if (!event.body) return badRequest('Missing body');
  const claims = getClaims(event);
  if (!isAdmin(claims)) return badRequest('Only admin can create products');

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return badRequest('Invalid JSON body');
  }

  let sanitized;
  try {
    sanitized = await validateProductCreate(payload);
  } catch (err) {
    return badRequest(err.message || 'Invalid product payload');
  }

  const now = new Date().toISOString();
  const item = {
    ...payload,
    ...sanitized,
    [PrimaryKey]: uuid(),
    entity: 'PRODUCT',
    createdAt: now,
    ownerSub: claims.sub || null
  };

  if (item.description === null) {
    delete item.description;
  }

  await ddb.put({ TableName, Item: item }).promise();
  return created(item);
};
