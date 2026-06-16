import { NextResponse } from "next/server";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { dynamoDb } from "@/lib/dynamodb";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

export async function POST(req: Request) {
  try {
    // 🚨 NUEVO: Recibimos el factura_pk exacto
    const { factura_pk, numero_documento, fileName, fileBase64 } = await req.json();

    if (!factura_pk || !numero_documento || !fileName || !fileBase64) {
      return NextResponse.json(
        { error: "Faltan datos requeridos." },
        { status: 400 },
      );
    }

    const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const s3Key = `input/ATTACH_${numero_documento}_${Date.now()}_${fileName}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType: "image/png",
      }),
    );

    // 2. Actualizar la Factura asociando el Voucher usando su PK exacta
    await dynamoDb.send(
      new UpdateCommand({
        TableName: "AqtivaChatDB",
        Key: { PK: factura_pk, SK: "METADATA" },
        UpdateExpression: "SET voucher_conciliado = :s3key",
        ExpressionAttributeValues: { ":s3key": s3Key },
      }),
    );

    const timestamp = new Date().toISOString();
    await dynamoDb.send(
      new PutCommand({
        TableName: "AqtivaChatDB",
        Item: {
          PK: `AUDIT#${timestamp}#${numero_documento}`,
          SK: "METADATA",
          tipo_accion: "ADJUNTO_MANUAL",
          numero_documento: numero_documento,
          factura_vinculada_pk: factura_pk,
          voucher_vinculado: s3Key,
          fecha_registro: timestamp,
          estado: "AUDITADO",
        },
      }),
    );

    return NextResponse.json({
      success: true,
      message: "Comprobante adjuntado correctamente.",
    });
  } catch (error: any) {
    console.error("Error adjuntando comprobante:", error);
    return NextResponse.json(
      { error: "Fallo interno al adjuntar el documento." },
      { status: 500 },
    );
  }
}