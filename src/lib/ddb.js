const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient();
const TableName = process.env.TABLE_NAME;
const PrimaryKey = process.env.PRIMARY_KEY || 'id';

module.exports = { ddb, TableName, PrimaryKey };
