// aws/lambda/adminAlerts/index.mjs
// GET    /admin/alerts                  – list all alert subscriptions
// DELETE /admin/alerts/{subscriptionId} – delete one subscription
// DELETE /admin/alerts?lotName=...      – delete all subscriptions for a lot

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, UnsubscribeCommand } from "@aws-sdk/client-sns";

const db  = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

const ALERTS_TABLE = process.env.ALERTS_TABLE || "LotAlerts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,DELETE,OPTIONS",
};

export const handler = async (event) => {
  console.log("AdminAlerts event:", JSON.stringify(event));

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    // GET /admin/alerts
    if (event.httpMethod === "GET") {
      const alerts = await scanAllAlerts();
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ alerts, count: alerts.length }),
      };
    }

    // DELETE /admin/alerts/{subscriptionId}
    if (event.httpMethod === "DELETE" && event.pathParameters?.subscriptionId) {
      const subscriptionId = decodeURIComponent(event.pathParameters.subscriptionId);

      const alerts = await scanAllAlerts();
      const alert = alerts.find((a) => a.subscriptionId === subscriptionId);

      if (!alert) {
        return {
          statusCode: 404,
          headers: CORS,
          body: JSON.stringify({ error: "Alert subscription not found", subscriptionId }),
        };
      }

      await unsubscribeFromSnsIfPossible(alert.snsArn);

      await db.send(
        new DeleteCommand({ TableName: ALERTS_TABLE, Key: { subscriptionId } })
      );

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ message: "Alert subscription deleted successfully", deleted: alert }),
      };
    }

    // DELETE /admin/alerts?lotName=...
    if (event.httpMethod === "DELETE") {
      const lotName =
        event.queryStringParameters?.lotName?.trim() ||
        JSON.parse(event.body || "{}")?.lotName?.trim();

      if (!lotName) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: "Missing lotName. Use DELETE /admin/alerts?lotName=..." }),
        };
      }

      const alerts = await scanAllAlerts();
      const matchingAlerts = alerts.filter((a) => a.lotName === lotName);

      for (const alert of matchingAlerts) {
        await unsubscribeFromSnsIfPossible(alert.snsArn);
        await db.send(
          new DeleteCommand({ TableName: ALERTS_TABLE, Key: { subscriptionId: alert.subscriptionId } })
        );
      }

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          message: "Alert subscriptions for lot deleted successfully",
          lotName,
          deletedCount: matchingAlerts.length,
        }),
      };
    }

    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (err) {
    console.error("AdminAlerts error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Internal server error", details: err.message }),
    };
  }
};

async function scanAllAlerts() {
  const alerts = [];
  let ExclusiveStartKey;
  do {
    const result = await db.send(new ScanCommand({ TableName: ALERTS_TABLE, ExclusiveStartKey }));
    alerts.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return alerts;
}

async function unsubscribeFromSnsIfPossible(snsArn) {
  // If the user hasn't confirmed the email subscription yet, SNS stores it
  // as "PendingConfirmation" and it can't be unsubscribed by ARN.
  if (!snsArn || snsArn === "PendingConfirmation") {
    console.warn("Skipping SNS unsubscribe, subscription is pending or missing");
    return;
  }
  if (!snsArn.startsWith("arn:aws:sns:")) {
    console.warn("Skipping SNS unsubscribe, invalid SNS ARN:", snsArn);
    return;
  }
  await sns.send(new UnsubscribeCommand({ SubscriptionArn: snsArn }));
}