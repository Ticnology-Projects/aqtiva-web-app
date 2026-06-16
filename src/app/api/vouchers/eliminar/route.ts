import { NextResponse } from "next/server";
import { DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { dynamoDb } from "@/lib/dynamodb";

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(req: Request) {
  try {
    const { vouchers } = await req.json();

    if (!vouchers || !Array.isArray(vouchers)) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    for (const v of vouchers) {
      // 1. Borrar de DynamoDB (Voucher)
      await dynamoDb.send(new DeleteCommand({
        TableName: "AqtivaChatDB",
        Key: { PK: v.PK, SK: "METADATA" }
      }));

      // 2. Limpieza Profunda en S3 (Archivos input y output)
      if (v.s3_key) {
        const baseName = v.s3_key.split('/').pop().replace('.json', '').replace('.png', '').replace('.pdf', '');
        const carpetas = ['input', 'output'];
        const extensiones = ['.json', '.png', '.pdf', '.jpg', '.jpeg'];

        for (const dir of carpetas) {
          for (const ext of extensiones) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: process.env.BUCKET_NAME,
              Key: `${dir}/${baseName}${ext}`
            })).catch(() => null); // Ignora silenciosamente si la extensión no existe
          }
        }

        // 3. Limpiar Auditoría (Processed)
        const audits = await dynamoDb.send(new ScanCommand({
          TableName: "AqtivaChatDB",
          FilterExpression: "begins_with(PK, :prefix) AND voucher_vinculado = :s3key",
          ExpressionAttributeValues: { ":prefix": "AUDIT#", ":s3key": v.s3_key }
        }));
        
        for (const audit of audits.Items || []) {
          await dynamoDb.send(new DeleteCommand({
            TableName: "AqtivaChatDB",
            Key: { PK: audit.PK, SK: "METADATA" }
          }));
        }
      }
    }

    return NextResponse.json({ success: true, message: "Archivos e historial eliminados permanentemente de S3 y BD." });
  } catch (error: any) {
    console.error("Error al limpiar bóveda:", error);
    return NextResponse.json({ error: "Fallo interno al limpiar el sistema." }, { status: 500 });
  }
}