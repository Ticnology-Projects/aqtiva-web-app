import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

// Función auxiliar para formatear la fecha
function formatExcelDate(dateVal: any) {
  if (!dateVal) return "";
  // Si viene como string o ISO
  if (typeof dateVal === "string") return dateVal.split("T")[0];
  return String(dateVal);
}

// Función auxiliar para limpiar strings y crear nombres de archivo válidos
function sanitizeFilename(name: string) {
  if (!name) return "SIN_NOMBRE";
  return name
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[^A-Z0-9-]/g, "_") // Reemplazar caracteres raros y espacios por guiones bajos
    .replace(/_+/g, "_") // Evitar múltiples guiones bajos seguidos
    .replace(/_$/, ""); // Quitar guion bajo al final
}

export async function POST(req: Request) {
  try {
    const { rows, fuenteOriginal } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No se proporcionaron filas válidas" }, { status: 400 });
    }

    const bucketName = process.env.BUCKET_NAME;
    let procesados = 0;
    let errores = 0;

    for (const row of rows as any[]) {
      let correlativo = "";
      let serie = "";
      let cliente = "CLIENTE_DESCONOCIDO";

      // 1. Búsqueda dinámica y difusa de las columnas clave
      for (const [key, value] of Object.entries(row)) {
        // Limpiamos la llave: quitamos tildes, pasamos a minúsculas y quitamos espacios
        const cleanKey = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        if (cleanKey.includes("comprobante") || cleanKey.includes("numero documento") || cleanKey === "documento") {
          correlativo = String(value).trim();
        } else if (cleanKey === "serie") {
          serie = String(value).trim();
        } else if (cleanKey.includes("cliente") || cleanKey.includes("razon social")) {
          cliente = String(value).trim();
        }
      }

      // Si no hay correlativo (factura), saltamos esta fila y LO REGISTRAMOS en consola
      if (!correlativo) {
        console.log("⚠️ Fila ignorada (no se halló ID de documento):", row);
        continue;
      }

      const numDoc = serie ? `${serie}-${correlativo}` : correlativo;

      // 2. Construir el nombre del archivo de forma segura
      const safeCliente = sanitizeFilename(cliente);
      const filename = `${numDoc}-${safeCliente}.md`;

      // 3. Generar el Markdown de forma dinámica
      let markdownContent = `## ${numDoc} — ${cliente}\n\n`;

      for (const [key, value] of Object.entries(row)) {
        const cleanKey = key.replace(/\n/g, " ").trim();
        let safeValue = value === null || value === undefined ? "" : value;
        
        if (cleanKey.toLowerCase().includes("fecha")) {
           safeValue = formatExcelDate(value);
        }
        markdownContent += `- **${cleanKey}:** ${safeValue}\n`;
      }
      
      markdownContent += `- **Fuente:** ${fuenteOriginal || "EXCEL SUBIDO MANUALMENTE"}\n`;

      // 4. Subir a S3
      const s3Params = {
        Bucket: bucketName,
        Key: `processed-invoice/${filename}`,
        Body: markdownContent,
        ContentType: "text/markdown",
      };

      try {
        await s3Client.send(new PutObjectCommand(s3Params));
        procesados++;
      } catch (err) {
        console.error(`Error subiendo factura ${filename} a S3:`, err);
        errores++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Proceso completado. ${procesados} facturas convertidas a MD y subidas a S3. Errores: ${errores}`,
    });

  } catch (error: any) {
    console.error("Error crítico en procesador Excel:", error);
    return NextResponse.json({ error: "Fallo interno en el servidor" }, { status: 500 });
  }
}