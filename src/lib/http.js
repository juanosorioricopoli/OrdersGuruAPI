const json = (data, statusCode = 200) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

const ok = (data) => json(data, 200);
const created = (data) => json(data, 201);
const badRequest = (message = 'Bad Request') => json({ message }, 400);
const unauthorized = (message = 'Unauthorized') => json({ message }, 401);
const notFound = (message = 'Not Found') => json({ message }, 404);
const noContent = () => ({ statusCode: 204, body: '' });

module.exports = { ok, created, badRequest, unauthorized, notFound, noContent };