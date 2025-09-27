# Orders API (Serverless + Cognito Auth)

Orders API built with **AWS Lambda**, **API Gateway REST v1** and **DynamoDB**, protected by **Amazon Cognito**.

## Architecture
- API Gateway (REST) routes to Node.js 18 Lambdas packaged with Serverless Framework.
- DynamoDB stores orders, products, and customers in a single table with GSIs (`byEntityCreatedAt`, `byOwnerCreatedAt`).
- Cognito User Pool + API Gateway authorizer enforce JWT auth; the `admin` group guards privileged operations.
- Plugin `scripts/sls-bootstrap-user.js` provisions a test user after each deploy and prints a ready-to-use IdToken.

## Project Structure
```
orders-api/
  serverless.yml
  package.json
  scripts/
    sls-bootstrap-user.js
  src/
    handlers/
      orders/
      products/
      customers/
    lib/
      auth.js
      ddb.js
      http.js
    validators/
      orders.js
      products.js
      customers.js
  orders-api.postman_collection.json
  README.md
```

## Deployment
Requirements: AWS CLI configured, permissions for CloudFormation/IAM/DynamoDB/API Gateway/Cognito, and Serverless Framework v4 (`npm i -g serverless`).

Install dependencies:
```bash
npm ci
```

Deploy:
```bash
# Dev
npx serverless deploy --stage dev
# Prod
npx serverless deploy --stage prod
```

Key outputs:
- `ApiUrl`
- `UserPoolId`
- `UserPoolClientId`
- `TableName`

## Cognito Authentication
The bootstrap plugin creates `juan@example.com` with password `P@ssw0rd!` (admin group). Override with `--username`, `--password`, or `--admin=false` if needed.

Copy `AuthenticationResult.IdToken` and use it as a Bearer token.

## Domain Validations
- **Products**: require `name`, `price`, unique `sku` (case-insensitive). Only `admin` may create/update/delete.
- **Customers**: require `name`, unique valid `email`. Owner (`ownerSub`) may update; delete is admin-only.
- **Orders**: require `customer.id` of an existing customer and `products[{ sku, qty }]` with existing SKUs (no duplicates per order).
- Validators under `src/validators/*.js` normalize input and query DynamoDB before persisting data.

## DynamoDB Data Model
```json
{
  "id": "uuid",
  "entity": "ORDER|PRODUCT|CUSTOMER",
  "ownerSub": "cognito-sub",
  "createdAt": "ISO-8601",

  // ORDER extras
  "customer": { "id": "string" },
  "customerId": "string",
  "products": [{ "sku": "string", "qty": 1 }],
  "productSkus": ["string"],
  "status": "NEW|PAID|CANCELLED",
  "total": 12000,
  "notes": "string?",

  // PRODUCT extras
  "name": "string",
  "price": 6000,
  "sku": "string",
  "description": "string?",
  "active": true,

  // CUSTOMER extras
  "name": "string",
  "email": "string",
  "phone": "string?",
  "address": "string?",
  "active": true
}
```

## Quick cURL Usage
```bash
API_URL="https://<restid>.execute-api.us-east-1.amazonaws.com/dev"
TOKEN="<Cognito IdToken>"
CUSTOMER_ID="<existing customer id>"

# Create products (admin only)
curl -X POST "$API_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Latte 12oz","price":6000,"sku":"0001"}'

curl -X POST "$API_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Espresso doble","price":4000,"sku":"0002"}'

# Create customer
curl -X POST "$API_URL/customers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Juan Perez","email":"juan.perez@example.com"}'

# Create order (requires existing customer and SKUs)
curl -X POST "$API_URL/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "customer": { "id": "'$CUSTOMER_ID'" },
        "products": [
          { "sku": "0001", "qty": 2 },
          { "sku": "0002", "qty": 1 }
        ],
        "total": 16000,
        "status": "NEW",
        "notes": "Entregar antes de las 10am"
      }'
```

## Postman Collection
`orders-api.postman_collection.json` contains:

- CRUD requests wired to collection variables (`idToken`, `customerId`, `productId`, etc.).
- `Orders - Create` request already uses the new structure with `customer.id` and `products[{ sku, qty }]`.

## CI/CD (GitHub Actions)
Workflow `.github/workflows/deploy.yml` deploys automatically:
- Push to `dev` -> stage `dev`
- Push to `master` -> stage `prod`

## Configurations
## Create Secrets 




Provision IAM roles that trust `token.actions.githubusercontent.com` and allow CloudFormation, Lambda, API Gateway, DynamoDB, and Cognito operations.

## Cleanup
```bash
npx serverless remove --stage dev
npx serverless remove --stage prod
```

## Notes
- Node.js 22 already bundles AWS SDK v3; we keep `aws-sdk` v2 for the DynamoDB DocumentClient.
- Validators hit DynamoDB; when running locally, pair `serverless offline` with DynamoDB Local or stub the calls.

