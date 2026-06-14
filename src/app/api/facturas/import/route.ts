import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

// Utilidad para extraer valores buscando coincidencias parciales en las llaves
function getValueByKeywords(row: any, keywords: string[]) {
  const foundKey = Object.keys(row).find(k => 
    keywords.some(keyword => k.toUpperCase().includes(keyword.toUpperCase()))
  );
  return foundKey ? row[foundKey] : "";
}

// Convertir fechas seriales de Excel a formato legible
function formatExcelDate(serial: any) {
  if (!serial) return "";
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
      // 1. EXTRAER NÚMERO DE DOCUMENTO (Num. Doc vs Serie + N°Comprobante)
      let numDoc = String(getValueByKeywords(row, ["Num. Doc", "Comprobante", "Documento"])).trim();
      const serie = String(getValueByKeywords(row, ["Serie"])).trim();
      if (serie && !numDoc.includes(serie)) {
        numDoc = `${serie}-${numDoc}`;
      }
      
      // Si no hay número de documento, saltamos la fila (es basura del Excel)
      if (!numDoc || numDoc === "-") continue;

      // 2. EXTRAER EL RESTO DE CAMPOS ESTANDARIZADOS
      const cliente = String(getValueByKeywords(row, ["Cliente", "RAZÓN SOCIAL", "APELLIDOS Y NOMBRE"])).trim();
      const ruc = String(getValueByKeywords(row, ["RUC", "DNI"])).trim();
      const fechaEmision = formatExcelDate(getValueByKeywords(row, ["Emisión", "EMISI"]));
      const fechaVencimiento = formatExcelDate(getValueByKeywords(row, ["Vencimiento"]));
      const monedaOriginal = String(getValueByKeywords(row, ["MONEDA", "Mon"])).trim().toUpperCase();
      
      // Normalizar Moneda
      const moneda = monedaOriginal.includes("USD") || monedaOriginal.includes("DOLARES") ? "USD" : "SOLES";
      
      // Extraer Monto limpiando símbolos de moneda si los tuviera
      let montoBruto = String(getValueByKeywords(row, ["Monto Facturado", "MONTO TOTAL", "MONTO\n TOTAL"]));
      let monto = parseFloat(montoBruto.replace(/[^0-9.-]+/g,""));
      if (isNaN(monto)) monto = 0;

      // Extraer estado original del Excel (si dice cobrado no lo ponemos pendiente)
      const estadoExcel = String(getValueByKeywords(row, ["Estado"])).trim().toUpperCase();
      let estadoFinal = "PENDIENTE";
      if (estadoExcel.includes("COBRADO") || estadoExcel.includes("CANCELADO")) {
        estadoFinal = "COBRADO";
      }

      // 3. GUARDAR EN DYNAMODB
      const PK = `INVOICE#${numDoc}`;
      
      try {
        await dynamoDb.send(new PutCommand({
          TableName: "AqtivaChatDB", // Asegúrate que este sea el nombre de tu tabla
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
          }
        }));
        procesados++;
      } catch (err) {
        console.error(`Error guardando factura ${numDoc} en DynamoDB:`, err);
        errores++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Catálogo actualizado: ${procesados} facturas importadas a la base de datos (${errores} errores).`,
    });

  } catch (error: any) {
    console.error("Error crítico importando Excel:", error);
    return NextResponse.json({ error: "Fallo interno en el servidor" }, { status: 500 });
  }
}