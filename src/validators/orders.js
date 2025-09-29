'use strict';

const { ddb, TableName, PrimaryKey } = require('../lib/ddb');

const CUSTOMER_ENTITY = 'CUSTOMER';
const PRODUCT_ENTITY = 'PRODUCT';
const ALLOWED_STATUSES = new Set(['NEW', 'PAID', 'CANCELLED']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeNotes = (value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('Invalid: notes must be a string');
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeStatus = (value, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new Error('Missing: status');
    return undefined;
  }
  const status = sanitizeString(value).toUpperCase();
  if (!status) throw new Error('Missing: status');
  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error(`Invalid status. Allowed: ${Array.from(ALLOWED_STATUSES).join(', ')}`);
  }
  return status;
};

const normalizeTotal = (value, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new Error('Missing: total');
    return undefined;
  }
  const total = Number(value);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error('Invalid: total must be a positive number');
  }
  return total;
};

const ensureCustomerExists = async (customerId) => {
  const res = await ddb.get({ TableName, Key: { [PrimaryKey]: customerId } }).promise();
  if (!res.Item || res.Item.entity !== CUSTOMER_ENTITY) {
    throw new Error('Customer not found');
  }
  return res.Item;
};

const ensureProductExists = async (sku) => {
  const baseParams = {
    TableName,
    IndexName: 'byEntityCreatedAt',
    KeyConditionExpression: '#entity = :entity',
    FilterExpression: '#sku = :sku',
    ExpressionAttributeNames: { '#entity': 'entity', '#sku': 'sku' },
    ExpressionAttributeValues: { ':entity': PRODUCT_ENTITY, ':sku': sku }
  };

  let startKey;
  do {
    const params = startKey ? { ...baseParams, ExclusiveStartKey: startKey } : baseParams;
    const res = await ddb.query(params).promise();
    if (res.Items && res.Items.length) {
      return res.Items[0];
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  throw new Error(`Product not found for sku ${sku}`);
};

const normalizeCustomerReference = async (value, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new Error('Missing: customer');
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error('Invalid customer object');
  }
  const id = sanitizeString(value.id);
  if (!id) {
    throw new Error('Missing: customer.id');
  }
  await ensureCustomerExists(id);
  return { id };
};

const normalizeProducts = async (value, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new Error('Missing: products');
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Products must be a non-empty array');
  }

  const seen = new Set();
  const sanitized = value.map((entry, idx) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Product entry #${idx + 1} must be an object`);
    }
    const sku = sanitizeString(entry.sku).toUpperCase();
    if (!sku) {
      throw new Error(`Product entry #${idx + 1} is missing sku`);
    }
    if (seen.has(sku)) {
      throw new Error(`Duplicate sku in products: ${sku}`);
    }
    const qty = Number(entry.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error(`Product entry #${idx + 1} has an invalid qty`);
    }
    seen.add(sku);
    return { sku, qty };
  });

  await Promise.all(sanitized.map((product) => ensureProductExists(product.sku)));
  return sanitized;
};

async function validateOrderCreate(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid body');
  }

  const customer = await normalizeCustomerReference(payload.customer, { required: true });
  const products = await normalizeProducts(payload.products, { required: true });
  const total = normalizeTotal(payload.total, { required: true });
  const status = normalizeStatus(payload.status) || 'NEW';
  const notes = normalizeNotes(payload.notes);

  const sanitized = {
    customerId: customer.id,
    products,
    productSkus: products.map((p) => p.sku),
    total,
    status
  };

  if (notes !== undefined) sanitized.notes = notes;
  return sanitized;
}

async function validateOrderUpdate(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid body');
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'customer')) {
    const customer = await normalizeCustomerReference(payload.customer, { required: true });
    updates.customer = customer;
    updates.customerId = customer.id;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'products')) {
    const products = await normalizeProducts(payload.products, { required: true });
    updates.products = products;
    updates.productSkus = products.map((p) => p.sku);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'total')) {
    updates.total = normalizeTotal(payload.total, { required: true });
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    updates.status = normalizeStatus(payload.status, { required: true });
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    const notes = normalizeNotes(payload.notes);
    if (notes === undefined) {
      updates.notes = null;
    } else {
      updates.notes = notes;
    }
  }

  const keys = Object.keys(updates);
  if (!keys.length) {
    throw new Error('No fields to update');
  }

  return updates;
}

module.exports = { validateOrderCreate, validateOrderUpdate };
