import { NextResponse } from "next/server";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const { audit_pk } = await req.json();

    if (!audit_pk) {
      return NextResponse.json({ error: "ID de auditoría obligatorio." }, { status: 400 });
    }

    await dynamoDb.send(new DeleteCommand({
      TableName: "AqtivaChatDB",
      Key: { PK: audit_pk, SK: "METADATA" }
    }));

    return NextResponse.json({ success: true, message: "Registro de auditoría eliminado permanentemente." });
  } catch (error: any) {
    console.error("Error al eliminar auditoría:", error);
    return NextResponse.json({ error: "Fallo interno al eliminar el historial." }, { status: 500 });
  }
}