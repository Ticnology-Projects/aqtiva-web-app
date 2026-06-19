import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { dynamoDb } from "@/lib/dynamodb";
import { s3Client } from "@/lib/s3"; // 🚨 Asegúrate de tener exportado s3Client

const BUCKET_NAME = process.env.BUCKET_NAME!;

// Utilidad mejorada: Primero busca coincidencia exacta, luego parcial.
function getValueByKeywords(row: any, keywords: string[]) {
  let foundKey = Object.keys(row).find(k => 
    keywords.some(keyword => k.trim().toUpperCase() === keyword.toUpperCase())
  );
  
  if (!foundKey) {
    foundKey = Object.keys(row).find(k => 
      keywords.some(keyword => k.toUpperCase().includes(keyword.toUpperCase()))
    );
  }
  
  return foundKey ? row[foundKey] : "";
}

function formatExcelDate(serial: any) {
  if (!serial) return "";
  if (typeof serial === "string" && serial.includes("/")) return serial.trim();
  if (typeof serial === "string" && serial.includes("-")) return serial.trim();
  if (typeof serial === "number") {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return date.toLocaleDateString("es-PE", { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(serial).trim();
}

export async function POST(req: Request) {
  try {
    const { rows, fuenteOriginal, empresaEmisoraRuc, empresaEmisoraNombre, usuarioId } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No se proporcionaron filas válidas" }, { status: 400 });
    }

    let procesados = 0;
    let errores = 0;

    for (const row of rows) {
      // 1. EXTRAER NÚMERO DE DOCUMENTO
      let numDoc = String(getValueByKeywords(row, ["NUM. DOC", "COMPROBANTE", "DOCUMENTO", "FACTURA"])).trim();
      const serie = String(getValueByKeywords(row, ["SERIE"])).trim();
      if (serie && !numDoc.includes(serie)) {
        numDoc = `${serie}-${numDoc}`;
      }
      
      if (!numDoc || numDoc === "-") continue;

      // 2. EXTRAER EL RESTO DE CAMPOS ESTANDARIZADOS
      const cliente = String(getValueByKeywords(row, ["CLIENTE", "RAZÓN SOCIAL", "RAZON SOCIAL", "APELLIDOS Y NOMBRE"])).trim();
      const ruc = String(getValueByKeywords(row, ["RUC", "DNI", "DOCUMENTO IDENTIDAD"])).trim();
      
      const fechaEmision = formatExcelDate(getValueByKeywords(row, ["FECHA EMISION", "FECHA EMISIÓN", "EMISIÓN", "EMISION"]));
      const fechaVencimiento = formatExcelDate(getValueByKeywords(row, ["FECHA VENCIMIENTO", "VENCIMIENTO", "FECHA VENC", "FECHA DE VENCIMIENTO"]));
      
      const monedaOriginal = String(getValueByKeywords(row, ["DIVISA", "MONEDA"])).trim().toUpperCase();
      
      let moneda = "SOLES";
      if (monedaOriginal.includes("USD") || monedaOriginal.includes("DOLAR") || monedaOriginal.includes("DÓLAR")) {
        moneda = "USD";
      } else if (monedaOriginal.includes("EUR") || monedaOriginal.includes("EURO")) {
        moneda = "EUR";
      } else if (monedaOriginal === "PEN" || monedaOriginal.includes("SOL")) {
        moneda = "SOLES";
      } else if (monedaOriginal) {
        moneda = monedaOriginal;
      }
      
      let montoBruto = String(getValueByKeywords(row, ["MONTO TOTAL", "TOTAL", "MONTO FACTURADO", "IMPORTE"]));
      let monto = parseFloat(montoBruto.replace(/[^0-9.-]+/g,""));
      if (isNaN(monto)) monto = 0;

      const estadoExcel = String(getValueByKeywords(row, ["ESTADO", "SITUACION", "SITUACIÓN"])).trim().toUpperCase();
      let estadoFinal = "PENDIENTE";
      if (estadoExcel.includes("COBRADO") || estadoExcel.includes("CANCELADO") || estadoExcel.includes("PAGADO")) {
        estadoFinal = "COBRADO";
      }

      const PK = `INVOICE#${empresaEmisoraRuc}#${numDoc}`;
      
      try {
        // 3. GUARDAR EN DYNAMODB
        await dynamoDb.send(new PutCommand({
          TableName: "AqtivaChatDB",
          Item: {
            PK: PK,
            SK: "METADATA",
            numero_documento: numDoc,
            cliente: cliente,
            ruc_cliente: ruc,
            empresa_emisora_ruc: empresaEmisoraRuc,  
            empresa_emisora_nombre: empresaEmisoraNombre, 
            usuario_propietario: usuarioId,
            monto: monto,
            moneda: moneda,
            fecha_emision: fechaEmision,
            fecha_vencimiento: fechaVencimiento,
            estado: estadoFinal,
            fuente_importacion: fuenteOriginal || "Excel",
            fecha_importacion: new Date().toISOString()
          },
          ConditionExpression: "attribute_not_exists(PK)" // Evita duplicados
        }));

        // 🚨 4. NUEVO: GENERAR EL ARCHIVO DE TEXTO Y SUBIRLO A S3
        // Esto creará el archivo que la Inteligencia Artificial lee, con TODOS los campos
        const textoS3 = `**Número Documento:** ${numDoc}\n**Cliente:** ${cliente}\n**RUC Cliente:** ${ruc}\n**Monto Total:** ${monto}\n**Moneda:** ${moneda}\n**Fecha Emisión:** ${fechaEmision}\n**Fecha Vencimiento:** ${fechaVencimiento || "No especificada"}\n**Estado:** ${estadoFinal}`;

        const keyS3 = `processed-invoice/${numDoc}.txt`;

        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: keyS3,
          Body: textoS3,
          ContentType: "text/plain"
        }));

        procesados++;
      } catch (err: any) {
        if (err.name !== "ConditionalCheckFailedException") {
           console.error(`Error guardando factura ${numDoc}:`, err);
        }
        errores++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Catálogo actualizado: ${procesados} facturas importadas a la base de datos y a S3 (${errores} duplicados ignorados o errores).`,
    });

  } catch (error: any) {
    console.error("Error crítico importando Excel:", error);
    return NextResponse.json({ error: "Fallo interno en el servidor" }, { status: 500 });
  }
}