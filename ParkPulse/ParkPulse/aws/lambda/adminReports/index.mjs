// aws/lambda/adminReports/index.mjs
// DELETE /admin/reports/{reportId} – deletes a report
// PATCH  /admin/reports/{reportId} – updates selected report fields

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.TABLE_NAME || "ParkingReports";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "PATCH,DELETE,OPTIONS",
};

export const handler = async (event) => {
  console.log("AdminReports event:", JSON.stringify(event));

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const reportId = decodeURIComponent(event.pathParameters?.reportId || "");

    if (!reportId) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: "Missing reportId" }),
      };
    }

    // DELETE /admin/reports/{reportId}
    if (event.httpMethod === "DELETE") {
      await db.send(
        new DeleteCommand({ TableName: TABLE, Key: { reportId } })
      );

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          message: "Report deleted successfully",
          reportId,
        }),
      };
    }

    // PATCH /admin/reports/{reportId} – optional admin edit
    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");

      const updateParts = [];
      const names = {};
      const values = {};

      if (body.area !== undefined) {
        updateParts.push("#area = :area");
        names["#area"] = "area";
        values[":area"] = body.area;
      }

      if (body.availabilityLevel !== undefined) {
        updateParts.push("#availabilityLevel = :availabilityLevel");
        names["#availabilityLevel"] = "availabilityLevel";
        values[":availabilityLevel"] = body.availabilityLevel;
      }

      if (body.computedStatus !== undefined) {
        updateParts.push("#computedStatus = :computedStatus");
        names["#computedStatus"] = "computedStatus";
        values[":computedStatus"] = body.computedStatus;
      }

      if (typeof body.confirmCount === "number") {
        updateParts.push("#confirmCount = :confirmCount");
        names["#confirmCount"] = "confirmCount";
        values[":confirmCount"] = body.confirmCount;
      }

      if (typeof body.rejectCount === "number") {
        updateParts.push("#rejectCount = :rejectCount");
        names["#rejectCount"] = "rejectCount";
        values[":rejectCount"] = body.rejectCount;
      }

      updateParts.push("#updatedAt = :updatedAt");
      names["#updatedAt"] = "updatedAt";
      values[":updatedAt"] = new Date().toISOString();

      if (updateParts.length === 1) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: "No fields to update" }),
        };
      }

      const result = await db.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { reportId },
          UpdateExpression: `SET ${updateParts.join(", ")}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: "ALL_NEW",
        })
      );

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          message: "Report updated successfully",
          report: result.Attributes,
        }),
      };
    }

    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (err) {
    console.error("AdminReports error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Internal server error", details: err.message }),
    };
  }
};