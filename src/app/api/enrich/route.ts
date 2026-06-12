import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { s3Client } from "@/lib/s3";
import { dynamoDb } from "@/lib/dynamodb";

function cleanBusinessName(name: string): string {
  if (!name) return "";
  return name
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  try {
    const { s3_key } = await req.json();
    const bucketName = process.env.BUCKET_NAME!;

    let outText = "";
    try {
      // 1. Intentamos leer la salida del OCR (Textract)
      const outRes = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3_key }));
      outText = await outRes.Body!.transformToString("utf-8");
    } catch (err: any) {
      // Si la Lambda de Python aún no crea el archivo, retornamos 404 para que el frontend siga esperando
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return NextResponse.json({ error: "Archivo OCR aún no existe" }, { status: 404 });
      }
      throw err;
    }

    const outJson = JSON.parse(outText);
    let modified = false;

    // 2. Lógica de Enriquecimiento con DynamoDB
    if (outJson.extraccion) {
      const ext = outJson.extraccion;

      const enrichEntity = async (entity: any) => {
        if (entity && entity.nombre?.valor && !entity.ruc?.valor) {
          const cleanName = cleanBusinessName(entity.nombre.valor);
          try {
            const result = await dynamoDb.send(new GetCommand({
              TableName: "AqtivaChatDB",
              Key: { PK: `COMPANY#${cleanName}`, SK: "METADATA" }
            }));

            if (result.Item && result.Item.ruc) {
              entity.ruc = { valor: result.Item.ruc, valido: true };
              modified = true;
            }
          } catch (e) {
            console.error("Error consultando catálogo de empresas:", e);
          }
        }
      };

      await enrichEntity(ext.emisor);
      await enrichEntity(ext.receptor);
    }

    // 3. Si agregamos algún RUC, sobrescribimos el archivo en S3
    if (modified) {
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: s3_key,
        Body: JSON.stringify(outJson, null, 2),
        ContentType: "application/json"
      }));
    }

    return NextResponse.json({ success: true, enriched: modified });

  } catch (error: any) {
    console.error("Error en endpoint de enriquecimiento:", error);
    return NextResponse.json({ error: "Fallo al enriquecer documento" }, { status: 500 });
  }
}