// aws/lambda/adminLotStatus/index.mjs
// POST   /admin/lot-status – manually set a lot's status (available/partial/full)
// DELETE /admin/lot-status?lotName=... – remove the manual override

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const db  = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

const TABLE         = process.env.TABLE_NAME    || "ParkingReports";
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
};

export const handler = async (event) => {
  console.log("AdminLotStatus event:", JSON.stringify(event));

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    // POST /admin/lot-status  { lotName, status: available|partial|full }
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const lotName = body.lotName?.trim();
      const status  = body.status?.trim();

      if (!lotName || !status) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: "lotName and status are required" }),
        };
      }

      if (!["available", "partial", "full"].includes(status)) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: "Invalid status. Use available, partial, or full." }),
        };
      }

      const reportId = `admin#${lotName}`;
      const now = new Date().toISOString();
      const statusData = mapStatusToReportFields(status);

      const item = {
        reportId,
        area: lotName,
        availabilityLevel: statusData.availabilityLevel,
        computedStatus: statusData.computedStatus,
        reliabilityScore: 100,
        confirmCount: statusData.confirmCount,
        rejectCount: statusData.rejectCount,
        userEmail: "admin@parkpulse.local",
        source: "admin-manual",
        createdAt: now,
        updatedAt: now,
        // Keeps the manual status for 24 hours so it doesn't linger forever.
        ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      };

      await db.send(new PutCommand({ TableName: TABLE, Item: item }));
      await sendToReliabilityQueue(reportId, "admin_manual_status");

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ message: "Manual lot status updated successfully", report: item }),
      };
    }

    // DELETE /admin/lot-status?lotName=...
    if (event.httpMethod === "DELETE") {
      const lotName =
        event.queryStringParameters?.lotName?.trim() ||
        JSON.parse(event.body || "{}")?.lotName?.trim();

      if (!lotName) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: "lotName is required" }),
        };
      }

      const reportId = `admin#${lotName}`;

      await db.send(new DeleteCommand({ TableName: TABLE, Key: { reportId } }));

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ message: "Manual lot status removed successfully", reportId, lotName }),
      };
    }

    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (err) {
    console.error("AdminLotStatus error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Internal server error", details: err.message }),
    };
  }
};

function mapStatusToReportFields(status) {
  if (status === "available") {
    return { availabilityLevel: "הרבה חניה פנויה", computedStatus: "available", confirmCount: 5, rejectCount: 0 };
  }
  if (status === "partial") {
    return { availabilityLevel: "קצת חניה פנויה", computedStatus: "partial", confirmCount: 2, rejectCount: 1 };
  }
  // full
  return { availabilityLevel: "אין חניה פנויה", computedStatus: "full", confirmCount: 0, rejectCount: 5 };
}

async function sendToReliabilityQueue(reportId, action) {
  if (!SQS_QUEUE_URL) {
    console.warn("SQS_QUEUE_URL is missing, skipping reliability queue");
    return;
  }
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ reportId, action, createdAt: new Date().toISOString() }),
    })
  );
}