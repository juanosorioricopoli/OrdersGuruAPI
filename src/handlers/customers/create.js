const { v4: uuid } = require('uuid');
const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { created, badRequest } = require('../../lib/http');
const { getClaims } = require('../../lib/auth');
const { validateCustomerCreate } = require('../../validators/customers');

exports.handler = async (event) => {
  if (!event.body) return badRequest('Missing body');

  const claims = getClaims(event);

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return badRequest('Invalid JSON body');
  }

  let sanitized;
  try {
    sanitized = await validateCustomerCreate(payload);
  } catch (err) {
    return badRequest(err.message || 'Invalid customer payload');
  }

  const now = new Date().toISOString();
  const item = {
    ...payload,
    ...sanitized,
    [PrimaryKey]: uuid(),
    entity: 'CUSTOMER',
    createdAt: now,
    ownerSub: claims.sub || null
  };

  if (item.phone === null) delete item.phone;
  if (item.address === null) delete item.address;

  await ddb.put({ TableName, Item: item }).promise();
  return created(item);
};
