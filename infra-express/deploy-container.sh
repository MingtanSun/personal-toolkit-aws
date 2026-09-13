#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 10 ]]; then
  echo "Usage: deploy-container.sh <repository-uri> <image-tag> <region> <tasks-table> <subscriptions-table> <user-pool> <client-id> <cors-origin> <deepseek-api-key> <pinecone-api-key>"
  exit 2
fi

repository_uri="$1"
image_tag="$2"
aws_region="$3"
tasks_table="$4"
subscriptions_table="$5"
cognito_user_pool_id="$6"
cognito_client_id="$7"
cors_origin="$8"
deepseek_api_key="$9"
pinecone_api_key="${10}"
registry="${repository_uri%%/*}"

aws ecr get-login-password --region "$aws_region" \
  | docker login --username AWS --password-stdin "$registry"

docker pull "$repository_uri:$image_tag"
docker rm -f clouddesk-api >/dev/null 2>&1 || true
docker run -d \
  --name clouddesk-api \
  --restart unless-stopped \
  -p 80:3000 \
  -e AWS_REGION="$aws_region" \
  -e TASKS_TABLE_NAME="$tasks_table" \
  -e SUBSCRIPTIONS_TABLE_NAME="$subscriptions_table" \
  -e COGNITO_USER_POOL_ID="$cognito_user_pool_id" \
  -e COGNITO_CLIENT_ID="$cognito_client_id" \
  -e CORS_ORIGIN="$cors_origin" \
  -e DEEPSEEK_API_KEY="$deepseek_api_key" \
  -e PINECONE_API_KEY="$pinecone_api_key" \
  "$repository_uri:$image_tag"

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1/health >/dev/null; then
    docker image prune --force >/dev/null
    echo "CloudDesk API deployment is healthy."
    exit 0
  fi
  sleep 2
done

docker logs clouddesk-api
exit 1
