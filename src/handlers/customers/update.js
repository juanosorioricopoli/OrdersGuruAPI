const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { ok, badRequest, notFound } = require('../../lib/http');
const { getClaims, isAdmin } = require('../../lib/auth');
const { validateCustomerUpdate } = require('../../validators/customers');

exports.handler = async (event) => {
  if (!event.body) return badRequest('Missing body');

  const id = event.pathParameters && event.pathParameters.id;
  if (!id) return badRequest('Missing path parameter: id');

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return badRequest('Invalid JSON body');
  }

  const existing = await ddb.get({ TableName, Key: { [PrimaryKey]: id } }).promise();
  if (!existing.Item || existing.Item.entity !== 'CUSTOMER') return notFound('Customer not found');

  const claims = getClaims(event);
  const isOwner = existing.Item.ownerSub && existing.Item.ownerSub === claims.sub;
  if (!isOwner && !isAdmin(claims)) return badRequest('Not allowed to update this customer');

  let updates;
  try {
    updates = await validateCustomerUpdate(payload, existing.Item);
  } catch (err) {
    return badRequest(err.message || 'Invalid customer payload');
  }

  const keys = Object.keys(updates);
  const names = {};
  const values = {};
  keys.forEach((key) => {
    names['#' + key] = key;
    values[':' + key] = updates[key];
  });

  const res = await ddb.update({
    TableName,
    Key: { [PrimaryKey]: id },
    UpdateExpression: 'SET ' + keys.map((key) => `#${key} = :${key}`).join(', '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW'
  }).promise();

  return ok(res.Attributes);
};
