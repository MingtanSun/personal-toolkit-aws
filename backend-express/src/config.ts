import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  awsRegion: process.env.AWS_REGION || "us-east-2",
  tasksTableName: required("TASKS_TABLE_NAME"),
  subscriptionsTableName: required('SUBSCRIPTIONS_TABLE_NAME'),
  cognitoUserPoolId: required("COGNITO_USER_POOL_ID"),
  cognitoClientId: required("COGNITO_CLIENT_ID"),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:8000",
  deepseekApiKey: required("DEEPSEEK_API_KEY"),
  pineconeApiKey: required("PINECONE_API_KEY"),
};
