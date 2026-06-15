import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Buscamos todos los registros de auditoría
    const result = await dynamoDb.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: "begins_with(PK, :pk)",
      ExpressionAttributeValues: {
        ":pk": "AUDIT#"
      }
    }));

    // Ordenamos por fecha (los más recientes primero)
    const sortedItems = (result.Items || []).sort((a, b) => 
      b.fecha_registro.localeCompare(a.fecha_registro)
    );

    return NextResponse.json({ success: true, data: sortedItems });
  } catch (error: any) {
    console.error("Error obteniendo auditoría:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}