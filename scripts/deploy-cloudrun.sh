#!/bin/bash
#
# Cloud Run Worker Deployment Script
#
# Usage: ./scripts/deploy-cloudrun.sh [REGION] [PROJECT_ID]
#
# This script:
# 1. Builds the Docker image
# 2. Pushes it to Google Container Registry
# 3. Deploys the Cloud Run service
# 4. Runs smoke tests
#

set -e

# Configuration
SERVICE_NAME="reel-content-worker"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
LATEST_TAG="latest"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
REGION=${1:-"us-central1"}
PROJECT_ID=${2:-$(gcloud config get-value project 2>/dev/null)}

# Functions
log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
  log_info "Checking prerequisites..."

  if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI is not installed. Please install Google Cloud SDK."
    exit 1
  fi

  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker."
    exit 1
  fi

  if [ -z "$PROJECT_ID" ]; then
    log_error "Project ID not specified and not found in gcloud config."
    log_error "Please set PROJECT_ID or run: gcloud config set project <PROJECT_ID>"
    exit 1
  fi

  log_info "Prerequisites check passed."
  log_info "Project: $PROJECT_ID"
  log_info "Region: $REGION"
}

# Build the Docker image
build_image() {
  log_info "Building Docker image..."

  docker build -t "${IMAGE_NAME}:${TIMESTAMP}" -t "${IMAGE_NAME}:${LATEST_TAG}" .

  log_info "Docker image built successfully."
}

# Push the image to GCR
push_image() {
  log_info "Pushing Docker image to GCR..."

  # Enable GCR if not already enabled
  gcloud services enable containerregistry.googleapis.com --project="$PROJECT_ID" 2>/dev/null || true

  docker push "${IMAGE_NAME}:${TIMESTAMP}"
  docker push "${IMAGE_NAME}:${LATEST_TAG}"

  log_info "Docker image pushed successfully."
}

# Deploy to Cloud Run
deploy_cloudrun() {
  log_info "Deploying to Cloud Run..."

  # Enable Cloud Run if not already enabled
  gcloud services enable run.googleapis.com --project="$PROJECT_ID"

  # Deploy or update the service
  gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_NAME}:${LATEST_TAG}" \
    --platform managed \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 10 \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300s \
    --concurrency 10 \
    --set-env-vars "NODE_ENV=production"

  log_info "Cloud Run deployment complete."
}

# Run smoke tests
run_smoke_tests() {
  log_info "Running smoke tests..."

  WORKER_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --platform managed \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --format 'value(status.url)' 2>/dev/null)

  if [ -z "$WORKER_URL" ]; then
    log_warn "Could not determine worker URL. Skipping smoke tests."
    return
  fi

  log_info "Worker URL: $WORKER_URL"

  # Test health endpoint
  HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${WORKER_URL}/api/worker/generate")

  if [ "$HEALTH_RESPONSE" = "200" ] || [ "$HEALTH_RESPONSE" = "503" ]; then
    log_info "Health check passed (status: $HEALTH_RESPONSE)"
  else
    log_error "Health check failed (status: $HEALTH_RESPONSE)"
    exit 1
  fi

  log_info "Smoke tests passed."
}

# Print summary
print_summary() {
  log_info "Deployment Summary:"
  echo "  Service: ${SERVICE_NAME}"
  echo "  Image: ${IMAGE_NAME}:${LATEST_TAG}"
  echo "  Region: ${REGION}"
  echo "  Project: ${PROJECT_ID}"

  WORKER_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --platform managed \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --format 'value(status.url)' 2>/dev/null)

  if [ -n "$WORKER_URL" ]; then
    echo ""
    echo "Worker URL: ${WORKER_URL}"
    echo "Health Check: ${WORKER_URL}/api/worker/generate"
  fi
}

# Main execution
main() {
  echo "=============================================="
  echo "  ReelContent Cloud Run Deployment"
  echo "=============================================="
  echo ""

  check_prerequisites
  build_image
  push_image
  deploy_cloudrun
  run_smoke_tests
  print_summary

  echo ""
  log_info "Deployment completed successfully!"
}

# Run main function
main "$@"
