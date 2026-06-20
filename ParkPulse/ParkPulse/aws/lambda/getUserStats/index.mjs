// lambda/getUserStats/index.mjs

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const STATS_TABLE =
  process.env.USER_STATS_TABLE || "UserStats";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

const BADGES = [
  { min: 50, badge: "🏆 אלוף החניה" },
  { min: 20, badge: "⭐ מדווח מנוסה" },
  { min: 5, badge: "🚗 מדווח" },
  { min: 0, badge: "🆕 חדש" },
];

function getReputationScore(
  totalReports,
  totalConfirms,
  totalRejects
) {
  return Math.max(
    0,
    totalReports +
      Math.floor(totalConfirms / 2) -
      totalRejects
  );
}

function getBadge(score) {
  return (
    BADGES.find((b) => score >= b.min)?.badge ||
    "🆕 חדש"
  );
}

export const handler = async (event) => {
  const email =
    event.queryStringParameters?.email
      ?.trim()
      .toLowerCase();

  if (!email) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({
        error: "email required",
      }),
    };
  }

  try {
    const result = await client.send(
      new GetCommand({
        TableName: STATS_TABLE,
        Key: { email },
      })
    );

    const stats = result.Item || {};

    const totalReports =
      stats.totalReports || 0;

    const totalConfirms =
      stats.totalConfirms || 0;

    const totalRejects =
      stats.totalRejects || 0;

    const reputationScore =
      getReputationScore(
        totalReports,
        totalConfirms,
        totalRejects
      );

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        email,
        totalReports,
        totalConfirms,
        totalRejects,
        reputationScore,
        badge: getBadge(reputationScore),
      }),
    };

  } catch (err) {
    console.error(
      "getUserStats error:",
      err
    );

    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        error: "server error",
      }),
    };
  }
};
