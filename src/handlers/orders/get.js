const { ddb, TableName, PrimaryKey } = require('../../lib/ddb');
const { ok, notFound } = require('../../lib/http');

exports.handler = async (event) => {
  const id = event.pathParameters && event.pathParameters.id;
  const res = await ddb.get({ TableName, Key: { [PrimaryKey]: id } }).promise();
  return res.Item ? ok(res.Item) : notFound('Order not found');
};
