import { NextResponse } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const { numero_documento, s3_key_voucher } = await req.json();

    if (!numero_documento) {
      return NextResponse.json({ error: "El número de documento es obligatorio." }, { status: 400 });
    }

    const PK = `INVOICE#${numero_documento}`;

    // Actualizamos la factura en DynamoDB
    await dynamoDb.send(new UpdateCommand({
      TableName: "AqtivaChatDB", 
      Key: {
        PK: PK,
        SK: "METADATA"
      },
      UpdateExpression: "SET estado = :nuevoEstado, voucher_conciliado = :voucher",
      ExpressionAttributeValues: {
        ":nuevoEstado": "COBRADO",
        ":voucher": s3_key_voucher || "Asignación Manual"
      }
    }));

    return NextResponse.json({ 
      success: true, 
      message: `Factura ${numero_documento} marcada como COBRADO exitosamente.` 
    });

  } catch (error: any) {
    console.error("Error al conciliar la factura en DynamoDB:", error);
    return NextResponse.json({ error: "Fallo interno al actualizar la base de datos." }, { status: 500 });
  }
}