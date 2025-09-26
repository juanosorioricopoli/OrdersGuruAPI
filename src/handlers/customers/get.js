const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { ok, notFound } = require('../../lib/http');

exports.handler = async (event) => {
  const id = event.pathParameters && event.pathParameters.id;
  const res = await ddb.get({ TableName, Key: { [PrimaryKey]: id } }).promise();
  if (!res.Item || res.Item.entity !== 'CUSTOMER') return notFound('Customer not found');
  return ok(res.Item);
};
