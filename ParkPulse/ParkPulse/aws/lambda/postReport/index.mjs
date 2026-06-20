// lambda/postReport/index.mjs
// POST /reports – creates a new parking report with TTL
// Prevents the same user from creating multiple active reports for the same parking lot.
// After saving the report, sends a message to SQS so reliabilityProcessor can publish SNS alerts.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

const TABLE = process.env.TABLE_NAME || "ParkingReports";
const STATS_TABLE = process.env.USER_STATS_TABLE || "UserStats";
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || "";

const TTL_SECONDS = 2 * 60 * 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export const handler = async (event) => {
  console.log("PostReport event:", JSON.stringify(event));

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS,
      body: "",
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const area = body.area;
    const availabilityLevel = body.availabilityLevel;
    const userEmail = body.userEmail?.trim().toLowerCase();

    if (!area || !availabilityLevel || !userEmail) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({
          error: "area, availabilityLevel and userEmail are required",
        }),
      };
    }

    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const ttl = nowSeconds + TTL_SECONDS;

    const existing = await client.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "userEmail = :email AND area = :area AND #ttl > :now",
        ExpressionAttributeNames: {
          "#ttl": "ttl",
        },
        ExpressionAttributeValues: {
          ":email": userEmail,
          ":area": area,
          ":now": nowSeconds,
        },
      })
    );

    if ((existing.Items || []).length > 0) {
      return {
        statusCode: 409,
        headers: CORS,
        body: JSON.stringify({
          error: "כבר יש לך דיווח פעיל לחניון הזה",
        }),
      };
    }

    const item = {
      reportId: randomUUID(),
      area,
      lotName: area,
      availabilityLevel,
      userEmail,
      status: "active",
      confirmCount: 0,
      rejectCount: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ttl,
    };

    // 1. Save report to DynamoDB
    await client.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
      })
    );

    // 2. Update user stats
    await updateUserStats(userEmail);

    // 3. Send report to SQS so reliabilityProcessor can decide whether to publish SNS alert
    if (SQS_QUEUE_URL) {
      try {
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: SQS_QUEUE_URL,
            MessageBody: JSON.stringify({
              reportId: item.reportId,
              area: item.area,
              lotName: item.area,
              availabilityLevel: item.availabilityLevel,
              userEmail: item.userEmail,
              createdAt: item.createdAt,
            }),
          })
        );

        console.log("Report sent to SQS:", item.reportId);
      } catch (sqsErr) {
        console.error("Failed to send report to SQS:", sqsErr);
      }
    } else {
      console.warn("SQS_QUEUE_URL is missing. Report was saved, but no alert workflow was triggered.");
    }

    return {
      statusCode: 201,
      headers: CORS,
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.error("postReport error:", err);

    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        error: "Internal server error",
        details: err.message,
      }),
    };
  }
};

async function updateUserStats(email) {
  await client.send(
    new UpdateCommand({
      TableName: STATS_TABLE,
      Key: { email },
      UpdateExpression:
        "SET totalReports = if_not_exists(totalReports, :zero) + :one, updatedAt = :now",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":one": 1,
        ":now": new Date().toISOString(),
      },
    })
  );
}