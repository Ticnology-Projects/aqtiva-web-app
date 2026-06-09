import { NextResponse } from "next/server";
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sessionId } = await req.json();
  const userId = (session.user as any).id;
  const tableName = process.env.DYNAMODB_TABLE_NAME!;

  try {
    // 1. Obtener todos los mensajes para poder borrarlos
    const messages = await dynamoDb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `CONV#${sessionId}`, ":sk": "MSG#" }
    }));

    // 2. Borrar cada mensaje
    for (const msg of messages.Items || []) {
      await dynamoDb.send(new DeleteCommand({
        TableName: tableName,
        Key: { PK: msg.PK, SK: msg.SK }
      }));
    }

    // 3. Borrar la metadata de la conversación del usuario
    await dynamoDb.send(new DeleteCommand({
      TableName: tableName,
      Key: { PK: `USER#${userId}`, SK: `CONV#${sessionId}` }
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}