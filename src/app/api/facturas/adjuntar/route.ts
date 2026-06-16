import { NextResponse } from "next/server";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { dynamoDb } from "@/lib/dynamodb";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

export async function POST(req: Request) {
  try {
    const { numero_documento, fileName, fileBase64 } = await req.json();

    if (!numero_documento || !fileName || !fileBase64) {
      return NextResponse.json(
        { error: "Faltan datos requeridos." },
        { status: 400 },
      );
    }

    // 1. Decodificar la imagen y subirla a S3
    const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Lo guardamos en la carpeta input/ para que tu visor de imágenes lo pueda leer igual que los demás
    const s3Key = `input/ATTACH_${numero_documento}_${Date.now()}_${fileName}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType: "image/png",
      }),
    );

    // 2. Actualizar la Factura asociando el Voucher
    await dynamoDb.send(
      new UpdateCommand({
        TableName: "AqtivaChatDB",
        Key: { PK: `INVOICE#${numero_documento}`, SK: "METADATA" },
        UpdateExpression: "SET voucher_conciliado = :s3key",
        ExpressionAttributeValues: { ":s3key": s3Key },
      }),
    );

    // 3. Crear Ticket de Auditoría Específico
    const timestamp = new Date().toISOString();
    await dynamoDb.send(
      new PutCommand({
        TableName: "AqtivaChatDB",
        Item: {
          PK: `AUDIT#${timestamp}#${numero_documento}`,
          SK: "METADATA",
          tipo_accion: "ADJUNTO_MANUAL",
          numero_documento: numero_documento,
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
