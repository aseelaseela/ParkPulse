// lambda/subscribeAlert/index.mjs
// POST /subscribe – subscribe/unsubscribe email to lot availability alerts via SNS + DynamoDB

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  SNSClient,
  SubscribeCommand,
  UnsubscribeCommand,
  ListSubscriptionsByTopicCommand,
  SetSubscriptionAttributesCommand,
} from "@aws-sdk/client-sns";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

const ALERTS_TABLE = process.env.ALERTS_TABLE || "LotAlerts";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

export const handler = async (event) => {
  console.log("SubscribeAlert event:", JSON.stringify(event));

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS,
      body: "",
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const email = body.email?.trim().toLowerCase();
    const lotName = body.lotName?.trim();
    const action = body.action || "subscribe";

    if (!email || !lotName) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({
          error: "email and lotName are required",
        }),
      };
    }

    if (!SNS_TOPIC_ARN) {
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({
          error: "SNS_TOPIC_ARN is missing",
        }),
      };
    }

    const subscriptionId = `${email}#${lotName}`;

    // -----------------------------
    // Unsubscribe from one lot
    // -----------------------------
    if (action === "unsubscribe") {
      await dynamo.send(
        new DeleteCommand({
          TableName: ALERTS_TABLE,
          Key: { subscriptionId },
        })
      );

      const remainingLots = await getLotsForEmail(email);
      const snsArn = await findSnsSubscriptionArnByEmail(email);

      if (remainingLots.length > 0) {
        await updateFilterPolicy(snsArn, remainingLots);
      } else {
        await unsubscribeFromSnsIfPossible(snsArn);
      }

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          message: "Unsubscribed successfully",
          remainingLots,
        }),
      };
    }

    // -----------------------------
    // Subscribe to a lot
    // -----------------------------

    // SNS has one subscription per email per topic.
    // If the email already exists, we update its FilterPolicy.
    let snsArn = await findSnsSubscriptionArnByEmail(email);

    if (!snsArn) {
      const result = await sns.send(
        new SubscribeCommand({
          TopicArn: SNS_TOPIC_ARN,
          Protocol: "email",
          Endpoint: email,
          ReturnSubscriptionArn: true,

          // Important for a new email subscription:
          // while it is still pending confirmation, this sets initial filter.
          Attributes: {
            FilterPolicy: JSON.stringify({
              lotName: [lotName],
            }),
          },
        })
      );

      snsArn = result.SubscriptionArn || "";
    }

    const status =
      snsArn && snsArn.startsWith("arn:aws:sns:") ? "active" : "pending";

    const existing = await dynamo.send(
      new GetCommand({
        TableName: ALERTS_TABLE,
        Key: { subscriptionId },
      })
    );

    const item = {
      subscriptionId,
      email,
      lotName,
      status,
      snsArn: snsArn || "",
      createdAt: existing.Item?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dynamo.send(
      new PutCommand({
        TableName: ALERTS_TABLE,
        Item: item,
      })
    );

    // This is the key fix:
    // collect ALL lots for this email and update SNS FilterPolicy
    const lots = await getLotsForEmail(email);
    await updateFilterPolicy(snsArn, lots);

    return {
      statusCode: existing.Item ? 200 : 201,
      headers: CORS,
      body: JSON.stringify({
        message:
          status === "active"
            ? "Subscribed successfully"
            : "Subscribed successfully. Check your email to confirm the SNS subscription.",
        subscription: item,
        filterLots: lots,
      }),
    };
  } catch (err) {
    console.error("subscribeAlert error:", err);

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

async function getLotsForEmail(email) {
  const lots = [];
  let ExclusiveStartKey = undefined;

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: ALERTS_TABLE,
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: {
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":email": email,
        },
        ExclusiveStartKey,
      })
    );

    for (const item of result.Items || []) {
      if (item.lotName) {
        lots.push(item.lotName);
      }
    }

    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return Array.from(new Set(lots));
}

async function findSnsSubscriptionArnByEmail(email) {
  let NextToken = undefined;

  do {
    const result = await sns.send(
      new ListSubscriptionsByTopicCommand({
        TopicArn: SNS_TOPIC_ARN,
        NextToken,
      })
    );

    const match = (result.Subscriptions || []).find(
      (sub) =>
        sub.Protocol === "email" &&
        sub.Endpoint?.toLowerCase() === email.toLowerCase()
    );

    if (match) {
      return match.SubscriptionArn || "";
    }

    NextToken = result.NextToken;
  } while (NextToken);

  return "";
}

async function updateFilterPolicy(subscriptionArn, lotNames) {
  if (!subscriptionArn || subscriptionArn === "PendingConfirmation") {
    console.warn("Cannot update FilterPolicy yet. Subscription is pending.");
    return;
  }

  if (!subscriptionArn.startsWith("arn:aws:sns:")) {
    console.warn("Invalid SNS subscription ARN:", subscriptionArn);
    return;
  }

  const cleanLots = Array.from(new Set((lotNames || []).filter(Boolean)));

  await sns.send(
    new SetSubscriptionAttributesCommand({
      SubscriptionArn: subscriptionArn,
      AttributeName: "FilterPolicy",
      AttributeValue: JSON.stringify({
        lotName: cleanLots,
      }),
    })
  );

  console.log("Updated SNS FilterPolicy:", {
    subscriptionArn,
    lotName: cleanLots,
  });
}

async function unsubscribeFromSnsIfPossible(subscriptionArn) {
  if (!subscriptionArn || subscriptionArn === "PendingConfirmation") {
    console.warn("Skipping SNS unsubscribe. Subscription is pending or missing.");
    return;
  }

  if (!subscriptionArn.startsWith("arn:aws:sns:")) {
    console.warn("Skipping SNS unsubscribe. Invalid ARN:", subscriptionArn);
    return;
  }

  await sns.send(
    new UnsubscribeCommand({
      SubscriptionArn: subscriptionArn,
    })
  );

  console.log("Unsubscribed from SNS:", subscriptionArn);
}