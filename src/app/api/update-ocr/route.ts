import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

const BUCKET_NAME = process.env.BUCKET_NAME!;

export async function POST(request: Request) {
  try {
    const { s3KeyOutput, s3KeyProcessed, updates } = await request.json();

    if (!s3KeyOutput) {
      return NextResponse.json({ error: "Faltan parámetros de S3" }, { status: 400 });
    }

    // ==========================================
    // 1. ACTUALIZAR EL ARCHIVO ORIGINAL (output/)
    // ==========================================
    const outputResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3KeyOutput }));
    const outputContent = await outputResponse.Body!.transformToString("utf-8");
    const jsonOriginal = JSON.parse(outputContent);

    if (jsonOriginal.extraccion) {
      const ext = jsonOriginal.extraccion;
      if (updates.numero_documento !== undefined) ext.numero_documento = { valor: updates.numero_documento, valido: true };
      if (updates.numero_operacion !== undefined) ext.numero_operacion = { valor: updates.numero_operacion, valido: true };
      if (updates.fecha_emision !== undefined) ext.fecha_emision = { valor: updates.fecha_emision, valido: true };
      if (updates.importe_total !== undefined) ext.importe_total = { valor: Number(updates.importe_total), valido: true };
      if (updates.moneda !== undefined) ext.moneda = { valor: updates.moneda, valido: true };
      
      if (updates.emisor_nombre !== undefined) {
        if (!ext.emisor) ext.emisor = {};
        ext.emisor.nombre = { valor: updates.emisor_nombre, valido: true };
      }
      if (updates.receptor_nombre !== undefined) {
        if (!ext.receptor) ext.receptor = {};
        ext.receptor.nombre = { valor: updates.receptor_nombre, valido: true };
      }
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3KeyOutput,
      Body: JSON.stringify(jsonOriginal, null, 2),
      ContentType: "application/json"
    }));

    // ==========================================
    // 2. ACTUALIZAR EL ARCHIVO DE IA (processed/)
    // ==========================================
    if (s3KeyProcessed) {
      const processedResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3KeyProcessed }));
      const processedContent = await processedResponse.Body!.transformToString("utf-8");
      const jsonProcessed = JSON.parse(processedContent);

      if (jsonProcessed.conciliacion) {
        // Forzamos el éxito ya que un humano lo acaba de validar
        jsonProcessed.conciliacion.nivel_confianza = "ALTO"; 
        jsonProcessed.conciliacion.justificacion = "✅ Conciliación validada y corregida manualmente por un auditor humano. Los campos discrepantes fueron subsanados.";
        
        if (jsonProcessed.conciliacion.factura_sugerida) {
          jsonProcessed.conciliacion.factura_sugerida.estado = "COBRADO";
        }

        // Limpiamos las discrepancias para que el dashboard se vea verde
        jsonProcessed.conciliacion.campos_coincidentes = [
          ...new Set([...jsonProcessed.conciliacion.campos_coincidentes, ...jsonProcessed.conciliacion.campos_discrepantes])
        ];
        jsonProcessed.conciliacion.campos_discrepantes = [];
      }

      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3KeyProcessed,
        Body: JSON.stringify(jsonProcessed, null, 2),
        ContentType: "application/json"
      }));
    }

    return NextResponse.json({ success: true, message: "Archivos actualizados en S3 exitosamente." });

  } catch (error) {
    console.error("Error al actualizar S3:", error);
    return NextResponse.json({ error: "Fallo al actualizar los archivos" }, { status: 500 });
  }
}