import { NextResponse } from "next/server";
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

const BUCKET_NAME = process.env.BUCKET_NAME!;

export async function GET() {
  try {
    const [mdListResponse, jsonListResponse] = await Promise.all([
      s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: "processed-invoice/" })),
      s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: "processed/" }))
    ]);

    const mdKeys = (mdListResponse.Contents || []).map(o => o.Key!).filter(k => k.endsWith('.md'));
    const jsonKeys = (jsonListResponse.Contents || []).map(o => o.Key!).filter(k => k.endsWith('.json'));

    const catalogPromises = mdKeys.map(async (key) => {
      const response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
      const mdContent = await response.Body!.transformToString("utf-8");
      
      const docMatch = mdContent.match(/\*\*(?:NÃºmero|Número)\s+Documento:\*\*\s+([A-Z0-9-]+)/i);
      const clienteMatch = mdContent.match(/\*\*Cliente:\*\*\s+(.+)/i);
      const montoMatch = mdContent.match(/\*\*Monto Total:\*\*\s+([\d.]+)/i);
      const estadoMatch = mdContent.match(/\*\*Estado:\*\*\s+([A-Z]+)/i);

      return {
        id: docMatch ? docMatch[1] : key,
        clienteOriginal: clienteMatch ? clienteMatch[1].trim() : "Desconocido",
        montoOriginal: montoMatch ? parseFloat(montoMatch[1]) : 0,
        estadoOriginal: estadoMatch ? estadoMatch[1].trim() : "DESCONOCIDO",
        mdKey: key
      };
    });

    const catalogDocs = await Promise.all(catalogPromises);

    const dashboardData = await Promise.all(catalogDocs.map(async (doc) => {
      const matchedJsonKey = jsonKeys.find(k => k.includes(doc.id));
      
      let conciliacion = null;
      let s3KeyOutput = null;
      let extraccionOCR = null;

      if (matchedJsonKey) {
        // 1. Leer el archivo de la IA (processed/)
        const jsonResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: matchedJsonKey }));
        const jsonContent = await jsonResponse.Body!.transformToString("utf-8");
        const parsedJson = JSON.parse(jsonContent);
        
        conciliacion = parsedJson.conciliacion;
        s3KeyOutput = parsedJson.s3_key; // ej: "output/factura_crazy_llama_...json"

        // 2. Usar el s3_key para leer el comprobante original (output/)
        if (s3KeyOutput) {
          try {
            const outputResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3KeyOutput }));
            const outputContent = await outputResponse.Body!.transformToString("utf-8");
            extraccionOCR = JSON.parse(outputContent).extraccion;
          } catch (error) {
            console.error(`No se pudo leer el archivo original OCR en: ${s3KeyOutput}`, error);
          }
        }
      }

      return {
        factura: doc.id,
        cliente: doc.clienteOriginal,
        monto: doc.montoOriginal,
        estadoCatalogo: doc.estadoOriginal,
        nivelConfianza: conciliacion ? conciliacion.nivel_confianza : "SIN_MATCH",
        estadoIA: conciliacion && conciliacion.factura_sugerida ? conciliacion.factura_sugerida.estado : "PENDIENTE",
        justificacion: conciliacion ? conciliacion.justificacion : "No se encontró voucher procesado para este documento.",
        score: conciliacion ? conciliacion.score_kb : 0,
        camposCoincidentes: conciliacion?.campos_coincidentes || [],
        camposDiscrepantes: conciliacion?.campos_discrepantes || [],
        extraccionOriginal: extraccionOCR,
        s3KeyOutput: s3KeyOutput,
        s3KeyProcessed: matchedJsonKey || null
      };
    }));

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error("Error unificando dashboard:", error);
    return NextResponse.json({ error: "Fallo al procesar el dashboard" }, { status: 500 });
  }
}