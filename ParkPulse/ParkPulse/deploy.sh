#!/usr/bin/env bash
# deploy.sh — Full automated deployment for ParkPulse on a clean AWS account.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Optional admin override:
#   ADMIN_EMAIL="your@email.com" ADMIN_PASSWORD="YourPass123!" ./deploy.sh
#
# What this script does:
#   1. Validates prerequisites
#   2. Deploys backend with SAM
#   3. Reads CloudFormation outputs
#   4. Automatically creates Admin group + Admin user in Cognito
#   5. Writes .env automatically
#   6. Builds React frontend
#   7. Creates/updates S3 static website bucket
#   8. Uploads frontend to S3
#   9. Prints live URL + admin credentials

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
STACK_NAME="parkpulse"
REGION="us-east-1"
BUCKET_BASE="parkpulse-web"

# Default admin user.
# You can override when running:
# ADMIN_EMAIL="aseel@example.com" ADMIN_PASSWORD="Admin12345!" ./deploy.sh
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@parkpulse.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin12345!}"

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✔${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}   $*"; }
die()  { echo -e "${RED}✖${NC}  $*" >&2; exit 1; }

# ── 0. Prerequisites ──────────────────────────────────────────────────────────
log "Checking prerequisites..."

command -v aws  &>/dev/null || die "aws CLI not found."
command -v sam  &>/dev/null || die "sam CLI not found."
command -v node &>/dev/null || die "Node.js not found."
command -v npm  &>/dev/null || die "npm not found."

NODE_MAJOR=$(node -e "process.stdout.write(String(process.version.match(/^v(\d+)/)[1]))")
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js 20+ required. Found: $(node --version)"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
  || die "AWS credentials not configured."

BUCKET_NAME="${BUCKET_BASE}-${ACCOUNT_ID}"

ok "AWS account: $ACCOUNT_ID  |  bucket: $BUCKET_NAME"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Backend: SAM build + deploy ────────────────────────────────────────────
log "Building Lambda functions with SAM..."

cd aws
sam build --parallel

log "Deploying backend stack '${STACK_NAME}' to ${REGION}..."

sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --s3-prefix "$STACK_NAME" \
  --no-confirm-changeset \
  --no-disable-rollback \
  --parameter-overrides "CognitoCallbackURL=http://localhost:5173" \
  --no-fail-on-empty-changeset

ok "Backend deployed."

cd "$SCRIPT_DIR"

# ── 2. Read stack outputs ─────────────────────────────────────────────────────
log "Reading CloudFormation outputs..."

get_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

API_URL=$(get_output ApiUrl)
COGNITO_CLIENT_ID=$(get_output CognitoClientId)
USER_POOL_ID=$(get_output CognitoUserPoolId)

[ -n "$API_URL" ] || die "Could not read ApiUrl from stack outputs."
[ -n "$COGNITO_CLIENT_ID" ] || die "Could not read CognitoClientId from stack outputs."
[ -n "$USER_POOL_ID" ] || die "Could not read CognitoUserPoolId from stack outputs."

ok "API:          $API_URL"
ok "User Pool ID: $USER_POOL_ID"
ok "Client ID:    $COGNITO_CLIENT_ID"

# ── 2.5. Automatically create default Admin user ──────────────────────────────
log "Creating default Admin user in Cognito..."

aws cognito-idp create-group \
  --user-pool-id "$USER_POOL_ID" \
  --group-name Admin \
  --region "$REGION" \
  2>/dev/null || warn "Admin group already exists."

aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region "$REGION" \
  2>/dev/null || warn "Admin user already exists."

aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --password "$ADMIN_PASSWORD" \
  --permanent \
  --region "$REGION"

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --group-name Admin \
  --region "$REGION"

ok "Default Admin user is ready."
echo -e "  👤 Admin email:    ${BLUE}${ADMIN_EMAIL}${NC}"
echo -e "  🔐 Admin password: ${BLUE}${ADMIN_PASSWORD}${NC}"

# ── 3. Create / configure S3 bucket ───────────────────────────────────────────
log "Setting up S3 bucket: ${BUCKET_NAME}..."

if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
  warn "Bucket already exists — skipping creation."
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket \
      --bucket "$BUCKET_NAME" \
      --region "$REGION"
  else
    aws s3api create-bucket \
      --bucket "$BUCKET_NAME" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi

  ok "Bucket created."
fi

log "Configuring S3 static website hosting..."

aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

aws s3 website "s3://${BUCKET_NAME}" \
  --index-document index.html \
  --error-document index.html

aws s3api put-bucket-policy \
  --bucket "$BUCKET_NAME" \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"PublicRead\",
        \"Effect\": \"Allow\",
        \"Principal\": \"*\",
        \"Action\": \"s3:GetObject\",
        \"Resource\": \"arn:aws:s3:::${BUCKET_NAME}/*\"
      }
    ]
  }"

S3_URL="http://${BUCKET_NAME}.s3-website-${REGION}.amazonaws.com"

ok "S3 website URL: $S3_URL"

# ── 4. Write .env ─────────────────────────────────────────────────────────────
log "Writing frontend .env..."

cat > .env <<EOF
VITE_API_BASE=$API_URL
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
VITE_ADMIN_EMAILS=$ADMIN_EMAIL
EOF

ok ".env written."

# ── 5. Build frontend ─────────────────────────────────────────────────────────
log "Installing npm dependencies..."
npm install --prefer-offline

log "Building frontend..."
npm run build

ok "Frontend built."

# ── 6. Upload frontend to S3 ──────────────────────────────────────────────────
log "Uploading dist/ to s3://${BUCKET_NAME}..."

aws s3 sync dist/ "s3://${BUCKET_NAME}" --delete

ok "Upload complete."

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ParkPulse deployed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 App URL:        ${BLUE}${S3_URL}${NC}"
echo -e "  🔌 API URL:        ${BLUE}${API_URL}${NC}"
echo -e "  🔑 Client ID:      ${BLUE}${COGNITO_CLIENT_ID}${NC}"
echo ""
echo -e "  👤 Admin email:    ${BLUE}${ADMIN_EMAIL}${NC}"
echo -e "  🔐 Admin password: ${BLUE}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "  To teardown:"
echo -e "  ${YELLOW}aws cloudformation delete-stack --stack-name ${STACK_NAME} --region ${REGION}${NC}"
echo -e "  ${YELLOW}aws s3 rb s3://${BUCKET_NAME} --force${NC}"
echo ""