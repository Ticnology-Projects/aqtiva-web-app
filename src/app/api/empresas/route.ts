import { NextResponse } from "next/server";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

function cleanBusinessName(name: string): string {
  if (!name) return "";
  return name
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/[.,]/g, "") 
    .replace(/\s+/g, " ") 
    .trim();
}

// NUEVO: Método GET para listar las empresas
export async function GET() {
  try {
    const response = await dynamoDb.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      // Filtramos para traer solo los elementos que son empresas
      FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
      ExpressionAttributeValues: {
        ":prefix": "COMPANY#",
        ":sk": "METADATA"
      }
    }));

    return NextResponse.json({ 
      success: true, 
      data: response.Items || [] 
    });
  } catch (error: any) {
    console.error("Error obteniendo empresas de DynamoDB:", error);
    return NextResponse.json({ error: "Fallo al obtener el catálogo" }, { status: 500 });
  }
}

// Método POST que ya teníamos para crear empresas
export async function POST(req: Request) {
  try {
    const { nombre, ruc } = await req.json();

    if (!nombre || !ruc) {
      return NextResponse.json({ error: "El Nombre y el RUC son obligatorios" }, { status: 400 });
    }

    const cleanName = cleanBusinessName(nombre);
    const PK = `COMPANY#${cleanName}`;

    await dynamoDb.send(new PutCommand({
      TableName: "AqtivaChatDB", 
      Item: {
        PK: PK,
        SK: "METADATA",
        nombreOriginal: nombre.toUpperCase(),
        nombreNormalizado: cleanName,
        ruc: ruc.trim(),
        estado: "ACTIVO",
        fechaCreacion: new Date().toISOString()
      }
    }));

    return NextResponse.json({ 
      success: true, 
      message: "Empresa registrada exitosamente en el catálogo." 
    });

  } catch (error: any) {
    console.error("Error guardando empresa en DynamoDB:", error);
    return NextResponse.json({ error: "Fallo interno en el servidor de base de datos" }, { status: 500 });
  }
}