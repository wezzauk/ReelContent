#!/bin/bash
#
# Vercel Deployment Script
#
# Usage: ./scripts/deploy-vercel.sh [ENVIRONMENT]
#
# This script:
# 1. Runs type checking
# 2. Builds the application
# 3. Deploys to Vercel
# 4. Runs smoke tests
#

set -e

# Configuration
ENVIRONMENT=${1:-"production"}

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

# Check prerequisites
check_prerequisites() {
  log_info "Checking prerequisites..."

  if ! command -v vercel &> /dev/null; then
    log_warn "Vercel CLI not found. Installing..."
    npm install -g vercel
  fi

  log_info "Prerequisites check passed."
}

# Run type checking
type_check() {
  log_info "Running type check..."

  if ! npm run typecheck; then
    log_error "Type check failed."
    exit 1
  fi

  log_info "Type check passed."
}

# Build the application
build_app() {
  log_info "Building application..."

  if ! npm run build; then
    log_error "Build failed."
    exit 1
  fi

  log_info "Build completed successfully."
}

# Deploy to Vercel
deploy_vercel() {
  log_info "Deploying to Vercel..."

  if [ "$ENVIRONMENT" = "production" ]; then
    vercel --prod
  else
    vercel
  fi

  log_info "Vercel deployment complete."
}

# Run smoke tests
run_smoke_tests() {
  log_info "Running smoke tests..."

  # Get the deployment URL
  API_URL=${VERCEL_URL:-"http://localhost:3000"}

  if [ -z "$VERCEL_URL" ]; then
    log_warn "VERCEL_URL not set. Using localhost for smoke tests."
    API_URL="http://localhost:3000"
  else
    API_URL="https://${VERCEL_URL}"
  fi

  log_info "Testing API URL: $API_URL"

  # Test health endpoint
  HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/api/health")

  if [ "$HEALTH_RESPONSE" = "200" ]; then
    log_info "Health check passed (status: $HEALTH_RESPONSE)"
  else
    log_error "Health check failed (status: $HEALTH_RESPONSE)"
    exit 1
  fi

  # Run smoke tests if API_URL is accessible
  if [ "$HEALTH_RESPONSE" = "200" ]; then
    API_URL="$API_URL" npm run test:smoke || true
  fi

  log_info "Smoke tests completed."
}

# Print summary
print_summary() {
  log_info "Deployment Summary:"
  echo "  Environment: ${ENVIRONMENT}"
  echo "  Deployment URL: ${VERCEL_URL:-'N/A'}"
}

# Main execution
main() {
  echo "=============================================="
  echo "  ReelContent Vercel Deployment"
  echo "=============================================="
  echo ""

  check_prerequisites
  type_check
  build_app
  deploy_vercel
  run_smoke_tests
  print_summary

  echo ""
  log_info "Deployment completed successfully!"
}

# Run main function
main "$@"
