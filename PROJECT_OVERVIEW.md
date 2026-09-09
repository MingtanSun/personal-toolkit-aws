# SubLens technical project overview

## Project summary

SubLens is a full-stack AWS portfolio application for tracking recurring subscriptions. Its AI features combine multimodal extraction with a conversational, tool-using agent that answers questions using authenticated subscription data.

The project demonstrates a complete web application lifecycle:

- React user interface and state management;
- OAuth-based authentication;
- an authenticated Express API;
- user-isolated NoSQL data;
- multipart image upload and AI integration;
- LangChain tool orchestration and LangGraph thread-scoped memory;
- deterministic business calculations exposed through Zod-validated tools;
- containerized cloud hosting;
- infrastructure as code;
- CI and repeatable deployment workflows.

The product also includes personal task management and a compact weather panel.

## Agent user journey

1. The authenticated user opens the floating SubLens assistant.
2. React sends the current message and a browser-generated conversation UUID.
3. Express derives the user identity from the verified access token and builds a user-scoped `thread_id`.
4. LangGraph restores the thread's process-local state, and the LangChain agent decides whether to call a subscription tool.
5. The selected tool queries or calculates against that user's DynamoDB records.
6. The model receives a sanitized result without DynamoDB keys and writes the final answer.
7. Follow-up messages reuse the same thread, allowing references such as “it” to resolve from previous turns.

## Main user journey

1. A user signs in through Amazon Cognito Hosted UI.
2. React receives and stores the Cognito tokens after the PKCE flow completes.
3. The user selects a subscription screenshot and sees a local preview.
4. React uploads the image to the authenticated Express API.
5. Express loads the user's existing subscriptions and calls the multimodal DeepSeek model.
6. The model extracts structured values and may identify a potentially similar saved subscription.
7. React displays the extracted values in editable inputs.
8. The user corrects missing or inaccurate information.
9. A separate save action stores the confirmed subscription in DynamoDB.
10. The user can later view, edit, or delete the saved record.

This design keeps the AI in an assistant role: it proposes data, while the user controls what is persisted.

## Extracted subscription data

The screenshot analysis response contains:

| Field | Meaning |
| --- | --- |
| `serviceName` | Provider or service name |
| `planName` | Subscription plan or tier |
| `billingCycle` | Weekly, monthly, quarterly, yearly, or one-time |
| `amount` | Base amount for one billing period |
| `currency` | ISO currency code such as CAD or USD |
| `firstPaymentDate` | First payment or subscription start date |
| `websiteUrl` | Provider's main website |
| `notes` | Other useful information visible in the screenshot |
| `similarSubscriptionWarning` | Optional warning based on existing records |

The warning is shown to the user but is not stored in DynamoDB.

## Frontend design

The frontend uses React 19 and Vite 7. `App.jsx` owns authentication and theme state, then composes three main authenticated areas:

- subscription upload, confirmation, and saved records;
- current weather and a five-day forecast;
- private task management.

The subscription feature is split into small components around the user flow:

- `SubscriptionsPanel.jsx` owns shared subscription state;
- `SubscriptionUploader.jsx` selects and uploads the image;
- `SubscriptionInfoRender.jsx` displays editable analysis fields;
- `SubscriptionConfirm.jsx` saves the confirmed result;
- `DisplaySubscription.jsx` and `SubscriptionRow.jsx` render and manage stored items.

The shared `apiFetch` helper obtains a valid access token, refreshes it when possible, adds the bearer header, and handles expired sessions consistently.

Weather is fetched directly from Open-Meteo. Ottawa is the initial city, users can search for another city, and the selected city is remembered in local storage. The current interface does not request browser location.

## Backend design

The backend uses Node.js, Express 5, and TypeScript. Its structure is deliberately flat:

```text
src/
├── server.ts
├── auth.ts
├── config.ts
├── dynamodb.ts
├── tasks.ts
└── subscription.ts
```

This keeps routing and middleware visible in one place while database operations remain grouped by feature.

`server.ts` applies authentication once to the `/api/v1` path. Task and subscription handlers therefore receive a verified user identity without duplicating the JWT verification logic.

Multer uses memory storage for screenshot uploads. The backend converts the uploaded buffer to Base64 and sends it to DeepSeek through an OpenAI-compatible SDK client. The provider key stays on the server.

## Authentication

SubLens uses Amazon Cognito Hosted UI and the OAuth 2.0 Authorization Code flow with PKCE.

The SPA is a public client and does not contain a client secret. React creates a code verifier and challenge before redirecting to Cognito. After login, it exchanges the returned authorization code for tokens.

Protected requests include:

```http
Authorization: Bearer <access-token>
```

The Express authentication middleware verifies the Cognito access token and places its `sub` claim on the request. Route handlers use only this verified value as the user ID; they do not accept a user identity in the request body.

## DynamoDB model

Tasks and subscriptions are stored in separate tables. Both use a composite primary key:

```text
PK = USER#{cognitoSub}
SK = <entity type>#{entityId}
```

Examples:

```text
PK = USER#abc123
SK = TASK#550e8400-e29b-41d4-a716-446655440000

PK = USER#abc123
SK = SUBS#7fa1a2ab-f157-4e30-9929-841223ab0100
```

The main access pattern is "load all records of one type for the signed-in user." DynamoDB `Query` operations use the user's partition key, and UUID-based sort keys identify individual records.

## API surface

```text
GET    /health

GET    /api/v1/tasks
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:taskId
DELETE /api/v1/tasks/:taskId

POST   /api/v1/subscription/analyze
POST   /api/v1/subscription/submit
GET    /api/v1/subscription
PUT    /api/v1/subscription
DELETE /api/v1/subscription

POST   /api/v1/agent/message
```

The health route is public. All versioned application routes require authentication.

## AWS architecture

The deployed system uses:

- **S3** for the static React build;
- **CloudFront** for frontend delivery and routing `/api/v1/*` to the backend;
- **Cognito** for hosted sign-in and token issuance;
- **EC2** for the long-running Express server;
- **Docker** for a reproducible backend runtime;
- **ECR** for backend container images;
- **DynamoDB** for tasks and subscriptions;
- **CodeBuild** to build Docker images;
- **Systems Manager** to update the EC2 container without SSH;
- **IAM** roles and policies for service access;
- **CloudFormation/SAM** for repeatable infrastructure configuration.

The active backend does not use Lambda or API Gateway. It also avoids nginx, an Application Load Balancer, and a NAT Gateway to keep the architecture understandable and the monthly cost appropriate for a portfolio project.

## CI/CD

GitHub Actions provides four workflows:

- **CI** runs for pushes and pull requests and builds both applications, type-checks the backend, and validates the Cognito template.
- **Deploy Cognito** manually applies the authentication stack.
- **Deploy Express Backend** manually builds and publishes the Docker image and updates EC2.
- **Deploy Frontend** manually publishes the Vite build and invalidates CloudFront.

Manual deployment triggers prevent every documentation or small code commit from changing the live environment.

## Secret management

The local backend reads configuration from an ignored `.env` file. The example file contains placeholders only.

In deployment, AWS credentials and `DEEPSEEK_API_KEY` are stored as GitHub Actions repository secrets. The AI key is passed to the running container as an environment variable and is never included in frontend code or committed source.

## Engineering decisions and trade-offs

### Human review after AI extraction

Multimodal model output can be incomplete or incorrect. SubLens separates analysis from persistence and allows correction before saving rather than treating the model response as trusted database input.

### Server-side AI call

Calling the provider from Express keeps the API key out of the browser and lets the backend include authenticated user context for duplicate comparison.

### Tool-mediated agent access

The conversational model does not receive database credentials or a browser-provided user ID. It selects from narrow, read-only tools whose implementations obtain the verified user identity from runtime context. Zod schemas constrain model-generated arguments, while deterministic TypeScript handles querying, totals, matching, and renewal-date calculations.

### Thread-scoped short-term memory

LangGraph `MemorySaver` checkpoints Agent state under a `userId:conversationId` key. This demonstrates multi-turn state and user/thread isolation without presenting process memory as durable storage. A database-backed checkpointer is a planned production extension.

### Cognito `sub` for isolation

Using the verified token claim as the DynamoDB partition-key input provides a direct connection between authentication and data access.

### EC2 with Docker

EC2 provides a conventional long-running Node.js server that is useful to demonstrate for backend roles. Docker makes the CodeBuild and EC2 runtime consistent.

### Flat Express structure

The API avoids a large framework or deeply layered architecture. This makes middleware, authentication, and route order easy to understand while the project is still small.

### Direct browser weather requests

Weather does not need private credentials, so React calls Open-Meteo directly. This keeps unrelated traffic away from the Express server.

## Current status

The application currently provides:

- deployed Cognito authentication;
- AI-assisted subscription screenshot analysis;
- editable subscription confirmation;
- subscription create, read, update, and delete operations;
- possible-duplicate warnings;
- a LangChain subscription agent with five read-only tools;
- multi-turn, thread-scoped short-term memory;
- private task management;
- weather and city search;
- light and dark themes;
- Dockerized Express deployment on EC2;
- automated validation and manual release workflows.

The implementation is a portfolio project rather than a commercial billing system. Its purpose is to demonstrate an end-to-end full-stack AWS application and the reasoning behind its architecture.
