import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const tableName = process.env.DYNAMODB_TABLE_NAME!;
  const userId = (session.user as any).id;

  try {
    // CASO A: Si mandan un sessionId, devolvemos sus mensajes ordenados cronológicamente
    if (sessionId) {
      const response = await dynamoDb.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `CONV#${sessionId}`,
          ":sk": "MSG#",
        },
      }));
      return NextResponse.json(response.Items || []);
    }

    // CASO B: Si no hay sessionId, listamos todas las conversaciones que le pertenecen a este usuario
    const response = await dynamoDb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":sk": "CONV#",
      },
    }));

    // Formateamos los items para que el frontend los lea de forma limpia
    const conversations = (response.Items || []).map(item => ({
      id: item.SK.replace("CONV#", ""),
      title: item.titulo,
      date: item.fechaCreacion,
    }));

    return NextResponse.json(conversations);

  } catch (error: any) {
    console.error("Error obteniendo historiales de DynamoDB:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}