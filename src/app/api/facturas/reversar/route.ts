import { NextResponse } from "next/server";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const { numero_documento, s3_key_voucher, audit_pk } = await req.json();

    if (!numero_documento) {
      return NextResponse.json({ error: "El número de documento es obligatorio." }, { status: 400 });
    }

    // 1. Reversar la Factura a PENDIENTE (y eliminar el rastro del voucher)
    await dynamoDb.send(new UpdateCommand({
      TableName: "AqtivaChatDB",
      Key: { PK: `INVOICE#${numero_documento}`, SK: "METADATA" },
      UpdateExpression: "SET estado = :nuevoEstado REMOVE voucher_conciliado",
      ExpressionAttributeValues: { ":nuevoEstado": "PENDIENTE" }
    }));

    // 2. Devolver el Voucher a PENDIENTE_REVISION (Para que vuelva a salir en la bandeja)
    if (s3_key_voucher && s3_key_voucher !== "N/A") {
      const nombre_archivo = s3_key_voucher.split('/').pop();
      await dynamoDb.send(new UpdateCommand({
        TableName: "AqtivaChatDB",
        Key: { PK: `VOUCHER#${nombre_archivo}`, SK: "METADATA" },
        UpdateExpression: "SET estado = :nuevoEstado",
        ExpressionAttributeValues: { ":nuevoEstado": "PENDIENTE_REVISION" }
      }));
    }

    // 3. Anular el ticket de auditoría original
    if (audit_pk) {
      await dynamoDb.send(new UpdateCommand({
        TableName: "AqtivaChatDB",
        Key: { PK: audit_pk, SK: "METADATA" },
        UpdateExpression: "SET estado = :nuevoEstado",
        ExpressionAttributeValues: { ":nuevoEstado": "REVERSADO" }
      }));
    }

    // 4. Crear un NUEVO ticket de auditoría como constancia de la reversión
    const timestamp = new Date().toISOString();
    await dynamoDb.send(new PutCommand({
      TableName: "AqtivaChatDB",
      Item: {
        PK: `AUDIT#${timestamp}#${numero_documento}#REV`,
        SK: "METADATA",
        tipo_accion: "REVERSION",
        numero_documento: numero_documento,
        voucher_vinculado: s3_key_voucher || "N/A",
        fecha_registro: timestamp,
        estado: "COMPLETADO"
      }
    }));

    return NextResponse.json({ success: true, message: "Conciliación reversada con éxito." });
  } catch (error: any) {
    console.error("Error al reversar:", error);
    return NextResponse.json({ error: "Fallo interno al reversar la conciliación." }, { status: 500 });
  }
}