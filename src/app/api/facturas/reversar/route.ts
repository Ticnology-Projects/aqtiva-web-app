import { NextResponse } from "next/server";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const { PK: audit_pk, numero_documento, factura_vinculada_pk, voucher_vinculado, usuario_resolutor, historial_previo } = await req.json();

    if (!audit_pk || !numero_documento) {
        return NextResponse.json({ error: "Faltan datos de auditoría." }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    
    // 🚨 Extraemos usuario e historial
    const usuario = usuario_resolutor || "Usuario Desconocido";
    const historial = Array.isArray(historial_previo) ? historial_previo : [];
    
    const nuevo_historial = [...historial, {
      accion: "REVERSION",
      usuario: usuario,
      fecha: timestamp
    }];

    const invoicePK = factura_vinculada_pk || `INVOICE#${numero_documento}`;
    const transactItems: any[] = [];

    // 1. Revertir la Factura (Devolver a PENDIENTE y quitar el voucher)
    transactItems.push({
      Update: {
        TableName: "AqtivaChatDB",
        Key: { PK: invoicePK, SK: "METADATA" },
        UpdateExpression: "SET estado = :estado REMOVE voucher_conciliado",
        ExpressionAttributeValues: { ":estado": "PENDIENTE" }
      }
    });

    // 2. Anular el ticket de auditoría original y actualizar su historial
    transactItems.push({
      Update: {
        TableName: "AqtivaChatDB",
        Key: { PK: audit_pk, SK: "METADATA" },
        UpdateExpression: "SET estado = :anulado, historial_trazabilidad = :hist",
        ExpressionAttributeValues: { 
          ":anulado": "ANULADO",
          ":hist": nuevo_historial
        }
      }
    });

    // 3. Crear el nuevo ticket de reversión con el historial acumulado
    transactItems.push({
      Put: {
        TableName: "AqtivaChatDB",
        Item: {
          PK: `AUDIT#${timestamp}#${numero_documento}#REV`,
          SK: "METADATA",
          tipo_accion: "REVERSION",
          numero_documento: numero_documento,
          factura_vinculada_pk: invoicePK,
          fecha_registro: timestamp,
          estado: "AUDITADO",
          usuario_resolutor: usuario,
          historial_trazabilidad: nuevo_historial
        }
      }
    });

    // 4. Devolver el Voucher a Triaje con el historial intacto
    if (voucher_vinculado && voucher_vinculado.includes("processed/")) {
        const baseName = voucher_vinculado.replace("processed/", "").replace(".json", "");
        const voucherPK = `VOUCHER#${baseName}`;

        transactItems.push({
          Update: {
            TableName: "AqtivaChatDB",
            Key: { PK: voucherPK, SK: "METADATA" },
            UpdateExpression: "SET estado = :estado, historial_trazabilidad = :hist",
            ExpressionAttributeValues: { 
              ":estado": "PENDIENTE_REVISION",
              ":hist": nuevo_historial
            }
          }
        });
    }

    // Ejecutamos todo atómicamente para mayor seguridad
    await dynamoDb.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return NextResponse.json({ success: true, message: "Reversión exitosa. El voucher ha regresado a Triaje." });
  } catch (error: any) {
    console.error("Error en reversar:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}