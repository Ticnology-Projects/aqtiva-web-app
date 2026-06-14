import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function GET() {
  try {
    const response = await dynamoDb.send(new ScanCommand({
      TableName: "AqtivaChatDB", // Asegúrate de que coincida con tu tabla
      FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
      ExpressionAttributeValues: {
        ":prefix": "INVOICE#",
        ":sk": "METADATA"
      }
    }));

    return NextResponse.json({ 
      success: true, 
      data: response.Items || [] 
    });
  } catch (error: any) {
    console.error("Error obteniendo facturas de DynamoDB:", error);
    return NextResponse.json({ error: "Fallo al obtener el catálogo de facturas" }, { status: 500 });
  }
}