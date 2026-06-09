# Personal Toolkit Application Documentation

## 1. Overview

Personal Toolkit is a serverless personal dashboard for authenticated users. It combines private task management, weather, international news, and local movie discovery in one lightweight web application.

The system uses a static frontend with an AWS serverless backend. The frontend is hosted from S3 and served through CloudFront. Users sign in through Amazon Cognito Hosted UI using OAuth 2.0 Authorization Code with PKCE. The frontend calls an API Gateway HTTP API with a Cognito JWT access token. A single Python Lambda function handles the backend routes. Task data is stored in DynamoDB and isolated by the Cognito `sub` claim.

News and movie data are aggregated by Lambda from external providers. Weather data is loaded directly from browser-side public APIs.

### 1.1 Project Structure

```text
todo_aws/
├── frontend/                 # Static SPA with no build step
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── weather-fx.js
│   ├── config.js             # Environment-specific frontend config
│   └── config.example.js     # Config template
├── backend/
│   └── lambda_function.py    # Single Lambda router
├── infra/
│   └── template.yaml         # AWS SAM infrastructure template
├── tests/                    # Local unit tests
├── .github/workflows/        # CI/CD workflows
├── archive/                  # Historical notes and retired plans
├── samconfig.toml            # SAM defaults
├── README                    # Project summary
├── ARCHITECTURE.md           # Architecture overview
└── APPLICATION_DOCUMENTATION.md
```

### 1.2 Documentation Policy

This file is the main application reference. Historical notes live in `archive/`; active architecture and deployment flow are described in `ARCHITECTURE.md`.

## 2. Current Features

### 2.1 Authentication

Authentication uses Amazon Cognito User Pool, Cognito Hosted UI, and OAuth 2.0 Authorization Code with PKCE.

Capabilities:

- Sign in and sign out through Cognito Hosted UI.
- Restore token state from `sessionStorage`.
- Refresh access tokens with refresh tokens.
- Send `Authorization: Bearer <token>` on protected API calls.
- Read the authenticated user only from API Gateway authorizer JWT claims.
- Hide the dashboard when signed out and show an authentication panel.
- Display the signed-in user email or Cognito username.
- Detect missing Cognito configuration in `frontend/config.js`.
- Verify OAuth `state`, exchange the authorization code, and clean callback query parameters.
- Use 1-hour access and ID tokens and a 30-day refresh token by default.

Protected data is loaded only after authentication. Weather can load before sign-in because it uses public browser-side APIs.

### 2.2 Tasks

The task module stores personal tasks in DynamoDB under a user-scoped partition key.

Capabilities:

- Create tasks from the input field or Enter key.
- Load tasks on dashboard startup.
- Mark tasks complete or active.
- Star important tasks.
- Rename active tasks by double-clicking the title.
- Delete tasks after confirmation.
- Filter by `All`, `Active`, and `Starred`.
- Save the current filter in `localStorage`.
- Sort starred tasks first in the frontend while the backend returns tasks by creation time.

### 2.3 Weather

The weather module displays current weather and a 5-day forecast.

Capabilities:

- Default city: Toronto, Ontario, Canada.
- City search through Open-Meteo Geocoding API.
- Browser geolocation with OpenStreetMap Nominatim reverse geocoding.
- Current temperature, condition, humidity, wind speed, and updated time.
- 5-day forecast with weather icons and high/low temperatures.
- Canvas-based weather effects for rain, snow, storms, and related conditions.
- Saved selected city in `localStorage`.

### 2.4 International News

The news module aggregates world headlines from major RSS feeds.

Capabilities:

- Load international news headlines automatically.
- Refresh the news list.
- Display source and publish time.
- Link each item to the original publisher.
- Build source filter chips from returned news sources.
- Fetch RSS feeds in parallel in Lambda.
- Deduplicate and sort headlines by publish time.
- Return a degraded JSON response instead of failing hard when RSS sources fail.
- Fall back to client-side RSS proxy loading when the backend returns no usable items.

Configured sources include The New York Times, The Guardian, BBC News, The Washington Post, Financial Times, Xinhua, The Times, and The Telegraph.

### 2.5 Local Movies

The movie module uses TMDB to display local now-playing and upcoming movies.

Capabilities:

- Infer region from the selected weather city, defaulting to Canada (`CA`).
- Switch between `Now playing` and `Coming soon`.
- Paginate results.
- Display posters, titles, release dates, ratings, and summaries.
- Link movie cards to TMDB detail pages.
- Cache movie results in the frontend by region/category/page.
- Cache TMDB responses in Lambda memory for 6 hours.

### 2.6 UI and Experience

- Light and dark themes.
- Theme preference saved in `localStorage`.
- Current date in the header.
- Responsive dashboard layout.
- Pointer glow and card spotlight effects.
- `prefers-reduced-motion` support.
- Accessible controls with `aria-*` attributes where appropriate.

## 3. Architecture

### 3.1 High-Level Structure

```text
Browser
  ├─ CloudFront HTTPS distribution
  ├─ S3 static frontend: index.html / styles.css / config.js / app.js / weather-fx.js
  ├─ Cognito Hosted UI: OAuth Code + PKCE
  ├─ Direct external APIs: Open-Meteo, OpenStreetMap Nominatim, RSS fallback proxies
  └─ API Gateway HTTP API
       ├─ Cognito JWT authorizer
       └─ AWS Lambda (Python 3.13)
            ├─ DynamoDB task table
            ├─ RSS news feeds
            └─ TMDB API
```

### 3.2 Frontend

The frontend is a vanilla JavaScript SPA in `frontend/`.

Main files:

- `index.html`: page structure and dashboard panels.
- `config.js`: deployed API and Cognito values.
- `config.example.js`: example configuration.
- `styles.css`: layout, themes, responsive behavior, and visual styling.
- `app.js`: authentication, tasks, weather, news, movies, and UI state.
- `weather-fx.js`: weather card canvas effects.
- `icon.png`: site icon.

`config.js` must load before `app.js`.

### 3.3 Backend

The backend is `backend/lambda_function.py`, a single Lambda handler with route dispatch by HTTP method and path.

Responsibilities:

- Task CRUD operations.
- User identity extraction from API Gateway JWT authorizer claims.
- RSS news aggregation.
- TMDB movie proxying and response normalization.
- CORS JSON responses.
- Stage-prefix stripping for deployed API Gateway paths.
- Unauthorized response when Cognito claims are missing.

### 3.4 Data Model

Tasks use a DynamoDB `PK/SK` model:

```text
PK = USER#{cognitoSub}
SK = TASK#{taskId}
```

Public task fields:

- `taskId`
- `title`
- `completed`
- `starred`
- `createdAt`
- `updatedAt`

The `userId` is stored internally and derived from Cognito. The frontend never controls task ownership.

Weather city, theme, and task filter preferences are stored in browser local storage.

### 3.5 AWS SAM Resources

`infra/template.yaml` deploys:

| Resource | Purpose |
| --- | --- |
| `TasksTable` | DynamoDB table with `PK`/`SK`, on-demand billing |
| `UserPool` | Cognito user pool with email sign-in |
| `UserPoolDomain` | Cognito Hosted UI domain |
| `UserPoolClient` | SPA client with OAuth code flow and refresh token support |
| `DashboardApi` | API Gateway HTTP API with Cognito JWT authorizer |
| `DashboardFunction` | Python 3.13 Lambda for all backend routes |

SAM parameters:

- `StageName`: API stage, default `prod`.
- `FrontendCallbackUrl`: Cognito callback URL.
- `FrontendLogoutUrl`: Cognito logout URL.
- `TmdbApiKey`: TMDB API key, marked `NoEcho`.

SAM outputs:

- `ApiUrl`
- `AwsRegion`
- `CognitoDomain`
- `CognitoClientId`
- `CognitoUserPoolId`
- `TasksTableName`

## 4. API

All backend routes require a Cognito JWT access token:

```text
Authorization: Bearer <access_token>
```

Missing or invalid tokens return `401 unauthorized`.

Common error response:

```json
{
  "error": "error_code",
  "message": "Human-readable description"
}
```

Common error codes include `unauthorized`, `invalid_request`, `invalid_json`, `task_not_found`, `not_found`, `tmdb_key_missing`, `tmdb_auth_failed`, and `tmdb_fetch_failed`.

### 4.1 Tasks

#### GET `/tasks`

Returns all tasks for the authenticated user.

#### POST `/tasks`

Creates or updates a task.

Create:

```json
{
  "title": "Read news"
}
```

Set completion:

```json
{
  "op": "setCompleted",
  "taskId": "uuid",
  "completed": true
}
```

Set starred:

```json
{
  "op": "setStarred",
  "taskId": "uuid",
  "starred": true
}
```

Rename:

```json
{
  "op": "rename",
  "taskId": "uuid",
  "title": "New title"
}
```

#### DELETE `/tasks/{id}`

Deletes one task owned by the authenticated user.

#### PATCH `/tasks/{id}`

Compatibility endpoint for updating `completed`; the current frontend uses `POST /tasks` operations instead.

### 4.2 News

#### GET `/news`

Returns aggregated RSS news:

```json
{
  "items": [
    {
      "title": "News title",
      "url": "https://example.com/news",
      "source": "BBC News",
      "published": "2026-06-05T12:00:00+00:00"
    }
  ]
}
```

The route intentionally returns HTTP 200 with `degraded: true` when RSS fetching fails, allowing the frontend to fall back gracefully.

### 4.3 Movies

#### GET `/movies`

Query parameters:

- `region`: two-letter region code such as `CA` or `US`.
- `category`: `now`, `now_playing`, `playing`, `upcoming`, `coming`, or `coming_soon`.
- `page`: page number from 1 to 500.

Example:

```text
GET /movies?region=CA&category=now&page=1
```

## 5. External Services

- Amazon S3 for static frontend assets.
- Amazon CloudFront for HTTPS frontend delivery and cache.
- API Gateway HTTP API for backend access.
- Amazon Cognito for authentication and JWTs.
- AWS Lambda for backend logic.
- Amazon DynamoDB for task persistence.
- TMDB for movie data.
- Open-Meteo Forecast API for weather.
- Open-Meteo Geocoding API for city search.
- OpenStreetMap Nominatim for reverse geocoding.
- RSS feeds and optional RSS proxy services for news fallback.

## 6. Configuration

### 6.1 Frontend Config

`frontend/config.js`:

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

Browser local storage:

- `todoApp_taskFilter`
- `todoApp_theme`
- `todoApp_weatherCity`

Browser session storage:

- `todoApp_authTokens`
- `todoApp_pkce`
- `todoApp_oauthState`

### 6.2 Lambda Environment Variables

- `TASKS_TABLE_NAME`: DynamoDB table name.
- `TMDB_API_KEY`: required for movie data.
- `TMDB_BASE_URL`: optional, defaults to `https://api.themoviedb.org/3`.
- `TMDB_IMAGE_BASE_URL`: optional, defaults to `https://image.tmdb.org/t/p/w342`.

## 7. Development and Testing

Local validation:

```bash
python3 -m unittest discover -s tests
python3 -m py_compile backend/lambda_function.py tests/test_lambda_auth.py tests/test_frontend_auth.py
node --check frontend/app.js
sam validate --template-file infra/template.yaml
sam build --template-file infra/template.yaml
```

Local frontend:

```bash
cd frontend
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

## 8. CI/CD

GitHub Actions workflows:

- `CI`: tests, Python compile checks, frontend JavaScript syntax check, `sam validate`, and `sam build`.
- `Deploy Backend`: manual SAM deployment for Cognito, API Gateway, Lambda, and DynamoDB.
- `Deploy Frontend`: manual S3 sync for frontend assets and CloudFront cache invalidation.

Required repository secrets:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
TMDB_API_KEY
```

For production CloudFront URLs, Cognito callback and logout URLs must use HTTPS. `http://` is valid only for localhost development.

## 9. Deployment

Backend:

```bash
sam build --template-file infra/template.yaml
sam deploy --guided
```

Frontend:

```bash
aws s3 sync frontend/ s3://<frontend-bucket> --exclude "config.example.js"
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"
```

The GitHub Actions workflows automate both flows.

## 10. Error Handling and Degradation

- Task API failures show user-visible errors without breaking the page.
- Expired or invalid sessions return the user to signed-out state.
- News falls back to client-side RSS proxy loading when backend aggregation degrades.
- Missing `TMDB_API_KEY` returns a clear backend error.
- Weather errors are shown inside the weather card.
- Geolocation denial still allows manual city search.
- Motion effects respect reduced-motion preferences.

## 11. Current Limitations

- Authentication uses Cognito Hosted UI rather than a custom login form.
- Tokens are stored in `sessionStorage`.
- News stability depends on external RSS feeds.
- Movie data requires TMDB availability and a valid API key.
- Weather is fetched directly from third-party APIs by the browser.
- Movie cache is in-memory per Lambda execution environment.

## 12. Future Improvements

- Add task due dates, priorities, tags, or dashboard summaries.
- Add backend caching for news and movies.
- Add CloudWatch structured logs, request IDs, metrics, and alarms.
- Replace static AWS keys in GitHub Actions with GitHub OIDC federation.
- Add end-to-end browser tests for sign-in and task flows.
