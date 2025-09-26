const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { ok, badRequest, notFound } = require('../../lib/http');
const { getClaims, isAdmin } = require('../../lib/auth');
const { validateProductUpdate } = require('../../validators/products');

exports.handler = async (event) => {
  if (!event.body) return badRequest('Missing body');
  const claims = getClaims(event);
  if (!isAdmin(claims)) return badRequest('Only admin can update products');

  const id = event.pathParameters && event.pathParameters.id;
  if (!id) return badRequest('Missing path parameter: id');

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return badRequest('Invalid JSON body');
  }

  const existing = await ddb.get({ TableName, Key: { [PrimaryKey]: id } }).promise();
  if (!existing.Item || existing.Item.entity !== 'PRODUCT') return notFound('Product not found');

  let updates;
  try {
    updates = await validateProductUpdate(payload, existing.Item);
  } catch (err) {
    return badRequest(err.message || 'Invalid product payload');
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
