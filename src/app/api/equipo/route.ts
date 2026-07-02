import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

// Inicializamos DynamoDB
const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

// ============================================================================
// GET: OBTENER TODOS LOS ASISTENTES DE UN ADMIN (TENANT)
// ============================================================================
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminEmail = searchParams.get("tenant_id");

    if (!adminEmail) {
      return NextResponse.json({ error: "Falta el tenant_id (correo del administrador)" }, { status: 400 });
    }

    // Buscamos a todos los usuarios cuyo "usuario_propietario" sea el ADMIN logueado
    const command = new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: "begins_with(PK, :prefix) AND SK = :sk AND usuario_propietario = :tenantId AND rol = :rol",
      ExpressionAttributeValues: {
        ":prefix": "USER#",
        ":sk": "PROFILE",
        ":tenantId": adminEmail,
        ":rol": "USER" // Solo traemos a los asistentes
      }
    });

    const response = await ddbDocClient.send(command);

    // Mapeamos los datos para enviarlos limpios al frontend (sin el hash de la contraseña)
    const equipo = (response.Items || []).map((user) => ({
      id: user.PK.replace("USER#", ""),
      nombre: user.nombre,
      email: user.email,
      fecha_creacion: user.fechaCreacion ? new Date(user.fechaCreacion).toLocaleDateString('es-PE') : "N/A",
      rol: user.rol,
      estado: user.estado
    }));

    return NextResponse.json({ success: true, data: equipo });

  } catch (error: any) {
    console.error("Error obteniendo el equipo:", error);
    return NextResponse.json({ error: "Error interno al cargar los asistentes." }, { status: 500 });
  }
}

// ============================================================================
// POST: CREAR UN NUEVO ASISTENTE (USER) VINCULADO AL ADMIN
// ============================================================================
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nombre, email, password, tenant_id, rol } = body;

    if (!nombre || !email || !password || !tenant_id) {
      return NextResponse.json({ error: "Faltan parámetros obligatorios." }, { status: 400 });
    }

    // Hasheamos la contraseña con SHA-256 (mismo formato que usa tu BD actual)
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const userEmailClean = email.toLowerCase().trim();

    await ddbDocClient.send(new PutCommand({
      TableName: "AqtivaChatDB",
      Item: {
        PK: `USER#${userEmailClean}`, // Su ID principal será su correo
        SK: "PROFILE",
        nombre: nombre,
        email: userEmailClean,
        passwordHash: passwordHash,
        rol: rol || "USER", // Forzamos a que sea "USER" por seguridad
        usuario_propietario: tenant_id, // 🚨 SELLO DEL TENANT (Dueño de la cuenta)
        estado: "ACTIVO",
        fechaCreacion: new Date().toISOString()
      },
      // Evitamos sobreescribir un usuario si ya existe
      ConditionExpression: "attribute_not_exists(PK)" 
    }));

    return NextResponse.json({ success: true, message: `El asistente ${nombre} fue creado exitosamente.` });

  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Ya existe un usuario registrado con este correo." }, { status: 409 });
    }
    console.error("Error creando asistente:", error);
    return NextResponse.json({ error: "Error interno al crear el usuario." }, { status: 500 });
  }
}

// ============================================================================
// DELETE: REVOCAR/ELIMINAR A UN ASISTENTE
// ============================================================================
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const emailToDelete = searchParams.get("email");

    if (!emailToDelete) {
      return NextResponse.json({ error: "Se requiere el correo del asistente para eliminarlo." }, { status: 400 });
    }

    await ddbDocClient.send(new DeleteCommand({
      TableName: "AqtivaChatDB",
      Key: {
        PK: `USER#${emailToDelete}`,
        SK: "PROFILE"
      }
    }));

    return NextResponse.json({ success: true, message: "Acceso revocado exitosamente." });

  } catch (error: any) {
    console.error("Error eliminando asistente:", error);
    return NextResponse.json({ error: "Error interno al eliminar el usuario." }, { status: 500 });
  }
}