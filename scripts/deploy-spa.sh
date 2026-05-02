#!/usr/bin/env bash
# deploy-spa.sh — Build and publish the SPA to S3 + invalidate CloudFront.
#
# Usage:
#   ./scripts/deploy-spa.sh dev
#   ./scripts/deploy-spa.sh prod
#
# Requires: aws CLI, jq, terraform output available in infra/

set -euo pipefail

ENV="${1:-dev}"
ACCOUNT_ID="818371815071"
SPA_BUCKET="scripture-journal-spa-${ACCOUNT_ID}-${ENV}"

# Resolve CloudFront distribution ID from Terraform outputs
DISTRIBUTION_ID=$(terraform -chdir=infra output -raw cloudfront_distribution_id 2>/dev/null)
if [[ -z "$DISTRIBUTION_ID" ]]; then
  echo "ERROR: Could not read cloudfront_distribution_id from terraform output."
  exit 1
fi

echo "Deploying SPA to ${ENV}..."
echo "  Bucket: ${SPA_BUCKET}"
echo "  CloudFront: ${DISTRIBUTION_ID}"
echo ""

# 1. Build
echo "→ Building SPA..."
npm run build

# 2. Upload hashed assets with immutable cache (1 year)
#    Vite content-hashes all JS/CSS filenames — they can be cached forever.
echo "→ Syncing hashed assets (Cache-Control: public, max-age=31536000, immutable)..."
aws s3 sync dist/spa/assets/ "s3://${SPA_BUCKET}/assets/" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete

# 3. Upload index.html with no-cache (always revalidate)
#    index.html is not content-hashed — browsers must revalidate on every load
#    so they pick up the latest JS/CSS bundle references after a deploy.
echo "→ Uploading index.html (Cache-Control: no-cache)..."
aws s3 cp dist/spa/index.html "s3://${SPA_BUCKET}/index.html" \
  --cache-control "no-cache" \
  --content-type "text/html"

# 4. Invalidate CloudFront cache
#    Only index.html needs invalidation — hashed assets have new names each deploy.
echo "→ Invalidating CloudFront cache for /index.html..."
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/index.html" \
  --query "Invalidation.Id" \
  --output text

echo ""
echo "✓ SPA deployed to https://notes.xzvf.mobi"
