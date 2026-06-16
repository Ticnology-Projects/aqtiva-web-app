import { NextResponse } from "next/server";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    // 🚨 NUEVO: Recibimos el factura_pk exacto
    const { factura_pk, numero_documento, s3_key_voucher, PK_Voucher } = await req.json();

    if (!factura_pk || !numero_documento) {
      return NextResponse.json({ error: "El PK y número de documento son obligatorios." }, { status: 400 });
    }

    // 1. Cobrar la Factura usando la llave compuesta
    await dynamoDb.send(new UpdateCommand({
      TableName: "AqtivaChatDB", 
      Key: { PK: factura_pk, SK: "METADATA" },
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

    // 3. CREAR EL TICKET DE AUDITORÍA
    const timestamp = new Date().toISOString();
    await dynamoDb.send(new PutCommand({
      TableName: "AqtivaChatDB",
      Item: {
        // La auditoría puede mantener esta llave simple para historial cronológico
        PK: `AUDIT#${timestamp}#${numero_documento}`,
        SK: "METADATA",
        tipo_accion: "CONCILIACION",
        numero_documento: numero_documento,
        factura_vinculada_pk: factura_pk, // Guardamos referencia a la factura exacta
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