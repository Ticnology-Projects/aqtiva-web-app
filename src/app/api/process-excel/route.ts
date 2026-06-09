import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

// 1. Función para convertir el número serial de Excel a Fecha (Ej: 45996 -> 12/12/2025)
function formatExcelDate(serial: any) {
  if (!serial) return "";
  if (typeof serial === "number") {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return date.toLocaleDateString("es-PE", { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(serial).trim();
}

// 2. Función auxiliar para encontrar llaves con caracteres raros en el JSON
function getValueByKeywords(row: any, keywords: string[]) {
  const foundKey = Object.keys(row).find(k => 
    keywords.some(keyword => k.toUpperCase().includes(keyword.toUpperCase()))
  );
  return foundKey ? row[foundKey] : "";
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

    for (const row of rows) {
      // Identificar variables principales limpiando espacios
      const serie = String(getValueByKeywords(row, ["Serie"])).trim();
      const correlativo = String(getValueByKeywords(row, ["Comprobante", "Documento"])).trim();
      
      if (!correlativo) continue; // Saltar filas vacías

      const numDoc = serie ? `${serie}-${correlativo}` : correlativo;
      const cliente = String(getValueByKeywords(row, ["CLIENTE", "RAZON SOCIAL", "RAZÓN"])).trim();
      const filename = `${numDoc}.md`; // Nombre perfecto para el Match: F001-172.md

      // Extracción y limpieza de datos específicos
      const fechaEmision = formatExcelDate(getValueByKeywords(row, ["EMISION", "EMISI"]));
      const ruc = String(getValueByKeywords(row, ["RUC", "DNI"])).trim();
      const montoTotal = String(getValueByKeywords(row, ["MONTO TOTAL", "MONTO\n TOTAL"])).trim();
      const subtotal = String(getValueByKeywords(row, ["SUBTOTAL"])).trim();
      const igv = String(getValueByKeywords(row, ["I.G.V", "IGV"])).trim();
      const moneda = String(getValueByKeywords(row, ["MONEDA"])).trim() || "SOLES";
      const estado = String(getValueByKeywords(row, ["ESTADO"])).trim();
      const formaPago = String(getValueByKeywords(row, ["FORMA DE PAGO", "PAGO"])).trim();
      const producto = String(getValueByKeywords(row, ["Producto", "Servicio"])).trim();

      // 3. CONSTRUCCIÓN ESTRICTA DE LA PLANTILLA MARKDOWN
      // (Exactamente igual al archivo que confirmaste que SÍ funciona)
      const markdownContent = `## ${numDoc} — ${cliente}

- **Número Documento:** ${numDoc}
- **Tipo Documento:** FACTURA
- **Cliente:** ${cliente}
- **RUC:** ${ruc}
- **Fecha Emisión:** ${fechaEmision}
- **Monto Total:** ${montoTotal}
- **Moneda:** ${moneda}
- **Estado:** ${estado}
- **Forma De Pago:** ${formaPago}
- **Subtotal:** ${subtotal}
- **IGV:** ${igv}
- **Detracción:** 0
- **Producto/Servicio:** ${producto}
- **Fuente:** ${fuenteOriginal || "EXCEL SUBIDO MANUALMENTE"}
`;

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
      message: `Proceso completado. ${procesados} facturas convertidas a MD y subidas a S3.`,
    });

  } catch (error: any) {
    console.error("Error crítico en procesador Excel:", error);
    return NextResponse.json({ error: "Fallo interno en el servidor" }, { status: 500 });
  }
}