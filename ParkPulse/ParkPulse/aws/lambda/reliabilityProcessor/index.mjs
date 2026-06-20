// lambda/reliabilityProcessor/index.mjs
// SQS-triggered – recalculates reliability scores and sends SNS alerts
// This is the heart of the Reliability Engine described in the proposal.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand, ListSubscriptionsByTopicCommand } from "@aws-sdk/client-sns";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns    = new SNSClient({});

const REPORTS_TABLE  = process.env.TABLE_NAME        || "ParkingReports";
const ALERTS_TABLE   = process.env.ALERTS_TABLE      || "LotAlerts";
const SNS_TOPIC_ARN  = process.env.SNS_TOPIC_ARN     || "";

// ── Reliability formula ────────────────────────────────────────────────────
// Score = 60% community ratio + 40% freshness decay
// Freshness decays linearly from 100% at creation to 0% at 60 minutes
function computeReliabilityScore(report) {
  const confirms = report.confirmCount || 0;
  const rejects  = report.rejectCount  || 0;
  const total    = confirms + rejects;

  const communityScore = total === 0 ? 50 : Math.round((confirms / total) * 100);

  const ageMs   = Date.now() - new Date(report.createdAt).getTime();
  const ageMin  = ageMs / 60000;
  const freshness = Math.max(0, Math.round(100 - (ageMin / 60) * 100));

  return Math.round(communityScore * 0.6 + freshness * 0.4);
}

function classifyStatus(report) {
  const rejectRatio =
    (report.rejectCount || 0) /
    Math.max(1, (report.confirmCount || 0) + (report.rejectCount || 0));

  if (rejectRatio >= 0.6 || computeReliabilityScore(report) < 25) return "full";
  if (report.availabilityLevel === "הרבה חניה פנויה") return "available";
  return "partial";
}

// ── Main handler ───────────────────────────────────────────────────────────
export const handler = async (event) => {
  const results = [];

  for (const record of event.Records) {
    try {
      const payload = JSON.parse(record.body);
      const { reportId, action } = payload; // action: "new_report" | "feedback"

      if (!reportId) continue;

      // Fetch current report
      const { Item: report } = await dynamo.send(
        new GetCommand({ TableName: REPORTS_TABLE, Key: { reportId } })
      );

      if (!report) continue;

      const reliabilityScore = computeReliabilityScore(report);
      const computedStatus   = classifyStatus(report);

      // Update reliability score and computed status on the record
      await dynamo.send(
        new UpdateCommand({
          TableName: REPORTS_TABLE,
          Key: { reportId },
          UpdateExpression:
            "SET reliabilityScore = :score, computedStatus = :status, lastProcessed = :ts",
          ExpressionAttributeValues: {
            ":score":  reliabilityScore,
            ":status": computedStatus,
            ":ts":     new Date().toISOString(),
          },
        })
      );

      // If a report just became "available", notify subscribers for that lot
      if (computedStatus === "available" && action === "feedback") {
        await notifySubscribers(report.area, report.reportId);
      }

      results.push({ reportId, reliabilityScore, computedStatus });
    } catch (err) {
      console.error("Error processing record:", record.messageId, err);
    }
  }

  console.log("Processed:", JSON.stringify(results));
  return { batchItemFailures: [] };
};

// ── SNS notification to lot subscribers ────────────────────────────────────
async function notifySubscribers(lotName, reportId) {
  if (!SNS_TOPIC_ARN) return;

  try {
    // Get all confirmed subscriptions for this topic
    // In production, you would filter by lot-specific attributes or maintain
    // a subscription table keyed by (lotName, email)
    const subscriptions = await dynamo.send(
      new ScanCommand({
        TableName: ALERTS_TABLE,
        FilterExpression: "lotName = :lot AND #s = :active",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":lot": lotName, ":active": "active" },
      })
    );

    const subscribers = subscriptions.Items || [];
    console.log(`Notifying ${subscribers.length} subscribers for lot: ${lotName}`);

    // SNS topic publish (fan-out to all email/SMS endpoints)
    if (subscribers.length > 0) {
      await sns.send(
        new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Subject:  `🟢 חניון ${lotName} התפנה – ParkPulse`,
          Message:  `חניה פנויה זוהתה בחניון ${lotName}.\n\nפתח את אפליקציית ParkPulse לניווט אוטומטי.`,
          MessageAttributes: {
            lotName: { DataType: "String", StringValue: lotName },
          },
        })
      );
    }
  } catch (err) {
    console.error("SNS notification error:", err);
  }
}
