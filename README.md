# ParkPulse - Smart Parking Reporting System

## Description

ParkPulse is a cloud-based smart parking reporting system designed for the Ariel University campus.

The system allows users to report parking availability, view live parking information, validate reports using community feedback, and receive email notifications when parking becomes available in selected parking areas.

The project uses a serverless AWS architecture with authentication, authorization, API endpoints, database storage, asynchronous processing, notifications, admin management tools, and automated deployment.

---

## Technologies

### Frontend

* React
* Vite
* JavaScript
* Leaflet

### AWS Cloud Services

* Amazon S3 Static Website Hosting
* Amazon Cognito Authentication
* Amazon API Gateway
* AWS Lambda Functions
* Amazon DynamoDB
* Amazon SQS
* Amazon SQS Dead-Letter Queue
* Amazon SNS Email Notifications
* AWS SAM / CloudFormation

---

## Main Features

### Authentication

* User registration
* Email verification
* Secure login
* Forgot password / password recovery
* Logout
* User and Admin authorization roles

### Parking System

* Submit parking availability reports
* View live parking reports
* Interactive campus parking map
* Parking status colors for each parking lot
* Select a parking lot directly from the map
* Automatic data refresh

### Community Feedback

* Users can confirm parking reports
* Users can reject parking reports
* Users cannot validate their own reports
* Duplicate vote prevention
* Vote toggle support
* Report reliability calculation based on confirmations and rejections

### User Statistics

* Number of submitted reports
* Confirmations received
* Rejections received
* User reputation calculation
* User badge / contribution level

### Smart Alerts

* Users can subscribe to parking availability alerts for selected parking lots
* For a new email subscription, AWS SNS sends a confirmation email that the user must approve before receiving notifications
* Each email address has one SNS subscription, and the system updates its SNS FilterPolicy according to all parking lots selected by the user
* Email notifications are sent when a processed report indicates that parking is available in a subscribed lot
* Users can unsubscribe from alerts

### Reliability Processing

* New reports are saved in DynamoDB
* Reports are sent to Amazon SQS for asynchronous processing
* A reliability processor Lambda consumes messages from SQS
* Reliability data is updated automatically
* Availability alerts are published through Amazon SNS when needed
* A Dead-Letter Queue is used for failed SQS messages

### Admin Features

* Separate Admin role
* Admin dashboard
* System statistics overview
* Parking reports monitoring
* Delete invalid or outdated reports
* Edit selected report fields
* Manually update parking lot status
* Clear manual parking lot status
* View and manage alert subscriptions

---

## Reputation System

User reputation is based on the quality of submitted reports.

The system considers:

* Reports created by the user
* Confirmations received from other users
* Rejections received from other users

Voting activity itself does not increase reputation.

This prevents users from gaining reputation by randomly confirming or rejecting reports.

---

## Project Structure

ParkPulse/
├── aws/
│   ├── lambda/
│   │   ├── adminAlerts/
│   │   ├── adminLotStatus/
│   │   ├── adminReports/
│   │   ├── adminStats/
│   │   ├── getReports/
│   │   ├── getUserStats/
│   │   ├── postFeedback/
│   │   ├── postReport/
│   │   ├── reliabilityProcessor/
│   │   └── subscribeAlert/
│   │
│   ├── openapi.yaml
│   ├── samconfig.toml
│   └── template.yaml
│
├── src/
│   ├── auth/
│   │   └── CognitoAuthCon .jsx
│   │
│   ├── components/
│   │   ├── AdminDashboard.jsx
│   │   ├── AlertSubscription.jsx
│   │   ├── AuthScreen.jsx
│   │   ├── ParkingMap.jsx
│   │   ├── ReportFeed.jsx
│   │   └── ReportPanel.jsx
│   │
│   ├── App.jsx
│   ├── App.css
│   └── main.jsx
│
├── .env.example
├── .gitignore
├── DEPLOY.md
├── deploy.sh
├── teardown.sh
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

---

## Architecture Summary

``` 
User Browser
    ↓
React Frontend hosted on Amazon S3
    ↓
Amazon API Gateway
    ↓
AWS Lambda Functions
    ↓
Amazon DynamoDB
```

Amazon Cognito manages user authentication and authorization.

When a user submits a parking report, the backend stores the report in DynamoDB and sends a message to Amazon SQS.

A reliability processor Lambda consumes messages from SQS, updates reliability information, and publishes parking availability notifications through Amazon SNS when needed.

Amazon SNS is used to send email notifications to subscribed users.

---

## Main Backend API Endpoints

The main API infrastructure is defined in:

``` 
aws/template.yaml
```

An OpenAPI reference file is also included in:

``` 
aws/openapi.yaml
```

Main endpoints:

``` 
GET    /reports
POST   /reports
POST   /feedback
GET    /user-stats
POST   /subscribe

GET    /admin/stats
DELETE /admin/reports/{reportId}
PATCH  /admin/reports/{reportId}
POST   /admin/lot-status
DELETE /admin/lot-status
GET    /admin/alerts
DELETE /admin/alerts
DELETE /admin/alerts/{subscriptionId}
```

The `/subscribe` endpoint supports both subscribing and unsubscribing.

To unsubscribe, the frontend sends:

```json
{
  "email": "user@example.com",
  "lotName": "Parking lot name",
  "action": "unsubscribe"
}
```

---

## Prerequisites

Before running or deploying the project, install:

* Node.js 20 or newer
* npm
* AWS CLI
* AWS SAM CLI
* An active AWS account
* AWS credentials configured locally

Configure AWS credentials:

```bash
aws configure
```

---

## Environment Variables

The frontend uses environment variables to connect to AWS resources.

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Example `.env` file:

```bash
VITE_API_BASE=https://your-api-id.execute-api.us-east-1.amazonaws.com/Prod
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=your-cognito-client-id
VITE_ADMIN_EMAILS=admin@example.com
```

Do not commit or submit real AWS credentials, tokens, passwords, or private environment files.

---

## Local Development

To run the frontend locally:

```bash
npm install
npm run dev
```

Open the local app:

``` 
http://localhost:5173
```

Important: local development requires valid AWS backend values in the `.env` file.

---

## Build Frontend

To build the frontend for production:

```bash
npm install
npm run build
```

The production build is created in:

``` 
dist/
```

---

## Deploy to AWS

The project includes an automated deployment script.

First, give execution permission:

```bash
chmod +x deploy.sh
```

Then run:

```bash
./deploy.sh
```

The deployment script performs the following actions:

1. Checks required tools.
2. Builds the backend using AWS SAM.
3. Deploys the AWS infrastructure using CloudFormation.
4. Reads the CloudFormation stack outputs.
5. Creates or updates the Cognito configuration.
6. Creates an Admin group and Admin user.
7. Writes the frontend `.env` file.
8. Builds the React frontend.
9. Creates or updates the S3 static website bucket.
10. Uploads the frontend build to S3.
11. Prints the final application URL.

By default, the deployment script creates a demo admin user:

``` 
admin@parkpulse.local
```

The default admin credentials are intended for project/demo deployment only.

To override the default admin user during deployment:

```bash
ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="StrongPassword123!" ./deploy.sh
```

Additional manual deployment instructions are available in:

``` 
DEPLOY.md
```

---

## AWS Resources Created

The deployment creates the following AWS resources:

* S3 bucket for static website hosting
* Cognito User Pool
* Cognito App Client
* Cognito Admin group
* API Gateway
* Lambda functions
* DynamoDB tables
* SQS reliability queue
* SQS Dead-Letter Queue
* SNS topic for parking alerts
* IAM roles and permissions

---

## Remove AWS Resources

To remove the deployed AWS resources:

```bash
chmod +x teardown.sh
./teardown.sh
```

This script removes the deployed stack and related resources created for the project.

---

## Submission Notes

The submitted ZIP file should include the project source code, AWS infrastructure files, OpenAPI reference file, deployment scripts, and this README file.

The submitted ZIP file should not include generated or unnecessary folders such as:

``` 
node_modules/
dist/
build/
.aws-sam/
.git/
.vscode/
```

Private files should also not be included, such as:

``` 
.env
AWS credentials
access keys
secret keys
tokens
real passwords
```

Instead, `.env.example` is included to document the required environment variables without exposing private values.

---

## Summary

ParkPulse provides a complete smart parking reporting platform for Ariel University.

The system combines real-time user reports, community validation, reliability scoring, email alerts, user reputation, and admin management tools.

The backend is fully serverless and is deployed using AWS SAM and CloudFormation.
