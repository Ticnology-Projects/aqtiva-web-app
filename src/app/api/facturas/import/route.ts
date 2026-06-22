import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { dynamoDb } from "@/lib/dynamodb";
import { s3Client } from "@/lib/s3";

const BUCKET_NAME = process.env.BUCKET_NAME!;

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
      let numDoc = String(getValueByKeywords(row, ["NUM. DOC", "COMPROBANTE", "DOCUMENTO", "FACTURA"])).trim();
      const serie = String(getValueByKeywords(row, ["SERIE"])).trim();
      if (serie && !numDoc.includes(serie)) numDoc = `${serie}-${numDoc}`;
      
      if (!numDoc || numDoc === "-") continue;

      const cliente = String(getValueByKeywords(row, ["CLIENTE", "RAZÓN SOCIAL", "RAZON SOCIAL", "APELLIDOS Y NOMBRE"])).trim();
      const ruc = String(getValueByKeywords(row, ["RUC", "DNI", "DOCUMENTO IDENTIDAD"])).trim();
      
      const fechaEmision = formatExcelDate(getValueByKeywords(row, ["FECHA EMISION", "FECHA EMISIÓN", "EMISIÓN", "EMISION"]));
      const fechaVencimiento = formatExcelDate(getValueByKeywords(row, ["FECHA VENCIMIENTO", "VENCIMIENTO", "FECHA VENC", "FECHA DE VENCIMIENTO"]));
      
      const monedaOriginal = String(getValueByKeywords(row, ["DIVISA", "MONEDA"])).trim().toUpperCase();
      let moneda = "SOLES";
      if (monedaOriginal.includes("USD") || monedaOriginal.includes("DOLAR") || monedaOriginal.includes("DÓLAR")) moneda = "USD";
      else if (monedaOriginal.includes("EUR") || monedaOriginal.includes("EURO")) moneda = "EUR";
      else if (monedaOriginal === "PEN" || monedaOriginal.includes("SOL")) moneda = "SOLES";
      else if (monedaOriginal) moneda = monedaOriginal;
      
      let montoBrutoStr = String(getValueByKeywords(row, ["MONTO TOTAL", "TOTAL", "MONTO FACTURADO", "IMPORTE"]));
      let monto = parseFloat(montoBrutoStr.replace(/[^0-9.-]+/g,""));
      if (isNaN(monto)) monto = 0;

      // 🚨 CÁLCULO DE DETRACCIONES Y MONTO NETO
      const aplicaDetraccionStr = String(getValueByKeywords(row, ["APLICA DETRACCION", "APLICA DETRACCIÓN"])).trim().toUpperCase();
      const tieneDetraccion = aplicaDetraccionStr === "SI" || aplicaDetraccionStr === "SÍ" || aplicaDetraccionStr === "TRUE";

      let tasaDetraccion = 0;
      let montoDetraccion = 0;
      let montoNetoPagar = monto;

      if (tieneDetraccion) {
        const tasaStr = String(getValueByKeywords(row, ["TASA DETRACCION", "TASA DETRACCIÓN", "TASA"])).trim();
        tasaDetraccion = parseFloat(tasaStr.replace(/[^0-9.-]+/g, ""));
        if (isNaN(tasaDetraccion)) tasaDetraccion = 0;
        
        // Convertimos a decimal (ej. si viene 10 o 10% -> 0.10)
        if (tasaDetraccion >= 1) tasaDetraccion = tasaDetraccion / 100;
        
        montoDetraccion = parseFloat((monto * tasaDetraccion).toFixed(2));
        montoNetoPagar = parseFloat((monto - montoDetraccion).toFixed(2));
      }

      const estadoExcel = String(getValueByKeywords(row, ["ESTADO", "SITUACION", "SITUACIÓN"])).trim().toUpperCase();
      let estadoFinal = "PENDIENTE";
      if (estadoExcel.includes("COBRADO") || estadoExcel.includes("CANCELADO") || estadoExcel.includes("PAGADO")) estadoFinal = "COBRADO";

      const PK = `INVOICE#${empresaEmisoraRuc}#${numDoc}`;
      
      try {
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
            fecha_importacion: new Date().toISOString(),
            // 🚨 NUEVOS CAMPOS EN DYNAMODB
            tiene_detraccion: tieneDetraccion,
            tasa_detraccion: tasaDetraccion,
            monto_detraccion: montoDetraccion,
            monto_neto_pagar: montoNetoPagar
          },
          ConditionExpression: "attribute_not_exists(PK)"
        }));

        // 🚨 ARCHIVO DE TEXTO PARA LA IA (INCLUYENDO NETO Y DESGLOSE)
        const textoS3 = `**Número Documento:** ${numDoc}\n**Cliente:** ${cliente}\n**RUC Cliente:** ${ruc}\n**Monto Total Bruto:** ${monto}\n**Moneda:** ${moneda}\n**Fecha Emisión:** ${fechaEmision}\n**Fecha Vencimiento:** ${fechaVencimiento || "No especificada"}\n**Sujeto a Detracción:** ${tieneDetraccion ? 'SI' : 'NO'}\n**Tasa Detracción:** ${tasaDetraccion * 100}%\n**Monto Detracción:** ${montoDetraccion}\n**Monto Neto a Pagar:** ${montoNetoPagar}\n**Estado:** ${estadoFinal}`;

        const keyS3 = `processed-invoice/${numDoc}.txt`;

        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: keyS3,
          Body: textoS3,
          ContentType: "text/plain"
        }));

        procesados++;
      } catch (err: any) {
        if (err.name !== "ConditionalCheckFailedException") console.error(`Error guardando factura ${numDoc}:`, err);
        errores++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Catálogo actualizado: ${procesados} facturas importadas (${errores} duplicados o errores).`,
    });

  } catch (error: any) {
    return NextResponse.json({ error: "Fallo interno en el servidor" }, { status: 500 });
  }
}