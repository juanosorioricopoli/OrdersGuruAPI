const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { ok, badRequest, notFound } = require('../../lib/http');
const { getClaims, isAdmin } = require('../../lib/auth');

exports.handler = async (event) => {
  const claims = getClaims(event);
  if (!isAdmin(claims)) return badRequest('Only admin can delete customers');

  const id = event.pathParameters && event.pathParameters.id;
  const res = await ddb.get({ TableName, Key: { [PrimaryKey]: id } }).promise();
  if (!res.Item || res.Item.entity !== 'CUSTOMER') return notFound('Customer not found');


  const result = await ddb.delete({ 
    TableName, 
    Key: { [PrimaryKey]: id },
    ReturnValues: 'ALL_OLD'
  }).promise();

  if (!result.Attributes) return notFound('Customer not found');
  return ok({ deleted: true });
};
