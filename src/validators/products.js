'use strict';

const { ddb, TableName, PrimaryKey } = require('../lib/ddb');

const PRODUCT_ENTITY = 'PRODUCT';

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

const normalizePrice = (value, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new Error('Missing: price');
    return undefined;
  }
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Invalid: price must be a positive number');
  }
  return price;
};

const normalizeSku = (value, { required = false } = {}) => {
  const raw = sanitizeString(value).toUpperCase();
  if (!raw) {
    if (required) throw new Error('Missing: sku');
    return undefined;
  }
  return raw;
};

const normalizeDescription = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid: description must be a string');
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

const assertUniqueSku = async (sku, excludeId) => {
  const expressionAttributeNames = {
    '#entity': 'entity',
    '#sku': 'sku'
  };
  const expressionAttributeValues = {
    ':entity': PRODUCT_ENTITY,
    ':sku': sku
  };

  let filterExpression = '#sku = :sku';
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
    throw new Error('Product with this SKU already exists');
  }
};

async function validateProductCreate(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid body');
  }

  const sanitized = {};
  sanitized.name = normalizeName(payload.name, { required: true });
  sanitized.price = normalizePrice(payload.price, { required: true });
  sanitized.sku = normalizeSku(payload.sku, { required: true });
  sanitized.description = normalizeDescription(payload.description);
  sanitized.active = normalizeBoolean(payload.active, { defaultValue: true });

  await assertUniqueSku(sanitized.sku);

  return sanitized;
}

async function validateProductUpdate(payload, currentItem) {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid body');
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    updates.name = normalizeName(payload.name, { required: true });
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'price')) {
    updates.price = normalizePrice(payload.price, { required: true });
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'sku')) {
    updates.sku = normalizeSku(payload.sku, { required: true });
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    updates.description = normalizeDescription(payload.description);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'active')) {
    updates.active = normalizeBoolean(payload.active, { required: true });
  }

  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  if (!keys.length) {
    throw new Error('No fields to update');
  }

  if (updates.sku) {
    const currentSku = typeof currentItem?.sku === 'string' ? currentItem.sku.trim().toUpperCase() : '';
    if (updates.sku !== currentSku) {
      await assertUniqueSku(updates.sku, currentItem?.[PrimaryKey]);
    }
  }

  return updates;
}

module.exports = { validateProductCreate, validateProductUpdate };
