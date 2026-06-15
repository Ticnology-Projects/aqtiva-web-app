import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const dynamic = 'force-dynamic';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

export async function POST(req: Request) {
  try {
    const { s3_key_json } = await req.json();

    // Validamos que sea un JSON de Textract
    if (!s3_key_json || !s3_key_json.endsWith(".json")) {
      return NextResponse.json({ error: "Voucher key inválida o asignación manual" }, { status: 400 });
    }

    // 1. Descargar el JSON de S3 para leer la propiedad "archivo"
    const getJsonCommand = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: s3_key_json
    });
    
    const jsonResponse = await s3Client.send(getJsonCommand);
    const jsonString = await jsonResponse.Body?.transformToString();
    
    if (!jsonString) throw new Error("El JSON de extracción está vacío");

    const jsonData = JSON.parse(jsonString);
    const originalImagePath = jsonData.archivo;

    if (!originalImagePath) {
      throw new Error("No se encontró la ruta original de la imagen en el JSON");
    }

    // 2. Generar Presigned URL para la imagen original (carpeta input/)
    const getImageCommand = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: originalImagePath
    });

    const signedUrl = await getSignedUrl(s3Client, getImageCommand, { expiresIn: 3600 });

    return NextResponse.json({ success: true, url: signedUrl });
  } catch (error: any) {
    console.error("Error obteniendo la imagen:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}