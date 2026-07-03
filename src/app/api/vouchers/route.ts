import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Buscamos todos los registros que empiecen con "VOUCHER#" y que estén pendientes de revisión
    const result = await dynamoDb.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: "begins_with(PK, :pk) AND estado = :estado",
      ExpressionAttributeValues: {
        ":pk": "VOUCHER#",
        ":estado": "PENDIENTE_REVISION"
      }
    }));

    return NextResponse.json({ success: true, data: result.Items || [] });
  } catch (error: any) {
    console.error("Error obteniendo vouchers:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}