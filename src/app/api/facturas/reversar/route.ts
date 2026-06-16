import { NextResponse } from "next/server";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    // Recibimos los datos del ticket de auditoría que se está reversando
    const { PK: audit_pk, numero_documento, factura_vinculada_pk, voucher_vinculado } = await req.json();

    if (!audit_pk || !numero_documento) {
        return NextResponse.json({ error: "Faltan datos de auditoría." }, { status: 400 });
    }

    // 1. Revertir la Factura (Devolver a PENDIENTE y quitar el voucher)
    const invoicePK = factura_vinculada_pk || `INVOICE#${numero_documento}`;
    await dynamoDb.send(new UpdateCommand({
      TableName: "AqtivaChatDB",
      Key: { PK: invoicePK, SK: "METADATA" },
      UpdateExpression: "SET estado = :estado REMOVE voucher_conciliado",
      ExpressionAttributeValues: { ":estado": "PENDIENTE" }
    }));

    // 2. Anular el ticket de auditoría original
    await dynamoDb.send(new UpdateCommand({
      TableName: "AqtivaChatDB",
      Key: { PK: audit_pk, SK: "METADATA" },
      UpdateExpression: "SET estado = :anulado",
      ExpressionAttributeValues: { ":anulado": "ANULADO" }
    }));

    // 3. Crear el nuevo ticket de reversión
    const timestamp = new Date().toISOString();
    await dynamoDb.send(new PutCommand({
      TableName: "AqtivaChatDB",
      Item: {
        PK: `AUDIT#${timestamp}#${numero_documento}#REV`,
        SK: "METADATA",
        tipo_accion: "REVERSION",
        numero_documento: numero_documento,
        factura_vinculada_pk: invoicePK,
        fecha_registro: timestamp,
        estado: "AUDITADO"
      }
    }));

    // 4. EL FIX DEL VOUCHER FANTASMA: Devolver el Voucher original a Triaje
    if (voucher_vinculado && voucher_vinculado.includes("processed/")) {
        // Reconstruimos la llave primaria original: Quitamos 'processed/' y '.json'
        const baseName = voucher_vinculado.replace("processed/", "").replace(".json", "");
        const voucherPK = `VOUCHER#${baseName}`;

        // Al usar el PK correcto, conservará su RUC, candidatos, IA, etc.
        await dynamoDb.send(new UpdateCommand({
          TableName: "AqtivaChatDB",
          Key: { PK: voucherPK, SK: "METADATA" },
          UpdateExpression: "SET estado = :estado",
          ExpressionAttributeValues: { ":estado": "PENDIENTE_REVISION" }
        }));
    }

    return NextResponse.json({ success: true, message: "Reversión completada con éxito. El voucher ha vuelto a Triaje." });
  } catch (error: any) {
    console.error("Error en reversión:", error);
    return NextResponse.json({ error: "Fallo interno al reversar el cobro." }, { status: 500 });
  }
}