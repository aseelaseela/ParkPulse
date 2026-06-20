// lambda/postFeedback/index.mjs
// POST /feedback – confirm or reject a parking report

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || "ParkingReports";
const STATS_TABLE = process.env.USER_STATS_TABLE || "UserStats";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { reportId, action, voterEmail } = body;

    if (!reportId || !["confirm", "reject"].includes(action)) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: "reportId and action (confirm|reject) required" }),
      };
    }

    const existing = await client.send(
      new GetCommand({ TableName: TABLE, Key: { reportId } })
    );

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: CORS,
        body: JSON.stringify({ error: "Report not found" }),
      };
    }

    const report = existing.Item;
    const reporterEmail = report.userEmail?.trim().toLowerCase();
    if (
  voterEmail &&
  reporterEmail &&
  voterEmail.trim().toLowerCase() === reporterEmail
) {
  return {
    statusCode: 403,
    headers: CORS,
    body: JSON.stringify({
      error: "לא ניתן לאשר או לדחות דיווח של עצמך"
    }),
  };
}

    const counterField = action === "confirm" ? "confirmCount" : "rejectCount";

    const result = await client.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { reportId },
        UpdateExpression: `SET #counter = if_not_exists(#counter, :zero) + :one`,
        ExpressionAttributeNames: { "#counter": counterField },
        ExpressionAttributeValues: { ":zero": 0, ":one": 1 },
        ReturnValues: "ALL_NEW",
      })
    );

    if (reporterEmail) {
      const statsField = action === "confirm" ? "totalConfirms" : "totalRejects";

      await client.send(
        new UpdateCommand({
          TableName: STATS_TABLE,
          Key: { email: reporterEmail },
          UpdateExpression: `
            SET #field = if_not_exists(#field, :zero) + :one,
                updatedAt = :now
          `,
          ExpressionAttributeNames: {
            "#field": statsField,
          },
          ExpressionAttributeValues: {
            ":zero": 0,
            ":one": 1,
            ":now": new Date().toISOString(),
          },
        })
      );
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(result.Attributes),
    };
  } catch (err) {
    console.error("postFeedback error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
