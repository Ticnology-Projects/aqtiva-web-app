import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Buscamos todos los registros que empiecen con "VOUCHER#" (Sin filtrar por estado)
    const result = await dynamoDb.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: "begins_with(PK, :pk)",
      ExpressionAttributeValues: {
        ":pk": "VOUCHER#"
      }
    }));

    // Ordenamos por fecha de importación (los más recientes primero)
    const sortedItems = (result.Items || []).sort((a, b) => {
      if (!a.fecha_importacion) return 1;
      if (!b.fecha_importacion) return -1;
      return new Date(b.fecha_importacion).getTime() - new Date(a.fecha_importacion).getTime();
    });

    return NextResponse.json({ success: true, data: sortedItems });
  } catch (error: any) {
    console.error("Error obteniendo la bóveda de vouchers:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}