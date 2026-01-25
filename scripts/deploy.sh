#!/bin/bash
#
# Unified Deployment Script
#
# Usage: ./scripts/deploy.sh [TARGET]
#
# Targets:
#   vercel     - Deploy API/web to Vercel (default)
#   cloudrun   - Deploy worker to Cloud Run
#   all        - Deploy both Vercel and Cloud Run
#   verify     - Run smoke tests against deployed services
#
# Examples:
#   ./scripts/deploy.sh vercel              # Deploy to Vercel
#   ./scripts/deploy.sh cloudrun us-central1 my-project  # Deploy to Cloud Run
#   ./scripts/deploy.sh all                 # Deploy both
#   ./scripts/deploy.sh verify              # Run smoke tests
#

set -e

# Configuration
TARGET=${1:-"vercel"}
REGION=${2:-"us-central1"}
PROJECT_ID=${3:-$(gcloud config get-value project 2>/dev/null)}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Deploy to Vercel
deploy_vercel() {
  log_info "Deploying to Vercel..."

  if ! command -v vercel &> /dev/null; then
    log_warn "Vercel CLI not found. Installing..."
    npm install -g vercel
  fi

  # Run pre-deployment checks
  npm run typecheck

  # Deploy
  vercel --prod

  log_info "Vercel deployment complete."
}

# Deploy to Cloud Run
deploy_cloudrun() {
  log_info "Deploying to Cloud Run..."

  if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI is not installed. Please install Google Cloud SDK."
    exit 1
  fi

  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker."
    exit 1
  fi

  if [ -z "$PROJECT_ID" ]; then
    log_error "Project ID not specified. Please provide as argument or set in gcloud config."
    exit 1
  fi

  # Build and push Docker image
  log_info "Building Docker image..."
  docker build -t "gcr.io/${PROJECT_ID}/reel-content-worker:latest" .

  log_info "Pushing Docker image..."
  docker push "gcr.io/${PROJECT_ID}/reel-content-worker:latest"

  # Enable required services
  gcloud services enable run.googleapis.com --project="$PROJECT_ID" 2>/dev/null || true

  # Deploy to Cloud Run
  log_info "Deploying to Cloud Run..."
  gcloud run deploy "reel-content-worker" \
    --image "gcr.io/${PROJECT_ID}/reel-content-worker:latest" \
    --platform managed \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 10 \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300s \
    --concurrency 10

  log_info "Cloud Run deployment complete."

  # Get the service URL
  SERVICE_URL=$(gcloud run services describe "reel-content-worker" \
    --platform managed \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --format 'value(status.url)')

  log_info "Worker service URL: $SERVICE_URL"
}

# Run smoke tests
run_smoke_tests() {
  log_info "Running smoke tests..."

  # Get Vercel URL if available
  VERCEL_URL=${VERCEL_URL:-""}

  if [ -n "$VERCEL_URL" ]; then
    log_info "Testing Vercel deployment: https://${VERCEL_URL}"
    API_URL="https://${VERCEL_URL}" npm run test:smoke
  else
    log_warn "VERCEL_URL not set. Skipping Vercel smoke tests."
  fi

  log_info "Smoke tests completed."
}

# Print usage
usage() {
  echo "Usage: $0 [TARGET] [REGION] [PROJECT_ID]"
  echo ""
  echo "Targets:"
  echo "  vercel    - Deploy API/web to Vercel (default)"
  echo "  cloudrun  - Deploy worker to Cloud Run"
  echo "  all       - Deploy both Vercel and Cloud Run"
  echo "  verify    - Run smoke tests"
  echo ""
  echo "Examples:"
  echo "  $0 vercel"
  echo "  $0 cloudrun us-central1 my-project"
  echo "  $0 all"
  echo "  $0 verify"
}

# Main execution
main() {
  echo "=============================================="
  echo "  ReelContent Unified Deployment"
  echo "=============================================="
  echo ""

  case "$TARGET" in
    vercel)
      deploy_vercel
      ;;
    cloudrun)
      deploy_cloudrun
      ;;
    all)
      deploy_vercel
      echo ""
      deploy_cloudrun
      echo ""
      run_smoke_tests
      ;;
    verify)
      run_smoke_tests
      ;;
    help|--help|-h)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown target: $TARGET"
      usage
      exit 1
      ;;
  esac

  echo ""
  log_info "Deployment completed successfully!"
}

# Run main function
main "$@"
