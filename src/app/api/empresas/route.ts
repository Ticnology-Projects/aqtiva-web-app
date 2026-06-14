import { NextResponse } from "next/server";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

// Función para limpiar nombres y evitar duplicados por tildes o puntos
function cleanBusinessName(name: string): string {
  if (!name) return "";
  return name
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/[.,]/g, "") 
    .replace(/\s+/g, " ") 
    .trim();
}

// OBTENER EMPRESAS (Filtradas por usuario)
export async function GET(req: Request) {
  try {
    // Obtenemos el usuario de los parámetros de búsqueda (Query Params)
    const { searchParams } = new URL(req.url);
    const usuarioId = searchParams.get("usuarioId");

    let filterExpression = "begins_with(PK, :prefix) AND SK = :sk";
    let expressionAttributeValues: any = {
      ":prefix": "COMPANY#",
      ":sk": "METADATA"
    };

    // Filtro Multi-Tenant: Solo trae las empresas de este usuario
    if (usuarioId) {
      filterExpression += " AND usuario_propietario = :userId";
      expressionAttributeValues[":userId"] = usuarioId;
    }

    const response = await dynamoDb.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    }));

    return NextResponse.json({ 
      success: true, 
      data: response.Items || [] 
    });
  } catch (error: any) {
    console.error("Error obteniendo empresas de DynamoDB:", error);
    return NextResponse.json({ error: "Fallo al obtener el catálogo de empresas" }, { status: 500 });
  }
}

// CREAR EMPRESA NUEVA
export async function POST(req: Request) {
  try {
    const { nombre, ruc, usuarioId } = await req.json();

    if (!nombre || !ruc || !usuarioId) {
      return NextResponse.json({ error: "Nombre, RUC y Usuario son obligatorios" }, { status: 400 });
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
        usuario_propietario: usuarioId, // SELLO MULTI-TENANT
        fechaCreacion: new Date().toISOString()
      }
    }));

    return NextResponse.json({ 
      success: true, 
      message: "Empresa registrada exitosamente en tu directorio." 
    });

  } catch (error: any) {
    console.error("Error guardando empresa en DynamoDB:", error);
    return NextResponse.json({ error: "Fallo interno al guardar la empresa" }, { status: 500 });
  }
}