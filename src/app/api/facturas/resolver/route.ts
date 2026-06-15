import { NextResponse } from "next/server";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const { numero_documento, s3_key_voucher, PK_Voucher } = await req.json();

    if (!numero_documento) {
      return NextResponse.json({ error: "El número de documento es obligatorio." }, { status: 400 });
    }

    // 1. Cobrar la Factura
    await dynamoDb.send(new UpdateCommand({
      TableName: "AqtivaChatDB", 
      Key: { PK: `INVOICE#${numero_documento}`, SK: "METADATA" },
      UpdateExpression: "SET estado = :nuevoEstado, voucher_conciliado = :voucher",
      ExpressionAttributeValues: {
        ":nuevoEstado": "COBRADO",
        ":voucher": s3_key_voucher || "Asignación Manual"
      }
    }));

    // 2. Marcar el Voucher como RESUELTO
    if (PK_Voucher) {
      await dynamoDb.send(new UpdateCommand({
        TableName: "AqtivaChatDB", 
        Key: { PK: PK_Voucher, SK: "METADATA" },
        UpdateExpression: "SET estado = :nuevoEstado",
        ExpressionAttributeValues: { ":nuevoEstado": "RESUELTO" }
      }));
    }

    // === NUEVO: 3. CREAR EL TICKET DE AUDITORÍA INMUTABLE ===
    const timestamp = new Date().toISOString();
    await dynamoDb.send(new PutCommand({
      TableName: "AqtivaChatDB",
      Item: {
        PK: `AUDIT#${timestamp}#${numero_documento}`,
        SK: "METADATA",
        tipo_accion: "CONCILIACION",
        numero_documento: numero_documento,
        voucher_vinculado: s3_key_voucher || "N/A",
        fecha_registro: timestamp,
        estado: "AUDITADO"
      }
    }));

    return NextResponse.json({ 
      success: true, 
      message: `Factura ${numero_documento} cobrada y registrada en auditoría.` 
    });

  } catch (error: any) {
    console.error("Error al conciliar:", error);
    return NextResponse.json({ error: "Fallo interno al actualizar la base de datos." }, { status: 500 });
  }
}