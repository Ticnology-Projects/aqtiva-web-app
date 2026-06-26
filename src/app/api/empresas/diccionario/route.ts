import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const BUCKET_NAME = process.env.BUCKET_NAME;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ruc = searchParams.get("ruc");

    if (!ruc) return NextResponse.json({ error: "RUC de empresa requerido" }, { status: 400 });

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `dictionaries/${ruc}.json`,
    });

    const response = await s3Client.send(command);
    const fileContents = await response.Body?.transformToString();
    
    return NextResponse.json({ success: true, data: JSON.parse(fileContents || "{}") });

  } catch (error: any) {
    if (error.name === "NoSuchKey") {
      // Es completamente normal que no exista si es una empresa nueva
      return NextResponse.json({ success: true, data: {} });
    }
    console.error("Error obteniendo diccionario de S3:", error);
    return NextResponse.json({ error: "Error interno al leer el diccionario" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ruc, diccionario } = body;

    if (!ruc || !diccionario) {
      return NextResponse.json({ error: "Faltan parámetros requeridos" }, { status: 400 });
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `dictionaries/${ruc}.json`,
      Body: JSON.stringify(diccionario, null, 2),
      ContentType: "application/json"
    });

    await s3Client.send(command);

    return NextResponse.json({ success: true, message: "Diccionario actualizado correctamente en S3." });

  } catch (error: any) {
    console.error("Error guardando diccionario en S3:", error);
    return NextResponse.json({ error: "Error interno al guardar el diccionario" }, { status: 500 });
  }
}