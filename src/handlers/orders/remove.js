const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { noContent, badRequest } = require('../../lib/http');
const { getClaims, isAdmin } = require('../../lib/auth');

exports.handler = async (event) => {
  const claims = getClaims(event);
  if (!isAdmin(claims)) return badRequest('Only admin can delete orders');

  const id = event.pathParameters && event.pathParameters.id;
  await ddb.delete({ TableName, Key: { [PrimaryKey]: id } }).promise();
  return noContent();
};
