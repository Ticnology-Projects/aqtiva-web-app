import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");

    let filterExpression = "begins_with(PK, :prefix) AND SK = :sk";
    let expressionAttributeValues: any = {
      ":prefix": "INVOICE#",
      ":sk": "METADATA"
    };

    if (tenantId) {
      filterExpression += " AND usuario_propietario = :tenantId";
      expressionAttributeValues[":tenantId"] = tenantId;
    }

    const response = await dynamoDb.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    }));

    return NextResponse.json({ success: true, data: response.Items || [] });
  } catch (error: any) {
    console.error("Error obteniendo facturas:", error);
    return NextResponse.json({ error: "Fallo al obtener el catálogo de facturas" }, { status: 500 });
  }
}