const { ddb, TableName } = require('../../lib/ddb');
const { ok } = require('../../lib/http');

exports.handler = async () => {
  const params = {
    TableName,
    IndexName: 'byEntityCreatedAt',
    KeyConditionExpression: '#e = :entity',
    ExpressionAttributeNames: { '#e': 'entity' },
    ExpressionAttributeValues: { ':entity': 'CUSTOMER' },
    ScanIndexForward: false,
    Limit: 50
  };
  const res = await ddb.query(params).promise();
  return ok({ items: res.Items || [], count: res.Count || 0 });
};
