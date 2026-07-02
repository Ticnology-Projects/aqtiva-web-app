import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

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
// OBTENER EMPRESAS (Filtradas por usuario o tenant)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // 🚨 Aceptamos tenantId (preferido) o usuarioId (legacy)
    const tenantId = searchParams.get("tenantId") || searchParams.get("usuarioId");

    let filterExpression = "begins_with(PK, :prefix) AND SK = :sk";
    let expressionAttributeValues: any = {
      ":prefix": "COMPANY#",
      ":sk": "METADATA"
    };

    // 🚨 Filtro Multi-Tenant
    if (tenantId) {
      filterExpression += " AND usuario_propietario = :tenantId";
      expressionAttributeValues[":tenantId"] = tenantId;
    }

    const response = await ddbDocClient.send(new ScanCommand({
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

// CREAR EMPRESA(S) NUEVA(S) O IMPORTAR
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Soporta tanto creación individual como masiva (array)
    const empresasToProcess = Array.isArray(body.empresas) ? body.empresas : [body];
    const usuarioId = body.usuarioId || empresasToProcess[0]?.usuarioId;

    if (!usuarioId) {
      return NextResponse.json({ error: "El usuarioId es obligatorio para mantener el multi-tenant." }, { status: 400 });
    }

    const promesas = empresasToProcess.map((emp: any) => {
      const nombreOriginal = emp.nombreOriginal || emp.nombre;
      if (!emp.ruc || !nombreOriginal) return Promise.resolve();
      
      const cleanName = cleanBusinessName(nombreOriginal);
      const PK = `COMPANY#${cleanName}`;

      return ddbDocClient.send(new PutCommand({
        TableName: "AqtivaChatDB", 
        Item: {
          PK: PK,
          SK: "METADATA",
          nombreOriginal: nombreOriginal.toUpperCase(),
          nombreNormalizado: cleanName,
          ruc: emp.ruc.trim(),
          alias: emp.alias || "",
          estado: "ACTIVO",
          usuario_propietario: usuarioId, // SELLO MULTI-TENANT
          fechaCreacion: new Date().toISOString()
        }
      }));
    });

    await Promise.all(promesas);

    return NextResponse.json({ 
      success: true, 
      message: `Se registraron ${empresasToProcess.length} empresa(s) exitosamente.` 
    });

  } catch (error: any) {
    console.error("Error guardando empresa en DynamoDB:", error);
    return NextResponse.json({ error: "Fallo interno al guardar la empresa" }, { status: 500 });
  }
}

// ACTUALIZAR EMPRESA
export async function PUT(req: Request) {
  try {
    const { ruc, nombreOriginal, alias, usuarioId } = await req.json();

    if (!nombreOriginal || !ruc || !usuarioId) {
      return NextResponse.json({ error: "Nombre, RUC y Usuario son obligatorios" }, { status: 400 });
    }

    const cleanName = cleanBusinessName(nombreOriginal);
    const PK = `COMPANY#${cleanName}`;

    await ddbDocClient.send(new PutCommand({
      TableName: "AqtivaChatDB", 
      Item: {
        PK: PK,
        SK: "METADATA",
        nombreOriginal: nombreOriginal.toUpperCase(),
        nombreNormalizado: cleanName,
        ruc: ruc.trim(),
        alias: alias || "",
        estado: "ACTIVO",
        usuario_propietario: usuarioId, 
        fechaCreacion: new Date().toISOString()
      }
    }));

    return NextResponse.json({ success: true, message: "Empresa actualizada exitosamente." });
  } catch (error: any) {
    console.error("Error actualizando empresa:", error);
    return NextResponse.json({ error: "Fallo interno al actualizar" }, { status: 500 });
  }
}

// ELIMINAR EMPRESA
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ruc = searchParams.get("ruc");

    // NOTA: Tu modelo usa el nombre limpio en la PK (COMPANY#NOMBRE).
    // Si quieres eliminar por RUC, primero deberías hacer un Scan para encontrar el PK.
    // Asumiremos que el frontend enviará el nombre_normalizado en el parámetro 'ruc' (temporal) o lo ajustamos.
    
    // Para no romper tu esquema, haremos un Scan rápido buscando el RUC y luego borramos su PK.
    if (!ruc) return NextResponse.json({ error: "RUC requerido" }, { status: 400 });

    const scanResult = await ddbDocClient.send(new ScanCommand({
        TableName: "AqtivaChatDB",
        FilterExpression: "ruc = :ruc AND begins_with(PK, :prefix)",
        ExpressionAttributeValues: { ":ruc": ruc, ":prefix": "COMPANY#" }
    }));

    if (!scanResult.Items || scanResult.Items.length === 0) {
        return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const pkToDelete = scanResult.Items[0].PK;

    await ddbDocClient.send(new DeleteCommand({
      TableName: "AqtivaChatDB",
      Key: { PK: pkToDelete, SK: "METADATA" }
    }));

    return NextResponse.json({ success: true, message: "Empresa eliminada" });
  } catch (error) {
    console.error("Error eliminando empresa:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}