const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { badRequest, notFound } = require('../../lib/http');
const { getClaims, isAdmin } = require('../../lib/auth');

exports.handler = async (event) => {
  const claims = getClaims(event);
  if (!isAdmin(claims)) return badRequest('Only admin can delete orders');

  const id = event.pathParameters && event.pathParameters.id;
  if (!id) return badRequest('Order id is required');

  const result = await ddb.delete({
    TableName,
    Key: { [PrimaryKey]: id },
    ReturnValues: 'ALL_OLD'
  }).promise();

  if (!result.Attributes) return notFound('Order not found');
  return true;
};