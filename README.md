# Orders API (Serverless + Cognito Auth)

REST API for orders, products, and customers built on **AWS Lambda**, **API Gateway REST v1**, **DynamoDB**, and protected by **Amazon Cognito** using the Serverless Framework.

## Architecture
- API Gateway routes to Node.js 20 Lambda functions packaged with Serverless Framework v3.
- A single DynamoDB table stores all entities; GSIs `byEntityCreatedAt` and `byOwnerCreatedAt` back list queries.
- Cognito User Pool + API Gateway authorizer enforce JWT auth; the `admin` group guards privileged endpoints.
- `scripts/sls-bootstrap-user.js` seeds a test user after each deploy and prints a usable IdToken.

## Project Structure
```
OrdersGuruApi/
  serverless.yml
  package.json
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
  scripts/
    sls-bootstrap-user.js
  .github/
    workflows/
      deploy.yml
  pipeline/
    buildspec-deploy-dev.yml
    buildspec-deploy-prod.yml
    codepipeline-template.yml
  orders-api.postman_collection.json
  README.md
```

## Prerequisites
- AWS account with rights for CloudFormation, IAM, DynamoDB, API Gateway, Lambda, and Cognito.
- IAM role/user with access keys configured locally (`aws configure`).
- `serverlessApiGatewayCloudWatchRole` IAM role (trusted entity `apigateway.amazonaws.com`) with policy `AmazonAPIGatewayPushToCloudWatchLogs` so API Gateway can ship logs.
- Node.js 20+ and npm.
- Serverless Framework v3 (`npm i -g serverless@3`).

## Local Deployment
Install dependencies:
```bash
npm ci
```

Deploy stages:
```bash
# Dev
npx serverless deploy --stage dev

# Prod
npx serverless deploy --stage prod
```

Useful CloudFormation outputs:
- `ApiUrl`
- `UserPoolId`
- `UserPoolClientId`
- `TableName`

Remove stacks:
```bash
npx serverless remove --stage dev
npx serverless remove --stage prod
```

## Cognito Bootstrap User
The bootstrap plugin creates `juan@example.com` with password `P@ssw0rd!` and adds it to the `admin` group. Override defaults with `--username`, `--password`, or `--admin=false`. Copy the `AuthenticationResult.IdToken` from the deploy logs and use it as a Bearer token.

## Domain Validations
- **Products**: require `name`, `price`, and unique `sku` (case-insensitive). Only `admin` can mutate.
- **Customers**: require `name` and unique `email`. Owners (`ownerSub`) may update; delete is admin-only.
- **Orders**: require an existing `customer.id` and a list of products `{ sku, qty }` with existing SKUs (no duplicates per order).

Validators located in `src/validators/*` query DynamoDB before persisting changes.

## DynamoDB Item Shape
```json
{
  "id": "uuid",
  "entity": "ORDER|PRODUCT|CUSTOMER",
  "ownerSub": "cognito-sub",
  "createdAt": "ISO-8601",

  "customer": { "id": "string" },
  "customerId": "string",
  "products": [{ "sku": "string", "qty": 1 }],
  "productSkus": ["string"],
  "status": "NEW|PAID|CANCELLED",
  "total": 16000,
  "notes": "optional",

  "name": "string",
  "price": 6000,
  "sku": "string",
  "description": "optional",
  "email": "string",
  "phone": "optional",
  "address": "optional",
  "active": true
}
```

## CI/CD with GitHub Actions
Workflow: `.github/workflows/deploy.yml`

### Triggers
- Push to `dev` -> deploy `--stage dev`.
- Push to `master` -> deploy `--stage prod`.
- Manual `Run workflow` button -> choose `dev` or `prod` via the `environment` input.

### Required GitHub Secrets
Create these repository-level secrets:
- `AWS_ACCESS_KEY_ID_DEV` / `AWS_SECRET_ACCESS_KEY_DEV`
- `AWS_ACCESS_KEY_ID_PROD` / `AWS_SECRET_ACCESS_KEY_PROD`
- `SERVERLESS_ACCESS_KEY` (Access Key from the Serverless Dashboard tied to org `juanosoriorico`).


### Manual Deployment
1. Go to **Actions > Orders API CI/CD > Run workflow**.
2. Select the branch (usually `master`) and choose `dev` or `prod` in the dropdown.
3. Click **Run workflow**. Only the job for the selected environment runs.

### AWS Notes
- Ensure the IAM principals referenced by the secrets have the necessary permissions.
- If deploying in a fresh account, create the `serverlessApiGatewayCloudWatchRole` once or add it to `serverless.yml`.

## Postman Collection
`orders-api.postman_collection.json` contains requests preconfigured with environment variables (`idToken`, `customerId`, `productId`, etc.) for quick testing.

## Quick cURL Example
```bash
API_URL="https://<restid>.execute-api.us-east-1.amazonaws.com/dev"
TOKEN="<Cognito IdToken>"
CUSTOMER_ID="<existing customer id>"

curl -X POST "$API_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Latte 12oz","price":6000,"sku":"0001"}'

curl -X POST "$API_URL/customers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Juan Perez","email":"juan.perez@example.com"}'

curl -X POST "$API_URL/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "customer": { "id": "'$CUSTOMER_ID'" },
        "products": [
          { "sku": "0001", "qty": 2 }
        ],
        "total": 12000,
        "status": "NEW"
      }'
```

## Notes
- Node.js 20 already bundles AWS SDK v3; `aws-sdk` v2 is used for DynamoDB DocumentClient compatibility.
- For local development against DynamoDB Local, adjust `lib/ddb.js` to point to the local endpoint.
- The `pipeline/` folder contains CloudFormation and CodeBuild definitions if you prefer AWS CodePipeline instead of GitHub Actions.
