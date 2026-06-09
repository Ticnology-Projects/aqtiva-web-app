import { NextResponse } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sessionId, newTitle } = await req.json();
  const userId = (session.user as any).id;
  const tableName = process.env.DYNAMODB_TABLE_NAME!;

  try {
    await dynamoDb.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: `USER#${userId}`, SK: `CONV#${sessionId}` },
      UpdateExpression: "SET titulo = :t",
      ExpressionAttributeValues: { ":t": newTitle }
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Error al renombrar" }, { status: 500 });
  }
}