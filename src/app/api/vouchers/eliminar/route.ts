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
      // 🚨 PARCHE: Reconstruir el PK si el frontend no lo envió
      let voucherPK = v.PK;
      
      if (!voucherPK) {
        if (v.fileName) {
          voucherPK = `VOUCHER#${v.fileName}`;
        } else if (v.s3_key) {
          // Extraemos el nombre base sin carpetas ni extensiones
          const baseName = v.s3_key.split('/').pop().replace('.json', '').replace('.png', '').replace('.pdf', '').replace('.jpg', '').replace('.jpeg', '');
          voucherPK = `VOUCHER#${baseName}`;
        }
      }

      if (!voucherPK) {
        console.error("No se pudo determinar el PK para el voucher, se ignora:", v);
        continue; // Saltamos este registro en vez de crashear la API
      }

      // 1. Borrar de DynamoDB (Voucher)
      await dynamoDb.send(new DeleteCommand({
        TableName: "AqtivaChatDB",
        Key: { PK: voucherPK, SK: "METADATA" }
      }));

      // 2. Limpieza Profunda en S3 (Archivos input, output y processed)
      if (v.s3_key) {
        const baseName = v.s3_key.split('/').pop().replace('.json', '').replace('.png', '').replace('.pdf', '').replace('.jpg', '').replace('.jpeg', '');
        const carpetas = ['input', 'output', 'processed']; 
        const extensiones = ['.json', '.png', '.pdf', '.jpg', '.jpeg'];

        for (const dir of carpetas) {
          for (const ext of extensiones) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: process.env.BUCKET_NAME,
              Key: `${dir}/${baseName}${ext}`
            })).catch(() => null); // Ignora silenciosamente si la extensión no existe
          }
        }

        // 3. Limpiar Auditoría de ese voucher
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

    return NextResponse.json({ success: true, message: "Archivos y registros eliminados exitosamente." });
  } catch (error: any) {
    console.error("Error al eliminar vouchers:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor." }, { status: 500 });
  }
}