# ParkPulse – Installation & Deployment Guide

## Architecture Overview

```
Browser (S3 static website)
    │
    │ HTTP/HTTPS (Cognito SDK)
    ▼
Cognito User Pool  ──── validates login + issues JWT ────▶ browser
    │
    │ HTTPS + JWT (client-side validation only)
    ▼
API Gateway (Prod stage)
    ├── GET    /reports       → Lambda: getReports
    ├── POST   /reports       → Lambda: postReport       ──▶ SQS
    ├── POST   /feedback      → Lambda: postFeedback     ──▶ SQS
    ├── GET    /user-stats    → Lambda: getUserStats
    ├── GET    /admin/stats   → Lambda: adminStats
    └── POST   /subscribe     → Lambda: subscribeAlert   ──▶ SNS
        DELETE /subscribe
                                    │
                                    ▼
                              DynamoDB Tables
                              ├── ParkingReports  (TTL 2 h)
                              ├── UserStats
                              └── LotAlerts
                                    │
                                    ▼
                              SQS Queue  ──▶  Lambda: reliabilityProcessor
                                                    │
                                                    ▼
                                               SNS Topic  ──▶  email
```

All AWS infrastructure is defined in `aws/template.yaml` (AWS SAM / CloudFormation).

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| AWS CLI | ≥ 2.x | https://aws.amazon.com/cli/ |
| AWS SAM CLI | ≥ 1.100 | https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html |
| Node.js | ≥ 20 | https://nodejs.org/ |
| npm | ≥ 10 | bundled with Node |

Configure AWS credentials for the target account before proceeding:

```bash
aws configure
# AWS Access Key ID:     <your key>
# AWS Secret Access Key: <your secret>
# Default region name:   us-east-1
# Default output format: json
```

---

## Option A — Fully Automated (Recommended)

A single script handles every step end-to-end.

```bash
chmod +x deploy.sh
./deploy.sh
```

The script:
1. Validates all prerequisites.
2. Runs `sam build` + `sam deploy` (creates all AWS resources).
3. Reads the stack outputs and writes a `.env` file automatically.
4. Creates the S3 static-website bucket.
5. Updates the Cognito App Client callback URL to the live S3 URL.
6. Runs `npm install` + `npm run build`.
7. Uploads `dist/` to S3.
8. Prints the live app URL.

Total time on a clean account: **~5–8 minutes**.

---

## Option B — Manual Step-by-Step

Use this if you want to understand each step or need to customise the deployment.

### Step 1 — Deploy the Backend (SAM)

```bash
cd aws

# Compile Lambda source files
sam build --parallel

# First-time deploy — interactive
sam deploy \
  --stack-name parkpulse \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --parameter-overrides "CognitoCallbackURL=http://localhost:5173"

# Subsequent updates
sam deploy
```

SAM creates:
- **IAM Role** for all Lambda functions (no LabRole dependency)
- **Cognito User Pool** + App Client (frontend uses the Cognito JavaScript SDK directly)
- **API Gateway** with CORS pre-configured
- **7 Lambda functions**
- **3 DynamoDB tables** (ParkingReports, UserStats, LotAlerts)
- **SQS queue** + dead-letter queue
- **SNS topic** for email alerts

After deploy, note the values printed under **Outputs**:

| Output key | Used as |
|------------|---------|
| `ApiUrl` | `VITE_API_BASE` in `.env` |
| `CognitoUserPoolId` | `VITE_COGNITO_USER_POOL_ID` in `.env` |
| `CognitoClientId` | `VITE_COGNITO_CLIENT_ID` in `.env` |

You can also retrieve them anytime:
```bash
aws cloudformation describe-stacks \
  --stack-name parkpulse \
  --query "Stacks[0].Outputs"
```

### Step 2 — Create the S3 Bucket

Replace `ACCOUNT_ID` with your 12-digit AWS account number.

```bash
BUCKET="parkpulse-web-ACCOUNT_ID"
REGION="us-east-1"

aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"

# Disable Block Public Access (required for static website hosting)
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Enable static website hosting
aws s3 website "s3://${BUCKET}" \
  --index-document index.html \
  --error-document index.html

# Apply a public-read bucket policy
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\":       \"PublicRead\",
    \"Effect\":    \"Allow\",
    \"Principal\": \"*\",
    \"Action\":    \"s3:GetObject\",
    \"Resource\":  \"arn:aws:s3:::${BUCKET}/*\"
  }]
}"
```

Your S3 website endpoint (HTTP only — for static hosting):
```
http://parkpulse-web-ACCOUNT_ID.s3-website-us-east-1.amazonaws.com
```

The frontend authenticates directly with Cognito through the JavaScript SDK, so no Hosted UI redirect URL or HTTPS callback configuration is required for the student project.

### Step 3 — Configure the Frontend

```bash
# Copy the template
cp .env.example .env
```

Edit `.env` and paste the values from Step 1:

```
VITE_API_BASE=https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/Prod
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 4 — Build the Frontend

```bash
npm install
npm run build
# Output: dist/
```

### Step 5 — Upload to S3

```bash
aws s3 sync dist/ "s3://parkpulse-web-ACCOUNT_ID" --delete
```

The app is now live at the S3 website URL from Step 2.

---

## Local Development

```bash
cp .env.example .env
# Fill in .env with real values from a deployed backend (or a local mock)

npm install
npm run dev
# Vite starts at http://localhost:5173
# The frontend authenticates directly with Cognito using the JavaScript SDK, so localhost and S3 HTTP hosting both work.
```

---

## Environment Variables Reference

### Frontend (`VITE_*` — Vite injects these at build time)

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `VITE_API_BASE` | API Gateway base URL (no trailing slash) | SAM output `ApiUrl` |
| `VITE_COGNITO_USER_POOL_ID` | Cognito User Pool ID | SAM output `CognitoUserPoolId` |
| `VITE_COGNITO_CLIENT_ID` | Cognito App Client ID | SAM output `CognitoClientId` |

### Lambda (set automatically by CloudFormation via the `Globals` section)

| Variable | Description |
|----------|-------------|
| `TABLE_NAME` | DynamoDB reports table name |
| `USER_STATS_TABLE` | DynamoDB user stats table name |
| `ALERTS_TABLE` | DynamoDB lot alerts table name |
| `SQS_QUEUE_URL` | SQS reliability queue URL |
| `SNS_TOPIC_ARN` | SNS topic ARN for email alerts |

---

## DynamoDB TTL

Reports expire automatically after **2 hours** (configurable via `TTL_SECONDS` in `aws/lambda/postReport/index.mjs`). DynamoDB TTL deletion can lag by up to ~48 minutes; `getReports` applies a belt-and-suspenders filter in the `ScanCommand` to exclude stale items immediately.

---

## Teardown

To remove all resources from the account:

```bash
chmod +x teardown.sh
./teardown.sh
```

Or manually:

```bash
aws s3 rb s3://parkpulse-web-ACCOUNT_ID --force
aws cloudformation delete-stack --stack-name parkpulse --region us-east-1
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Login loop / redirect error | Cognito callback URL mismatch | Re-run Step 3 with the correct S3 URL |
| `sam deploy` fails with `CAPABILITY_NAMED_IAM` | Missing capability flag | Add `--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM` |
| API returns 403 / CORS error | VITE_API_BASE points to wrong account | Check `.env`, rebuild, re-upload |
| Reports not appearing | TTL already expired | Reports are deleted after 2 hours; this is by design |
| SNS alert email not received | SNS subscription not confirmed | Check inbox for confirmation email from AWS and click the link |
