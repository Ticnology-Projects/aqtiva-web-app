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
        const parsedData = JSON.parse(jsonString);
        originalImagePath = parsedData.archivo;

        // 🚨 FALLBACK SALVAVIDAS: Si el JSON de processed/ no tiene la propiedad "archivo"
        // (Como ocurrió con los vouchers que subiste recientemente)
        if (!originalImagePath && s3_key_json.startsWith("processed/")) {
            const outputKey = s3_key_json.replace("processed/", "output/");
            try {
                const outResponse = await s3Client.send(new GetObjectCommand({
                    Bucket: process.env.BUCKET_NAME,
                    Key: outputKey,
                }));
                const outStr = await outResponse.Body?.transformToString();
                if (outStr) {
                    originalImagePath = JSON.parse(outStr).archivo;
                }
            } catch (e) {
                console.error("Fallback a output/ falló:", e);
            }
        }
      }
    }

    // Evitamos el error 500 si la ruta final sigue siendo undefined
    if (!originalImagePath) {
      return NextResponse.json(
        { error: "No se pudo encontrar el archivo original (png/pdf) vinculado a este JSON." }, 
        { status: 404 }
      );
    }

    const getImageCommand = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: originalImagePath,
    });

    const url = await getSignedUrl(s3Client, getImageCommand, { expiresIn: 3600 });
    return NextResponse.json({ success: true, url });

  } catch (error: any) {
    console.error("Error obteniendo URL de imagen:", error);
    return NextResponse.json({ error: "Fallo interno al obtener la imagen." }, { status: 500 });
  }
}