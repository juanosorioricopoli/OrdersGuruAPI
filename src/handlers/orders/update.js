const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { ok, badRequest, notFound } = require('../../lib/http');
const { getClaims, isAdmin } = require('../../lib/auth');
const { validateOrderUpdate } = require('../../validators/orders');

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

  const claims = getClaims(event);

  const existing = await ddb.get({ TableName, Key: { [PrimaryKey]: id } }).promise();
  if (!existing.Item) return notFound('Order not found');

  if (!isAdmin(claims) && existing.Item.ownerSub !== claims.sub) {
    return badRequest('You are not allowed to update this order');
  }

  let updates;
  try {
    updates = await validateOrderUpdate(payload);
  } catch (err) {
    return badRequest(err.message || 'Invalid order payload');
  }

  const keys = Object.keys(updates);
  const exprAttrNames = {};
  const exprAttrValues = {};
  keys.forEach((key) => {
    exprAttrNames['#' + key] = key;
    exprAttrValues[':' + key] = updates[key];
  });

  const res = await ddb.update({
    TableName,
    Key: { [PrimaryKey]: id },
    UpdateExpression: 'SET ' + keys.map((key) => `#${key} = :${key}`).join(', '),
    ExpressionAttributeNames: exprAttrNames,
    ExpressionAttributeValues: exprAttrValues,
    ReturnValues: 'ALL_NEW'
  }).promise();

  return ok(res.Attributes);
};
