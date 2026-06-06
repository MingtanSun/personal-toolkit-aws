# Authentication And Authorization

## Overview

Personal Toolkit uses Amazon Cognito for user identity and API Gateway JWT authorizers for API entry-point authentication. The frontend is a static SPA, so it uses OAuth 2.0 Authorization Code with PKCE through Cognito Hosted UI.

The backend never trusts a user ID from the browser request body. Lambda reads the authenticated user from API Gateway authorizer claims and uses the Cognito `sub` as the only user boundary.

## Flow

```text
Browser
  -> Cognito Hosted UI
  -> Browser receives authorization code
  -> Browser exchanges code + PKCE verifier for tokens
  -> Browser calls API Gateway with Authorization: Bearer <access_token>
  -> API Gateway validates JWT
  -> Lambda reads requestContext.authorizer.jwt.claims.sub
  -> DynamoDB query/write under PK = USER#{sub}
```

## Frontend Configuration

Copy `frontend/config.example.js` to `frontend/config.js` and fill the values from SAM outputs:

```js
window.APP_CONFIG = {
  API_URL: "https://your-api-id.execute-api.us-east-2.amazonaws.com/prod",
  AWS_REGION: "us-east-2",
  COGNITO_DOMAIN: "https://your-domain.auth.us-east-2.amazoncognito.com",
  COGNITO_CLIENT_ID: "your-cognito-app-client-id",
  COGNITO_REDIRECT_URI: window.location.origin + window.location.pathname,
  COGNITO_LOGOUT_URI: window.location.origin + window.location.pathname,
  COGNITO_SCOPES: ["openid", "email", "profile"]
};
```

The SPA stores Cognito tokens in `sessionStorage`, not `localStorage`, so closing the browser session clears the application session. The PKCE verifier and OAuth state are also stored in `sessionStorage` and cleared after callback handling.

## Backend User Boundary

Protected Lambda routes call `require_user(event)`. The helper reads claims from either HTTP API JWT authorizer shape:

```text
requestContext.authorizer.jwt.claims.sub
```

or the older REST/Cognito shape:

```text
requestContext.authorizer.claims.sub
```

If `sub` is missing, Lambda returns:

```json
{
  "error": "unauthorized",
  "message": "Authentication is required. Sign in and retry the request."
}
```

## DynamoDB Model

Tasks use a composite key:

```text
PK = USER#{cognitoSub}
SK = TASK#{taskId}
```

This means `GET /tasks` can use a partition query instead of a table scan. Updates and deletes use the same `PK/SK` pair plus a conditional expression, so user A cannot update or delete user B's tasks even if user A guesses another task ID.

## Protected Routes

The SAM template applies the Cognito authorizer to:

- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/{id}`
- `DELETE /tasks/{id}`
- `GET /news`
- `GET /movies`

`OPTIONS` preflight remains unauthenticated and allows the `authorization` header.

## Deployment

Deploy the backend and identity resources:

```text
sam build --template-file infra/template.yaml
sam deploy --guided
```

Use the outputs to update `frontend/config.js`:

- `ApiUrl`
- `AwsRegion`
- `CognitoDomain`
- `CognitoClientId`

The Cognito callback URL and logout URL must match the deployed frontend URL exactly.

## Tests

Run the local tests with:

```text
python -m unittest discover -s tests
```

Current tests cover:

- Missing JWT returns 401.
- Created tasks are written under `USER#{sub}`.
- One user cannot update another user's task.
- Frontend config is loaded before app logic.
- Frontend backend API calls use authenticated request helpers.

## Security Notes

- Do not put AWS credentials, TMDB API keys, or Cognito client secrets in frontend files.
- Cognito SPA App Client must not generate a client secret.
- Do not accept `userId` in task request payloads.
- Keep Lambda IAM permissions scoped to the task table.
- Keep API Gateway CORS headers limited to required headers and methods.
