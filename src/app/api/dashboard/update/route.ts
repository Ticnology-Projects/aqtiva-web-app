import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

export async function POST(req: Request) {
  try {
    const { s3KeyOutput, s3KeyProcessed, updates } = await req.json();
    const bucketName = process.env.BUCKET_NAME!;

    // 1. Actualizar el archivo de Extracción (Textract/OCR - Carpeta output/)
    if (s3KeyOutput) {
      const outRes = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3KeyOutput }));
      const outText = await outRes.Body!.transformToString("utf-8");
      const outJson = JSON.parse(outText);

      // Inyectamos los nuevos valores editados
      if (outJson.extraccion) {
        if (outJson.extraccion.importe_total) outJson.extraccion.importe_total.valor = Number(updates.importe_total);
        if (outJson.extraccion.emisor?.nombre) outJson.extraccion.emisor.nombre.valor = updates.emisor_nombre;
        if (outJson.extraccion.receptor?.nombre) outJson.extraccion.receptor.nombre.valor = updates.receptor_nombre;
        if (outJson.extraccion.fecha_emision) outJson.extraccion.fecha_emision.valor = updates.fecha_emision;
        if (outJson.extraccion.numero_operacion) outJson.extraccion.numero_operacion.valor = updates.numero_operacion;
      }

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: s3KeyOutput,
        Body: JSON.stringify(outJson, null, 2),
        ContentType: "application/json"
      }));
    }

    // 2. Actualizar el archivo de Análisis (IA Bedrock - Carpeta processed/)
    if (s3KeyProcessed) {
      const procRes = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3KeyProcessed }));
      const procText = await procRes.Body!.transformToString("utf-8");
      const procJson = JSON.parse(procText);

      // Inyectamos los nuevos valores de conciliación
      if (procJson.conciliacion) {
        procJson.conciliacion.nivel_confianza = updates.nivel_confianza;
        if (procJson.conciliacion.factura_sugerida) {
          procJson.conciliacion.factura_sugerida.numero_documento = updates.factura_sugerida;
          procJson.conciliacion.factura_sugerida.estado = updates.estado;
        }
      }

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: s3KeyProcessed,
        Body: JSON.stringify(procJson, null, 2),
        ContentType: "application/json"
      }));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error actualizando JSONs en S3:", error);
    return NextResponse.json({ error: "Fallo al actualizar los archivos en S3" }, { status: 500 });
  }
}