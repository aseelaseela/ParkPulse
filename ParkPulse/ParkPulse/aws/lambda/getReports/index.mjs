// lambda/getReports/index.mjs
// GET /reports – returns all non-expired reports from DynamoDB
// Adds reporter badge and reputation score from UserStats.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchGetCommand
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.TABLE_NAME || "ParkingReports";
const STATS_TABLE = process.env.USER_STATS_TABLE || "UserStats";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const BADGES = [
  { min: 50, badge: "🏆 אלוף החניה" },
  { min: 20, badge: "⭐ מדווח מנוסה" },
  { min: 5, badge: "🚗 מדווח" },
  { min: 0, badge: "🆕 חדש" },
];

function getReputationScore(totalReports, totalConfirms, totalRejects) {
  return Math.max(
    0,
    (totalReports || 0) +
      Math.floor((totalConfirms || 0) / 2) -
      (totalRejects || 0)
  );
}

function getBadge(score) {
  return BADGES.find((b) => score >= b.min)?.badge || "🆕 חדש";
}

export const handler = async () => {
  try {
    const now = Math.floor(Date.now() / 1000);

    const result = await client.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#ttl > :now",
        ExpressionAttributeNames: {
          "#ttl": "ttl",
        },
        ExpressionAttributeValues: {
          ":now": now,
        },
      })
    );

    const reports = result.Items || [];

    const emails = [
      ...new Set(
        reports
          .map((r) => r.userEmail?.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    let statsByEmail = {};

    if (emails.length > 0) {
      const statsResult = await client.send(
        new BatchGetCommand({
          RequestItems: {
            [STATS_TABLE]: {
              Keys: emails.map((email) => ({ email })),
            },
          },
        })
      );

      const statsItems =
        statsResult.Responses?.[STATS_TABLE] || [];

      statsByEmail = Object.fromEntries(
        statsItems.map((s) => [s.email, s])
      );
    }

    const items = reports
      .map((report) => {
        const email =
          report.userEmail?.trim().toLowerCase();

        const stats = statsByEmail[email] || {};

        const score = getReputationScore(
          stats.totalReports || 0,
          stats.totalConfirms || 0,
          stats.totalRejects || 0
        );

        return {
          ...report,
          reporterBadge: getBadge(score),
          reporterReputationScore: score,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(items),
    };
  } catch (err) {
    console.error("getReports error:", err);

    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        error: "Internal server error",
      }),
    };
  }
};
