#!/usr/bin/env bash
# teardown.sh — Remove all ParkPulse AWS resources.
#
# Usage:
#   chmod +x teardown.sh
#   ./teardown.sh

set -euo pipefail

STACK_NAME="parkpulse"
REGION="us-east-1"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✔${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}   $*"; }

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="parkpulse-web-${ACCOUNT_ID}"

echo -e "${RED}This will permanently delete all ParkPulse AWS resources including:${NC}"
echo "  • CloudFormation stack '${STACK_NAME}' (all Lambdas, DynamoDB tables, SQS, SNS, Cognito)"
echo "  • S3 bucket '${BUCKET_NAME}' and all its contents"
echo ""
read -r -p "Type 'yes' to confirm: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 0; }

log "Emptying S3 bucket ${BUCKET_NAME}..."
aws s3 rb "s3://${BUCKET_NAME}" --force 2>/dev/null && ok "Bucket deleted." || warn "Bucket not found — skipping."

log "Deleting CloudFormation stack ${STACK_NAME}..."
aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"

log "Waiting for stack deletion..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"
ok "Stack deleted."

echo ""
echo -e "${GREEN}All ParkPulse resources removed.${NC}"
