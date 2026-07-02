import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");

    let filterExpression = "begins_with(PK, :pk) AND estado = :estado";
    let expressionAttributeValues: any = {
      ":pk": "VOUCHER#",
      ":estado": "PENDIENTE_REVISION"
    };

    if (tenantId) {
      filterExpression += " AND usuario_propietario = :tenantId";
      expressionAttributeValues[":tenantId"] = tenantId;
    }

    const result = await dynamoDb.send(new ScanCommand({
      TableName: "AqtivaChatDB",
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    }));

    return NextResponse.json({ success: true, data: result.Items || [] });
  } catch (error: any) {
    console.error("Error obteniendo vouchers:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}