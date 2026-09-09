# SubLens application documentation

## Overview

SubLens is an authenticated subscription tracker and personal dashboard. Its main workflow turns a subscription screenshot into editable structured data, lets the user confirm the result, and stores the final record in DynamoDB. Users can also chat with a tool-using subscription agent, manage private tasks, and search weather forecasts.

## Frontend

The React application is located in `frontend-react/`.

Important files:

- `src/App.jsx`: authentication state, page layout, and theme switching.
- `src/auth.js`: Cognito sign-in, sign-out, PKCE, token exchange, and refresh.
- `src/api.js`: the shared authenticated fetch helper.
- `src/components/SubscriptionsPanel.jsx`: subscription workspace state and composition.
- `src/components/Subscriptions/SubscriptionUploader.jsx`: file selection and screenshot upload.
- `src/components/Subscriptions/SubscriptionInfoRender.jsx`: editable AI result fields and duplicate warning.
- `src/components/Subscriptions/SubscriptionConfirm.jsx`: confirmed subscription save request.
- `src/components/Subscriptions/DisplaySubscription.jsx`: saved subscription list.
- `src/components/AgentChat.jsx`: floating authenticated agent chat, browser conversation ID, and suggested questions.
- `src/components/TasksPanel.jsx`: task management interface.
- `src/components/WeatherPanel.jsx`: Ottawa weather, forecast, and city search.
- `public/config.js`: browser runtime configuration for the API and Cognito.

The application uses light and dark themes and stores the selected theme and weather city in local storage.

## Backend

The Express API is intentionally kept in a flat structure so that its request flow is easy to follow:

```text
backend-express/src/
├── server.ts          Express setup, middleware, and routes
├── auth.ts            Cognito JWT verification
├── config.ts          Environment variable loading
├── dynamodb.ts        DynamoDB document client
├── tasks.ts           Task data operations
├── subscription.ts    Subscription data operations and AI analysis
├── agent.ts           LangChain agent, tools, prompt, and short-term memory
└── agentTools.ts      deterministic subscription calculations used by tools
```

`server.ts` is the best starting point. It registers CORS and JSON parsing, exposes the public health route, applies authentication to `/api/v1`, and then defines task and subscription routes.

## Authentication

The frontend uses Amazon Cognito Hosted UI with OAuth 2.0 Authorization Code and PKCE:

1. React creates a verifier, challenge, and state value.
2. The browser opens Cognito Hosted UI.
3. Cognito redirects to the React callback URL with an authorization code.
4. React exchanges the code for access, ID, and refresh tokens.
5. The shared API helper adds the access token to each protected request.
6. Express verifies the JWT and uses the verified `sub` claim as the current user ID.

```http
Authorization: Bearer <access-token>
```

The frontend refreshes an expired access token when a refresh token is available. If the session is no longer valid, it clears the stored authentication state and asks the user to sign in again.

## AI subscription workflow

Accepted image types are PNG, JPEG, and WebP.

1. The user selects a screenshot and receives a local preview.
2. The frontend sends the image to `POST /api/v1/subscription/analyze`.
3. Multer reads the upload into memory and Express converts it to Base64.
4. The API loads the current user's subscriptions for comparison.
5. The multimodal model returns:
   - `serviceName`
   - `planName`
   - `billingCycle`
   - `amount`
   - `currency`
   - `firstPaymentDate`
   - `websiteUrl`
   - `notes`
   - `similarSubscriptionWarning`
6. React displays each value in an input so the user can review or correct it.
7. Required empty fields are marked in the UI.
8. A separate confirmation request saves the accepted record.

`similarSubscriptionWarning` is displayed only in the current analysis result. It is not saved as a DynamoDB field.

## Subscription agent

`POST /api/v1/agent/message` accepts the current message and a browser-generated `conversationId`. Express combines that ID with the authenticated Cognito `sub` to create a user-scoped LangGraph `thread_id`.

The agent uses LangChain's `createAgent`, Zod tool schemas, the OpenAI-compatible DeepSeek chat API, and LangGraph `MemorySaver`. It can:

- calculate spending across monthly-billed subscriptions;
- return the subscription with the highest stored amount;
- inspect possible duplicate or similar subscriptions;
- find a particular service from several model-inferred candidate names;
- calculate monthly or yearly subscriptions renewing within a requested number of days.

Tools query DynamoDB through the authenticated `runtime.context.userId`; the model cannot supply or replace that identity. Internal `PK` and `SK` values are removed before subscription records are returned to the model.

`MemorySaver` provides thread-scoped follow-up context within the running Node.js process. It is not persistent storage: restarting or replacing the backend container clears agent memory, and refreshing the browser starts a new conversation ID.

## Subscription management

Subscriptions can be created, listed, replaced with edited values, and deleted. Stored fields are:

```text
PK
SK
serviceName
planName
billingCycle
amount
currency
firstPaymentDate
websiteUrl
notes
```

Keys:

```text
PK = USER#{cognitoSub}
SK = SUBS#{subscriptionId}
```

Routes:

```text
POST   /api/v1/subscription/analyze
POST   /api/v1/subscription/submit
GET    /api/v1/subscription
PUT    /api/v1/subscription
DELETE /api/v1/subscription

POST   /api/v1/agent/message
```

## Task management

Tasks support creation, listing, title changes, completion status, starred status, priority changes, and deletion. Priorities are `low`, `normal`, and `high`.

Keys:

```text
PK = USER#{cognitoSub}
SK = TASK#{taskId}
```

Routes:

```text
GET    /api/v1/tasks
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:taskId
DELETE /api/v1/tasks/:taskId
```

## Weather

Weather data is loaded directly by the browser from Open-Meteo, without passing through Express. The panel:

- loads Ottawa by default;
- supports city-name search;
- shows current temperature, apparent temperature, humidity, wind, and conditions;
- shows a five-day forecast;
- remembers the user's selected city in local storage.

Browser geolocation is not exposed in the current interface.

## Backend configuration

```text
PORT
AWS_REGION
TASKS_TABLE_NAME
SUBSCRIPTIONS_TABLE_NAME
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
CORS_ORIGIN
DEEPSEEK_API_KEY
```

Local values belong in `backend-express/.env`, which is ignored by Git. The deployed DeepSeek key comes from a GitHub Actions repository secret and is injected into the Docker container during deployment.

## Delivery

- `CI` runs on pushes and pull requests.
- `Deploy Cognito` manually updates the authentication stack.
- `Deploy Express Backend` manually builds and deploys the Docker container.
- `Deploy Frontend` manually publishes the React build to S3 and invalidates CloudFront.

For infrastructure details, see [ARCHITECTURE.md](./ARCHITECTURE.md).
