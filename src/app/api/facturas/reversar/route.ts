import { NextResponse } from "next/server";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const { numero_documento, s3_key_voucher, audit_pk, tipo_accion } =
      await req.json();

    if (!numero_documento)
      return NextResponse.json(
        { error: "Número de documento obligatorio." },
        { status: 400 },
      );

    // 1. REVERSAR FACTURA SEGÚN TIPO DE ACCIÓN
    if (tipo_accion === "ADJUNTO_MANUAL") {
      // Estaba cobrada desde CSV, solo quitamos la foto. Se queda COBRADO.
      await dynamoDb.send(
        new UpdateCommand({
          TableName: "AqtivaChatDB",
          Key: { PK: `INVOICE#${numero_documento}`, SK: "METADATA" },
          UpdateExpression: "REMOVE voucher_conciliado",
        }),
      );
    } else {
      // Conciliación real por Triaje, devuelve la factura a PENDIENTE
      await dynamoDb.send(
        new UpdateCommand({
          TableName: "AqtivaChatDB",
          Key: { PK: `INVOICE#${numero_documento}`, SK: "METADATA" },
          UpdateExpression:
            "SET estado = :nuevoEstado REMOVE voucher_conciliado",
          ExpressionAttributeValues: { ":nuevoEstado": "PENDIENTE" },
        }),
      );
    }

    // 2. DEVOLVER VOUCHER A TRIAJE (Solo si NO fue manual)
    if (
      s3_key_voucher &&
      s3_key_voucher !== "N/A" &&
      tipo_accion !== "ADJUNTO_MANUAL"
    ) {
      const nombre_archivo = s3_key_voucher.split("/").pop();
      await dynamoDb.send(
        new UpdateCommand({
          TableName: "AqtivaChatDB",
          Key: { PK: `VOUCHER#${nombre_archivo}`, SK: "METADATA" },
          UpdateExpression: "SET estado = :nuevoEstado",
          ExpressionAttributeValues: { ":nuevoEstado": "PENDIENTE_REVISION" },
        }),
      );
    }

    // 3. Anular ticket original y 4. Crear ticket constancia (MANTÉN TU CÓDIGO ORIGINAL AQUÍ)
    if (audit_pk) {
      await dynamoDb.send(
        new UpdateCommand({
          TableName: "AqtivaChatDB",
          Key: { PK: audit_pk, SK: "METADATA" },
          UpdateExpression: "SET estado = :nuevoEstado",
          ExpressionAttributeValues: { ":nuevoEstado": "REVERSADO" },
        }),
      );
    }

    const timestamp = new Date().toISOString();
    await dynamoDb.send(
      new PutCommand({
        TableName: "AqtivaChatDB",
        Item: {
          PK: `AUDIT#${timestamp}#${numero_documento}#REV`,
          SK: "METADATA",
          tipo_accion: "REVERSION",
          numero_documento: numero_documento,
          voucher_vinculado: s3_key_voucher || "N/A",
          fecha_registro: timestamp,
          estado: "COMPLETADO",
        },
      }),
    );

    return NextResponse.json({
      success: true,
      message: "Conciliación reversada con éxito.",
    });
  } catch (error: any) {
    console.error("Error al reversar:", error);
    return NextResponse.json(
      { error: "Fallo interno al reversar la conciliación." },
      { status: 500 },
    );
  }
}
