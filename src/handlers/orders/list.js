const { ddb, TableName } = require('../../lib/ddb');
const { ok } = require('../../lib/http');

exports.handler = async () => {
  const res = await ddb.query({
    TableName,
    IndexName: 'byEntityCreatedAt',
    KeyConditionExpression: '#e = :entity',
    ExpressionAttributeNames: { '#e': 'entity' },
    ExpressionAttributeValues: { ':entity': 'ORDER' },
    ScanIndexForward: false,
    Limit: 50
  }).promise();
  return ok({ items: res.Items || [], count: res.Count || 0 });
};
