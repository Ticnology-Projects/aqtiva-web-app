import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Función para transformar YYYY-MM-DD a DD/MM/YYYY
const formatFechaPeru = (fechaISO: string) => {
  if (!fechaISO) return "";
  if (fechaISO.includes("-")) {
    const parts = fechaISO.split("-");
    if (parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  return fechaISO;
};

// Función para obtener la fecha exacta en UTC-5 (Hora Peruana)
const getTimestampUTC5 = () => {
  const limaTime = new Date(new Date().getTime() - 5 * 3600 * 1000);
  return limaTime.toISOString().replace("Z", "-05:00");
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rucEmisor, empresaNombre, facturas, emailUsuario } = body;

    if (!rucEmisor || !Array.isArray(facturas) || facturas.length === 0 || !emailUsuario) {
      return NextResponse.json({ error: "Faltan parámetros requeridos o facturas inválidas." }, { status: 400 });
    }

    const timestampPeru = getTimestampUTC5();

    const promesas = facturas.map((fac: any) => {
      // 1. Limpieza y Formateo Visual
      const numDoc = fac.numero_documento.toUpperCase().trim(); // Letra obligatoria en mayúscula
      const fechaEmi = formatFechaPeru(fac.fecha_emision);
      const fechaVen = formatFechaPeru(fac.fecha_vencimiento);

      // 2. Lógica Matemática de Detracción y Monto Neto
      const montoBruto = Number(fac.monto_total || 0);
      let tasaNum = 0;
      let montoDetraccion = 0;
      let montoNeto = montoBruto;

      if (fac.tiene_detraccion) {
        tasaNum = Number(fac.tasa_detraccion || 0);
        montoDetraccion = (montoBruto * tasaNum) / 100;
        montoNeto = montoBruto - montoDetraccion;
      }

      // 3. Inserción 100% estandarizada con la importación masiva
      return ddbDocClient.send(new PutCommand({
        TableName: "AqtivaChatDB",
        Item: {
          PK: `INVOICE#${rucEmisor}#${numDoc}`,
          SK: "METADATA",
          empresa_emisora_ruc: rucEmisor,
          empresa_emisora_nombre: empresaNombre || "",
          usuario_propietario: emailUsuario, // Sello Multi-tenant
          numero_documento: numDoc, 
          cliente: fac.cliente,
          ruc_cliente: fac.ruc_cliente,
          moneda: fac.moneda || "SOLES",
          monto: Number(montoBruto.toFixed(2)),
          
          // Formateo riguroso de detracciones
          monto_detraccion: Number(montoDetraccion.toFixed(2)), 
          tasa_detraccion: fac.tiene_detraccion ? `${tasaNum.toFixed(1)}%` : "0", 
          monto_neto_pagar: Number(montoNeto.toFixed(2)),
          tiene_detraccion: fac.tiene_detraccion ? "true" : "false",
          
          fecha_emision: fechaEmi,
          fecha_vencimiento: fechaVen,
          estado: "PENDIENTE",
          fuente_importacion: "MANUAL",
          metodo_resolucion: "MANUAL",
          fecha_importacion: timestampPeru 
        }
      }));
    });

    await Promise.all(promesas);

    return NextResponse.json({ success: true, message: `Se registraron ${facturas.length} factura(s) manuales con éxito.` });
  } catch (error) {
    console.error("Error guardando facturas manuales:", error);
    return NextResponse.json({ error: "Error interno al guardar facturas." }, { status: 500 });
  }
}