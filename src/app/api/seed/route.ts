import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";
import crypto from "crypto";

export async function GET() {
  const adminId = "admin_01j00000000000000000000001"; 
  const passwordTemp = "AqtivaAdmin2026!";
  const passwordHash = crypto.createHash("sha256").update(passwordTemp).digest("hex");

  try {
    // Intentamos insertar el usuario admin en tu tabla única
    await dynamoDb.send(new PutCommand({
      TableName: "AqtivaChatDB",
      Item: {
        PK: `USER#${adminId}`,
        SK: `PROFILE`,
        userId: adminId,
        nombre: "Luis Enrique Admin",
        email: "admin@aqtiva.io",
        passwordHash: passwordHash,
        rol: "ADMIN",
        fechaCreacion: new Date().toISOString(),
        estado: "ACTIVO"
      }
    }));

    return NextResponse.json({ 
      success: true, 
      message: "¡Usuario Administrador insertado con éxito en tu tabla Single-Table!" 
    });

  } catch (error: any) {
    console.error("Error sembrando la base de datos:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || "Fallo interno al conectar con DynamoDB" 
    }, { status: 500 });
  }
}