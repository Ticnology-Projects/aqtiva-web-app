import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const dynamic = "force-dynamic";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

export async function POST(req: Request) {
  try {
    const { s3_key_json } = await req.json();

    if (!s3_key_json || s3_key_json === "N/A" || !s3_key_json.includes("/")) {
      return NextResponse.json(
        { error: "Llave de S3 inválida" },
        { status: 400 },
      );
    }

    let originalImagePath = s3_key_json;

    // Si es un JSON (Viene de IA), extraemos la ruta de su interior
    if (s3_key_json.endsWith(".json")) {
      const getJsonCommand = new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: s3_key_json,
      });
      const jsonResponse = await s3Client.send(getJsonCommand);
      const jsonString = await jsonResponse.Body?.transformToString();
      if (jsonString) {
        originalImagePath = JSON.parse(jsonString).archivo;
      }
    }
    // Si NO es JSON, significa que es nuestro ADJUNTO MANUAL directo (.png), así que usamos la ruta original.

    const getImageCommand = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: originalImagePath,
    });

    const signedUrl = await getSignedUrl(s3Client, getImageCommand, {
      expiresIn: 3600,
    });
    return NextResponse.json({ success: true, url: signedUrl });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
