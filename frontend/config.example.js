window.APP_CONFIG = {
  API_URL: "https://your-api-id.execute-api.us-east-2.amazonaws.com/prod",
  AWS_REGION: "us-east-2",
  COGNITO_DOMAIN: "https://your-domain.auth.us-east-2.amazoncognito.com",
  COGNITO_CLIENT_ID: "your-cognito-app-client-id",
  COGNITO_REDIRECT_URI: window.location.origin + window.location.pathname,
  COGNITO_LOGOUT_URI: window.location.origin + window.location.pathname,
  COGNITO_SCOPES: ["openid", "email", "profile"]
};
