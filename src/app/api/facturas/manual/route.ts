import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

// Inicialización exclusiva de DynamoDB
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rucEmisor, empresaNombre, facturas, emailUsuario } = body;

    if (!rucEmisor || !Array.isArray(facturas) || facturas.length === 0 || !emailUsuario) {
      return NextResponse.json({ error: "Faltan parámetros requeridos o facturas inválidas." }, { status: 400 });
    }

    // 🚨 REGRESAMOS AL FORMATO ZULU (UTC) ESTÁNDAR PARA IGUALAR A LA CARGA MASIVA
    const timestampZ = new Date().toISOString();

    const promesas = facturas.map(async (fac: any) => {
      // 1. Limpieza y Formateo Visual
      const numDoc = fac.numero_documento.toUpperCase().trim(); 
      const fechaEmi = formatFechaPeru(fac.fecha_emision);
      const fechaVen = formatFechaPeru(fac.fecha_vencimiento);

      // 2. Lógica Matemática Estricta y Homologada
      const montoBruto = Number(fac.monto_total || 0);
      let tasaDecimal = 0; 
      let montoDetraccion = 0; 
      let montoNeto = montoBruto;
      
      // 🚨 EVALUACIÓN RIGUROSA: Retorna un BOOLEAN puro (true o false), NO string.
      const tieneDetraccion = fac.tiene_detraccion === true || fac.tiene_detraccion === "true";

      if (tieneDetraccion) {
        let inputTasa = parseFloat(fac.tasa_detraccion) || 0;
        // Si el usuario pone "12", se guarda como 0.12
        tasaDecimal = inputTasa > 1 ? inputTasa / 100 : inputTasa;
        montoDetraccion = Number((montoBruto * tasaDecimal).toFixed(2));
        montoNeto = Number((montoBruto - montoDetraccion).toFixed(2));
      }

      // 3. Inserción en DynamoDB. 
      // Al hacer este PutCommand, tu Lambda sync_catalog.py se disparará automáticamente 
      // y creará los archivos .txt y metadata.json a la perfección.
      await ddbDocClient.send(new PutCommand({
        TableName: "AqtivaChatDB",
        Item: {
          PK: `INVOICE#${rucEmisor}#${numDoc}`,
          SK: "METADATA",
          empresa_emisora_ruc: rucEmisor,
          empresa_emisora_nombre: empresaNombre || "",
          usuario_propietario: emailUsuario, // Sello multi-tenant
          numero_documento: numDoc, 
          cliente: fac.cliente,
          ruc_cliente: fac.ruc_cliente,
          moneda: fac.moneda || "SOLES",
          
          monto: Number(montoBruto.toFixed(2)),
          monto_detraccion: Number(montoDetraccion.toFixed(2)), 
          tasa_detraccion: tieneDetraccion ? Number(tasaDecimal) : 0, // 🚨 SE GUARDA COMO NUMBER: 0.12 o 0
          monto_neto_pagar: Number(montoNeto.toFixed(2)),
          tiene_detraccion: tieneDetraccion, // 🚨 SE GUARDA COMO BOOLEAN: true o false
          
          fecha_emision: fechaEmi,
          fecha_vencimiento: fechaVen,
          estado: "PENDIENTE",
          fuente_importacion: "MANUAL",
          metodo_resolucion: "", // Vacío, igual que la carga masiva
          fecha_importacion: timestampZ 
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