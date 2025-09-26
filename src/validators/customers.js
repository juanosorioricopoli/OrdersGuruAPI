'use strict';

const { ddb, TableName, PrimaryKey } = require('../lib/ddb');

const CUSTOMER_ENTITY = 'CUSTOMER';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeName = (value, { required = false } = {}) => {
  const name = sanitizeString(value);
  if (!name) {
    if (required) throw new Error('Missing: name');
    return undefined;
  }
  return name;
};

const normalizeEmail = (value, { required = false } = {}) => {
  const email = sanitizeString(value).toLowerCase();
  if (!email) {
    if (required) throw new Error('Missing: email');
    return undefined;
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new Error('Invalid email format');
  }
  return email;
};

const normalizePhone = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid: phone must be a string');
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeAddress = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid: address must be a string');
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeBoolean = (value, { required = false, defaultValue } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new Error('Missing boolean value');
    return defaultValue;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  throw new Error('Invalid: active must be a boolean value');
};

const assertUniqueEmail = async (email, excludeId) => {
  const expressionAttributeNames = {
    '#entity': 'entity',
    '#email': 'email'
  };
  const expressionAttributeValues = {
    ':entity': CUSTOMER_ENTITY,
    ':email': email
  };

  let filterExpression = '#email = :email';
  if (excludeId) {
    expressionAttributeNames['#pk'] = PrimaryKey;
    expressionAttributeValues[':excludeId'] = excludeId;
    filterExpression += ' AND #pk <> :excludeId';
  }

  const params = {
    TableName,
    IndexName: 'byEntityCreatedAt',
    KeyConditionExpression: '#entity = :entity',
    FilterExpression: filterExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    Limit: 1
  };

  const existing = await ddb.query(params).promise();
  if (existing.Items && existing.Items.length) {
    throw new Error('Customer with this email already exists');
  }
};

async function validateCustomerCreate(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid body');
  }

  const sanitized = {};
  sanitized.name = normalizeName(payload.name, { required: true });
  sanitized.email = normalizeEmail(payload.email, { required: true });
  sanitized.phone = normalizePhone(payload.phone);
  sanitized.address = normalizeAddress(payload.address);
  sanitized.active = normalizeBoolean(payload.active, { defaultValue: true });

  await assertUniqueEmail(sanitized.email);

  return sanitized;
}

async function validateCustomerUpdate(payload, currentItem) {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid body');
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    updates.name = normalizeName(payload.name, { required: true });
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    updates.email = normalizeEmail(payload.email, { required: true });
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'phone')) {
    updates.phone = normalizePhone(payload.phone);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'address')) {
    updates.address = normalizeAddress(payload.address);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'active')) {
    updates.active = normalizeBoolean(payload.active, { required: true });
  }

  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  if (!keys.length) {
    throw new Error('No fields to update');
  }

  if (updates.email) {
    const currentEmail = typeof currentItem?.email === 'string' ? currentItem.email.trim().toLowerCase() : '';
    if (updates.email !== currentEmail) {
      await assertUniqueEmail(updates.email, currentItem?.[PrimaryKey]);
    }
  }

  return updates;
}

module.exports = { validateCustomerCreate, validateCustomerUpdate };
