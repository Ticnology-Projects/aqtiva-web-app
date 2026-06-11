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
      const estadoMatch = mdContent.match(/\*\*Estado:\*\*\s+(.+)/i);
      
      // Intentar extraer montos
      const montoMatch = mdContent.match(/\*\*Monto Total:\*\*\s+([\d.]+)/i);
      const subtotalMatch = mdContent.match(/\*\*Subtotal:\*\*\s+([\d.]+)/i);
      const igvMatch = mdContent.match(/\*\*(?:IGV|I\.G\.V).*?:\*\*\s+([\d.]+)/i);

      // CÁLCULO DE RESPALDO: Si Monto Total está vacío, suma Subtotal + IGV
      let montoCalculado = montoMatch ? parseFloat(montoMatch[1]) : 0;
      if (!montoCalculado || isNaN(montoCalculado)) {
        const sub = subtotalMatch ? parseFloat(subtotalMatch[1]) : 0;
        const igv = igvMatch ? parseFloat(igvMatch[1]) : 0;
        montoCalculado = sub + igv;
      }

      return {
        id: docMatch ? docMatch[1] : key,
        clienteOriginal: clienteMatch ? clienteMatch[1].trim() : "Desconocido",
        montoOriginal: montoCalculado,
        estadoOriginal: estadoMatch ? estadoMatch[1].trim() : "DESCONOCIDO",
        mdKey: key,
        mdContent: mdContent // Pasamos el Markdown completo al frontend
      };
    });

    const catalogDocs = await Promise.all(catalogPromises);

    const dashboardData = await Promise.all(catalogDocs.map(async (doc) => {
      const matchedJsonKey = jsonKeys.find(k => k.includes(doc.id));
      
      let conciliacion = null;
      let s3KeyOutput = null;
      let extraccionOCR = null;

      if (matchedJsonKey) {
        const jsonResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: matchedJsonKey }));
        const jsonContent = await jsonResponse.Body!.transformToString("utf-8");
        const parsedJson = JSON.parse(jsonContent);
        
        conciliacion = parsedJson.conciliacion;
        s3KeyOutput = parsedJson.s3_key;

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

      let estadoFinalCatalogo = doc.estadoOriginal;

      if (conciliacion && conciliacion.nivel_confianza !== "SIN_MATCH") {
        let estadoSugerido = conciliacion.factura_sugerida?.estado;
        if (!estadoSugerido || estadoSugerido === "EN COBRANZA" || estadoSugerido === "PENDIENTE") {
          if (conciliacion.nivel_confianza === "ALTO") estadoSugerido = "COBRADO";
          else if (conciliacion.nivel_confianza === "MEDIO") estadoSugerido = "EN REVISIÓN";
        }
        estadoFinalCatalogo = estadoSugerido;
      }

      return {
        factura: doc.id,
        cliente: doc.clienteOriginal,
        monto: extraccionOCR?.importe_total?.valor || conciliacion?.factura_sugerida?.monto_total || doc.montoOriginal || 0,
        estadoCatalogo: estadoFinalCatalogo,
        nivelConfianza: conciliacion ? conciliacion.nivel_confianza : "SIN_MATCH",
        estadoIA: estadoFinalCatalogo,
        justificacion: conciliacion ? conciliacion.justificacion : "No se encontró voucher procesado para este documento.",
        score: conciliacion ? conciliacion.score_kb : 0,
        camposCoincidentes: conciliacion?.campos_coincidentes || [],
        camposDiscrepantes: conciliacion?.campos_discrepantes || [],
        extraccionOriginal: extraccionOCR,
        s3KeyOutput: s3KeyOutput,
        s3KeyProcessed: matchedJsonKey || null,
        markdownOriginal: doc.mdContent // Enviamos el string al Dashboard
      };
    }));

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error("Error unificando dashboard:", error);
    return NextResponse.json({ error: "Fallo al procesar el dashboard" }, { status: 500 });
  }
}