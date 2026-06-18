import { NextResponse } from "next/server";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    // 🚨 NUEVO: Recibimos la bandera "es_automatico"
    const { factura_pk, numero_documento, s3_key_voucher, PK_Voucher, es_automatico } = await req.json();

    if (!factura_pk || !numero_documento) {
      return NextResponse.json({ error: "El PK y número de documento son obligatorios." }, { status: 400 });
    }

    // Definimos los sellos dependiendo de quién hizo la acción
    const metodoResolucion = es_automatico ? "AUTOMATICO_IA" : "MANUAL";
    const tipoAccionAudit = es_automatico ? "AUTO_CONCILIACION" : "CONCILIACION";

    // 1. Cobrar la Factura y ponerle el sello de quién la cobró
    await dynamoDb.send(new UpdateCommand({
      TableName: "AqtivaChatDB", 
      Key: { PK: factura_pk, SK: "METADATA" },
      UpdateExpression: "SET estado = :nuevoEstado, voucher_conciliado = :voucher, metodo_resolucion = :metodo",
      ExpressionAttributeValues: {
        ":nuevoEstado": "COBRADO",
        ":voucher": s3_key_voucher || "Asignación Manual",
        ":metodo": metodoResolucion
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

    // 3. CREAR EL TICKET DE AUDITORÍA CON EL SELLO EXACTO
    const timestamp = new Date().toISOString();
    await dynamoDb.send(new PutCommand({
      TableName: "AqtivaChatDB",
      Item: {
        PK: `AUDIT#${timestamp}#${numero_documento}`,
        SK: "METADATA",
        tipo_accion: tipoAccionAudit,
        numero_documento: numero_documento,
        factura_vinculada_pk: factura_pk, 
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