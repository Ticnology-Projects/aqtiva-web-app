import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

// ============================================================================
// GET: OBTENER EQUIPO CON CONTADOR DE CONCILIACIONES
// ============================================================================
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminEmail = searchParams.get("tenant_id");

    if (!adminEmail) return NextResponse.json({ error: "Falta el tenant_id" }, { status: 400 });

    // 1. Obtenemos a los usuarios
    const scanUsers = await ddbDocClient.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: "begins_with(PK, :prefix) AND SK = :sk AND usuario_propietario = :tenantId",
      ExpressionAttributeValues: {
        ":prefix": "USER#",
        ":sk": "PROFILE",
        ":tenantId": adminEmail
      }
    }));

    // 2. Obtenemos el historial para el contador
    const scanAudits = await ddbDocClient.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: "begins_with(PK, :prefix) AND (tipo_accion = :c1 OR tipo_accion = :c2)",
      ExpressionAttributeValues: {
        ":prefix": "AUDIT#",
        ":c1": "CONCILIACION",
        ":c2": "CONCILIACION_LOTE"
      }
    }));

    // 3. Cruzamos y sumamos
    const conteoMap: Record<string, number> = {};
    scanAudits.Items?.forEach((audit: any) => {
      const email = audit.usuario_resolutor;
      if (email && audit.estado === "AUDITADO") {
        conteoMap[email] = (conteoMap[email] || 0) + 1;
      }
    });

    const equipoConteo = (scanUsers.Items || []).map(usuario => ({
      ...usuario,
      conteo_conciliaciones: conteoMap[usuario.email] || 0
    }));

    return NextResponse.json({ success: true, data: equipoConteo });
  } catch (error: any) {
    console.error("Error obteniendo equipo:", error);
    return NextResponse.json({ error: "Error interno al obtener el equipo." }, { status: 500 });
  }
}

// ============================================================================
// PUT: ACTUALIZAR ESTADO (ACTIVO/INACTIVO)
// ============================================================================
export async function PUT(req: Request) {
  try {
    const { email, estado } = await req.json();
    
    if (!email || !estado) {
      return NextResponse.json({ error: "El email y el estado son requeridos." }, { status: 400 });
    }

    await ddbDocClient.send(new UpdateCommand({
      TableName: "AqtivaChatDB",
      Key: { PK: `USER#${email}`, SK: "PROFILE" },
      UpdateExpression: "SET estado = :nuevoEstado",
      ExpressionAttributeValues: { ":nuevoEstado": estado }
    }));

    return NextResponse.json({ success: true, message: `Usuario marcado como ${estado}.` });
  } catch (error: any) {
    console.error("Error actualizando estado:", error);
    return NextResponse.json({ error: "Error interno al actualizar estado." }, { status: 500 });
  }
}

// ============================================================================
// POST: CREAR USUARIO
// ============================================================================
export async function POST(req: Request) {
  try {
    const { email, password, nombre, rol, adminEmail } = await req.json();

    if (!email || !password || !nombre || !adminEmail) {
      return NextResponse.json({ error: "Todos los campos son requeridos." }, { status: 400 });
    }

    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    const timestamp = new Date().toISOString();

    await ddbDocClient.send(new PutCommand({
      TableName: "AqtivaChatDB",
      Item: {
        PK: `USER#${email}`,
        SK: "PROFILE",
        email: email,
        nombre: nombre,
        passwordHash: passwordHash,
        rol: rol || "USER",
        estado: "ACTIVO",
        usuario_propietario: adminEmail,
        fecha_creacion: timestamp
      },
      ConditionExpression: "attribute_not_exists(PK)" 
    }));

    return NextResponse.json({ success: true, message: `El asistente ${nombre} fue creado exitosamente.` });

  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Ya existe un usuario con este correo." }, { status: 409 });
    }
    return NextResponse.json({ error: "Error interno al crear el usuario." }, { status: 500 });
  }
}

// ============================================================================
// DELETE: ELIMINAR PERMANENTEMENTE
// ============================================================================
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const emailToDelete = searchParams.get("email");

    if (!emailToDelete) {
      return NextResponse.json({ error: "Se requiere el correo." }, { status: 400 });
    }

    await ddbDocClient.send(new DeleteCommand({
      TableName: "AqtivaChatDB",
      Key: { PK: `USER#${emailToDelete}`, SK: "PROFILE" }
    }));

    return NextResponse.json({ success: true, message: "Acceso revocado." });
  } catch (error: any) {
    return NextResponse.json({ error: "Error eliminando usuario." }, { status: 500 });
  }
}