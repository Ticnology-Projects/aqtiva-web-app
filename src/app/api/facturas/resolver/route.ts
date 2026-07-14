import { NextResponse } from "next/server";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const esAutomatico = body.es_automatico || false;
    const PK_Voucher = body.PK_Voucher;
    const s3_key_voucher = body.s3_key_voucher || "Asignación Manual";
    
    // 🚨 Extraemos al usuario y el historial previo
    const usuario_resolutor = body.usuario_resolutor || "Sistema IA";
    const historial_previo = Array.isArray(body.historial_previo) ? body.historial_previo : [];
    
    let facturasAProcesar = [];
    if (body.facturas && Array.isArray(body.facturas)) {
      facturasAProcesar = body.facturas; 
    } else if (body.factura_pk && body.numero_documento) {
      facturasAProcesar = [{ PK: body.factura_pk, numero_documento: body.numero_documento }]; 
    }

    if (facturasAProcesar.length === 0) {
      return NextResponse.json({ error: "No se proporcionaron facturas para conciliar." }, { status: 400 });
    }

    const metodoResolucion = esAutomatico ? "AUTOMATICO_IA" : "MANUAL";
    const tipoAccionAudit = esAutomatico ? "AUTO_CONCILIACION" : (facturasAProcesar.length > 1 ? "CONCILIACION_LOTE" : "CONCILIACION");
    const timestamp = new Date().toISOString();

    // 🚨 Creamos el nuevo arreglo acumulando la historia
    const nuevo_historial = [...historial_previo, {
      accion: tipoAccionAudit,
      usuario: usuario_resolutor,
      fecha: timestamp
    }];

    const transactItems: any[] = [];

    for (const factura of facturasAProcesar) {
      transactItems.push({
        Update: {
          TableName: "AqtivaChatDB", 
          Key: { PK: factura.PK, SK: "METADATA" },
          UpdateExpression: "SET estado = :nuevoEstado, voucher_conciliado = :voucher, metodo_resolucion = :metodo",
          ExpressionAttributeValues: {
            ":nuevoEstado": "COBRADO",
            ":voucher": s3_key_voucher,
            ":metodo": metodoResolucion
          },
          ConditionExpression: "attribute_exists(PK)" 
        }
      });

      transactItems.push({
        Put: {
          TableName: "AqtivaChatDB",
          Item: {
            PK: `AUDIT#${timestamp}#${factura.numero_documento}`,
            SK: "METADATA",
            tipo_accion: tipoAccionAudit,
            numero_documento: factura.numero_documento,
            factura_vinculada_pk: factura.PK, 
            voucher_vinculado: s3_key_voucher,
            fecha_registro: timestamp,
            estado: "AUDITADO",
            usuario_resolutor: usuario_resolutor,
            historial_trazabilidad: nuevo_historial // Guardamos el arreglo completo
          }
        }
      });
    }

    if (PK_Voucher) {
      transactItems.push({
        Update: {
          TableName: "AqtivaChatDB", 
          Key: { PK: PK_Voucher, SK: "METADATA" },
          UpdateExpression: "SET estado = :nuevoEstado, facturas_vinculadas = :facturas, historial_trazabilidad = :hist",
          ExpressionAttributeValues: { 
            ":nuevoEstado": "RESUELTO",
            ":facturas": facturasAProcesar.map((f: any) => f.numero_documento),
            ":hist": nuevo_historial // Pasamos la historia al voucher para cuando se reverse
          }
        }
      });
    }

    await dynamoDb.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return NextResponse.json({ success: true, message: `Se resolvieron ${facturasAProcesar.length} factura(s) exitosamente.` });

  } catch (error: any) {
    console.error("Error en resolver.route:", error);
    if (error.name === "TransactionCanceledException") {
      return NextResponse.json({ error: "Operación cancelada: Una de las facturas seleccionadas ya no existe en la base de datos." }, { status: 409 });
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}