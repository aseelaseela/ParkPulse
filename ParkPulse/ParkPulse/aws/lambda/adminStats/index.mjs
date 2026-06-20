import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const REPORTS_TABLE = process.env.TABLE_NAME || "ParkingReports";
const USER_STATS_TABLE = process.env.USER_STATS_TABLE || "UserStats";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export const handler = async (event) => {
  console.log("AdminStats event:", JSON.stringify(event));

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS,
      body: "",
    };
  }

  try {
    const reports = await scanAll(REPORTS_TABLE);
    const users = await scanAll(USER_STATS_TABLE);

    const totalReports = reports.length;

    let totalConfirms = 0;
    let totalRejects = 0;

    const hourly = {};
    const byLot = {};
    const reporterMap = {};

    for (const report of reports) {
      const confirms = Number(report.confirmCount || 0);
      const rejects = Number(report.rejectCount || 0);

      totalConfirms += confirms;
      totalRejects += rejects;

      const lotName = report.area || report.lotName || "Unknown";

      if (!byLot[lotName]) {
        byLot[lotName] = {
          reports: 0,
          confirms: 0,
          rejects: 0,
        };
      }

      byLot[lotName].reports += 1;
      byLot[lotName].confirms += confirms;
      byLot[lotName].rejects += rejects;

      if (report.createdAt) {
        const hour = new Date(report.createdAt).getHours();
        hourly[hour] = (hourly[hour] || 0) + 1;
      }

      const email = report.userEmail || report.email;

      if (email) {
        if (!reporterMap[email]) {
          reporterMap[email] = {
            email,
            totalReports: 0,
          };
        }

        reporterMap[email].totalReports += 1;
      }
    }

    const topReporters = Object.values(reporterMap)
      .sort((a, b) => b.totalReports - a.totalReports)
      .slice(0, 10);

    const response = {
      totalReports,
      totalConfirms,
      totalRejects,
      totalUsers: users.length,
      hourly,
      byLot,
      topReporters,
      generatedAt: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(response),
    };
  } catch (err) {
    console.error("AdminStats error:", err);

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

async function scanAll(tableName) {
  const items = [];
  let ExclusiveStartKey = undefined;

  do {
    const result = await db.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey,
      })
    );

    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}