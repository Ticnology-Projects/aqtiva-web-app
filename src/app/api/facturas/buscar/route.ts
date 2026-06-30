import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rucEmisor = searchParams.get("rucEmisor");
    const queryTerm = (searchParams.get("q") || "").toLowerCase();

    if (!rucEmisor) {
      return NextResponse.json({ error: "RUC emisor es requerido" }, { status: 400 });
    }

    // Buscamos todas las facturas del emisor que estén PENDIENTES
    const params = {
      TableName: "AqtivaChatDB",
      // 🚨 CORRECCIÓN APLICADA: Se usa attribute_not_exists() correctamente
      FilterExpression: "begins_with(PK, :prefix) AND (estado = :estado OR attribute_not_exists(estado))",
      ExpressionAttributeValues: {
        ":prefix": `INVOICE#${rucEmisor}#`,
        ":estado": "PENDIENTE" 
      }
    };

    const command = new ScanCommand(params);
    const result = await ddbDocClient.send(command);
    let items = result.Items || [];

    // Filtramos en memoria usando los nombres CORRECTOS de tu base de datos
    if (queryTerm) {
      items = items.filter((item: any) => 
        (item.numero_documento && item.numero_documento.toLowerCase().includes(queryTerm)) ||
        (item.cliente && item.cliente.toLowerCase().includes(queryTerm)) ||
        (item.ruc_cliente && item.ruc_cliente.toLowerCase().includes(queryTerm)) ||
        (item.monto && item.monto.toString().includes(queryTerm)) ||
        (item.monto_neto_pagar && item.monto_neto_pagar.toString().includes(queryTerm))
      );
    }

    return NextResponse.json({ success: true, data: items.slice(0, 20) });

  } catch (error) {
    console.error("Error buscando facturas:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}