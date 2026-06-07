# Deployment Guide

## Prerequisites

- AWS account with permissions for CloudFormation, Lambda, API Gateway, Cognito, DynamoDB, and IAM.
- AWS CLI configured for the target account.
- AWS SAM CLI installed.
- TMDB API key for the movie endpoint.
- A frontend URL for Cognito callback/logout configuration.

For local static testing, the callback URL can be:

```text
http://localhost:8000/
```

For S3 or CloudFront hosting, use the exact deployed site URL.

## Deploy Backend And Identity Resources

From the repository root:

```text
sam build --template-file infra/template.yaml
sam deploy --guided
```

During guided deploy, provide:

- `StageName`: usually `prod`.
- `FrontendCallbackUrl`: exact frontend URL Cognito should redirect to after login.
- `FrontendLogoutUrl`: exact frontend URL Cognito should redirect to after logout.
- `TmdbApiKey`: your TMDB API key.

The stack creates:

- Cognito User Pool
- Cognito SPA App Client
- Cognito Hosted UI domain
- API Gateway HTTP API
- Cognito JWT Authorizer
- Lambda function
- DynamoDB task table with `PK` and `SK`

## Configure Frontend

Copy the example config:

```text
cp frontend/config.example.js frontend/config.js
```

Fill the values from SAM outputs:

```js
window.APP_CONFIG = {
  API_URL: "ApiUrl output",
  AWS_REGION: "AwsRegion output",
  COGNITO_DOMAIN: "CognitoDomain output",
  COGNITO_CLIENT_ID: "CognitoClientId output",
  COGNITO_REDIRECT_URI: window.location.origin + window.location.pathname,
  COGNITO_LOGOUT_URI: window.location.origin + window.location.pathname,
  COGNITO_SCOPES: ["openid", "email", "profile"]
};
```

Upload the frontend files together:

- `frontend/index.html`
- `frontend/styles.css`
- `frontend/config.js`
- `frontend/app.js`
- `frontend/weather-fx.js`
- `frontend/icon.png`

## Verify Cognito Redirects

The Cognito App Client callback and logout URLs must exactly match the URL loaded in the browser, including protocol and trailing slash behavior.

Examples:

```text
http://localhost:8000/
https://example.com/
https://d123.cloudfront.net/
```

If sign-in succeeds but returns a Cognito redirect error, update `FrontendCallbackUrl` and redeploy the SAM stack.

## DynamoDB Data Model

The deployed table uses:

```text
PK = USER#{cognitoSub}
SK = TASK#{taskId}
```

This is not compatible with the original demo table that used only `taskId` as the key. For demo data, the simplest migration is to start with the new table empty. To keep old tasks, write a one-time migration that assigns those tasks to a chosen Cognito user and rewrites them with the new `PK/SK` keys.

## Local Checks

Run:

```text
python3 -m unittest discover -s tests
python3 -m py_compile backend/lambda_function.py tests/test_lambda_auth.py tests/test_frontend_auth.py
node --check frontend/app.js
```

If SAM CLI is installed, also run:

```text
sam validate --template-file infra/template.yaml
```

## Manual API Gateway Checklist

If deploying manually instead of SAM:

- Add a Cognito/JWT authorizer using the User Pool issuer.
- Use the SPA App Client ID as authorizer audience.
- Protect `GET /tasks`, `POST /tasks`, `PATCH /tasks/{id}`, `DELETE /tasks/{id}`, `GET /news`, and `GET /movies`.
- Keep `OPTIONS` unauthenticated.
- Allow CORS header `authorization`.
- Set Lambda environment variable `TASKS_TABLE_NAME`.
- Give Lambda least-privilege DynamoDB access to the task table.
