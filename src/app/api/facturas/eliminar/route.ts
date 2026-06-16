import { NextResponse } from "next/server";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const { facturas } = await req.json();

    if (!facturas || !Array.isArray(facturas)) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    for (const f of facturas) {
      // Usamos directamente f.PK (ej. INVOICE#20100097746#F001-206)
      await dynamoDb.send(new DeleteCommand({
        TableName: "AqtivaChatDB",
        Key: { PK: f.PK, SK: "METADATA" }
      }));
    }

    return NextResponse.json({ success: true, message: "Facturas eliminadas de la base de datos exitosamente." });
  } catch (error: any) {
    console.error("Error al eliminar facturas:", error);
    return NextResponse.json({ error: "Fallo interno al eliminar facturas." }, { status: 500 });
  }
}