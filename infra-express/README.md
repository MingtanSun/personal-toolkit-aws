# SubLens Express infrastructure

`template.yaml` defines the AWS resources used by the Dockerized Express backend:

- one Amazon Linux 2023 EC2 instance with an Elastic IP;
- one DynamoDB tasks table using on-demand billing;
- IAM access to the separately named subscriptions table;
- one private ECR repository with image scanning and a ten-image lifecycle limit;
- one private S3 bucket for temporary deployment sources;
- one CodeBuild project for Docker image builds;
- IAM roles, an instance profile, and an HTTP security group.

The application does not use nginx, Lambda, API Gateway, an Application Load Balancer, or a NAT Gateway. CloudFront forwards `/api/v1/*` to port 80 on the EC2 origin, which maps to port 3000 in the Express container.

## Deployment

The `.github/workflows/deploy-express.yml` workflow performs the application deployment:

1. Type-check and build the Express application.
2. Upload the backend source archive to the deployment bucket.
3. Ask CodeBuild to build and push a Docker image to ECR.
4. Use Systems Manager to run `deploy-container.sh` on EC2.
5. Replace the running container and inject its environment variables.
6. Verify the public `/health` endpoint.

The backend image creates a writable `/app/data` directory for its SQLite agent checkpoints. Deployment replaces the container without a volume mount, so conversation context and pending approvals reset each time. Subscription and task records remain in DynamoDB.

The workflow receives `DEEPSEEK_API_KEY` from GitHub Actions secrets. It is not stored in the repository or Docker image.

The default CloudFormation stack name is `clouddesk-express`; the older resource name is retained to avoid replacing working infrastructure when the frontend brand changed to SubLens.
