import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

const updateOcrField = (parentObj: any, key: string, newValue: any) => {
  if (!parentObj[key]) {
    parentObj[key] = { valor: newValue, valido: true };
  } else {
    parentObj[key].valor = newValue;
    parentObj[key].valido = true; // Si lo edita un humano, lo damos por válido
  }
};

export async function POST(req: Request) {
  try {
    const { s3KeyOutput, s3KeyProcessed, updates } = await req.json();
    const bucketName = process.env.BUCKET_NAME!;

    // 1. Actualizar el archivo de Extracción (Textract/OCR - Carpeta output/)
    if (s3KeyOutput) {
      const outRes = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3KeyOutput }));
      const outText = await outRes.Body!.transformToString("utf-8");
      const outJson = JSON.parse(outText);

      if (outJson.extraccion) {
        const ext = outJson.extraccion;

        // Actualizamos los campos estándar
        updateOcrField(ext, 'importe_total', Number(updates.importe_total));
        updateOcrField(ext, 'fecha_emision', updates.fecha_emision);
        updateOcrField(ext, 'numero_operacion', updates.numero_operacion);

        // Subtotal e IGV (Anidados)
        if (!ext.totales) ext.totales = {};
        updateOcrField(ext.totales, 'subtotal', Number(updates.subtotal));
        updateOcrField(ext.totales, 'igv', Number(updates.igv));

        // Emisor (Nombre y RUC)
        if (!ext.emisor) ext.emisor = {};
        updateOcrField(ext.emisor, 'nombre', updates.emisor_nombre);
        updateOcrField(ext.emisor, 'ruc', updates.emisor_ruc);

        // Receptor (Nombre y RUC)
        if (!ext.receptor) ext.receptor = {};
        updateOcrField(ext.receptor, 'nombre', updates.receptor_nombre);
        updateOcrField(ext.receptor, 'ruc', updates.receptor_ruc);

        // Actualizamos los objetos anidados de forma segura
        if (!ext.emisor) ext.emisor = { nombre: { valor: "", valido: true } };
        if (!ext.emisor.nombre) ext.emisor.nombre = { valor: "", valido: true };
        ext.emisor.nombre.valor = updates.emisor_nombre;

        if (!ext.receptor) ext.receptor = { nombre: { valor: "", valido: true } };
        if (!ext.receptor.nombre) ext.receptor.nombre = { valor: "", valido: true };
        ext.receptor.nombre.valor = updates.receptor_nombre;
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

      if (procJson.conciliacion) {
        procJson.conciliacion.nivel_confianza = updates.nivel_confianza;
        procJson.conciliacion.justificacion = updates.justificacion; // Editamos el razonamiento
        procJson.conciliacion.score_kb = Number(updates.score_kb);   // Editamos el score
        
        if (!procJson.conciliacion.factura_sugerida) procJson.conciliacion.factura_sugerida = {};
        procJson.conciliacion.factura_sugerida.numero_documento = updates.factura_sugerida;
        procJson.conciliacion.factura_sugerida.estado = updates.estado;
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