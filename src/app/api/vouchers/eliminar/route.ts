import { NextResponse } from "next/server";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const { pk_voucher } = await req.json();

    if (!pk_voucher) {
      return NextResponse.json({ error: "ID de voucher obligatorio." }, { status: 400 });
    }

    await dynamoDb.send(new DeleteCommand({
      TableName: "AqtivaChatDB",
      Key: { PK: pk_voucher, SK: "METADATA" }
    }));

    return NextResponse.json({ success: true, message: "Voucher eliminado correctamente del sistema." });
  } catch (error: any) {
    console.error("Error al eliminar voucher:", error);
    return NextResponse.json({ error: "Fallo interno al eliminar el voucher." }, { status: 500 });
  }
}