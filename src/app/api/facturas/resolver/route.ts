import { NextResponse } from "next/server";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 🚨 SOPORTE DUAL: Acepta el formato antiguo (1 factura) o el nuevo (arreglo de facturas para lotes)
    const esAutomatico = body.es_automatico || false;
    const PK_Voucher = body.PK_Voucher;
    const s3_key_voucher = body.s3_key_voucher || "Asignación Manual";
    
    // Normalizamos la entrada para que siempre sea un arreglo
    let facturasAProcesar = [];
    if (body.facturas && Array.isArray(body.facturas)) {
      facturasAProcesar = body.facturas; // Flujo de Lote (Triaje Manual)
    } else if (body.factura_pk && body.numero_documento) {
      facturasAProcesar = [{ PK: body.factura_pk, numero_documento: body.numero_documento }]; // Flujo Antiguo (Auto-Conciliación)
    }

    if (facturasAProcesar.length === 0) {
      return NextResponse.json({ error: "No se proporcionaron facturas para conciliar." }, { status: 400 });
    }

    const metodoResolucion = esAutomatico ? "AUTOMATICO_IA" : "MANUAL";
    const tipoAccionAudit = esAutomatico ? "AUTO_CONCILIACION" : (facturasAProcesar.length > 1 ? "CONCILIACION_LOTE" : "CONCILIACION");
    const timestamp = new Date().toISOString();

    const transactItems: any[] = [];

    // 1. Iterar y preparar la actualización de TODAS las facturas implicadas
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
          // 🚨 ELIMINAMOS LA RESTRICCIÓN DE ESTADO. 
          // Ahora solo validamos que la factura exista en la BD para evitar registros fantasma.
          ConditionExpression: "attribute_exists(PK)" 
        }
      });

      // 2. Crear un ticket de Auditoría por CADA factura cobrada (mantiene tu historial intacto)
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
            estado: "AUDITADO"
          }
        }
      });
    }

    // 3. Marcar el Voucher como RESUELTO
    if (PK_Voucher) {
      transactItems.push({
        Update: {
          TableName: "AqtivaChatDB", 
          Key: { PK: PK_Voucher, SK: "METADATA" },
          UpdateExpression: "SET estado = :nuevoEstado, facturas_vinculadas = :facturas",
          ExpressionAttributeValues: { 
            ":nuevoEstado": "RESUELTO",
            ":facturas": facturasAProcesar.map((f: { numero_documento: any; }) => f.numero_documento)
          }
        }
      });
    }

    // 4. Ejecutar toda la operación atómicamente
    await dynamoDb.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return NextResponse.json({ success: true, message: `Se resolvieron ${facturasAProcesar.length} factura(s) exitosamente.` });

  } catch (error: any) {
    console.error("Error en resolver.route:", error);
    if (error.name === "TransactionCanceledException") {
      // Como cambiamos la condición, si esto falla ahora, significa que la factura fue borrada de la BD
      return NextResponse.json({ error: "Operación cancelada: Una de las facturas seleccionadas ya no existe en la base de datos." }, { status: 409 });
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}