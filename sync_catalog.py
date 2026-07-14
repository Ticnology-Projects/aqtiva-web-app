import json
import os
import boto3
from boto3.dynamodb.types import TypeDeserializer

BUCKET_NAME       = os.environ.get("BUCKET_NAME")
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID")
DATA_SOURCE_ID    = os.environ.get("DATA_SOURCE_ID")

s3            = boto3.client("s3")
bedrock_agent = boto3.client("bedrock-agent")
deserializer  = TypeDeserializer()

def deserialize_dynamo_obj(dynamo_obj):
    return {k: deserializer.deserialize(v) for k, v in dynamo_obj.items()}

def lambda_handler(event, context):
    cambios_detectados = False

    for record in event.get("Records", []):
        if record["eventName"] in ["INSERT", "MODIFY"]:
            new_image = record["dynamodb"].get("NewImage")
            if not new_image: continue
            
            item = deserialize_dynamo_obj(new_image)
            
            if not str(item.get("PK", "")).startswith("INVOICE#"):
                continue

            numero_factura = item.get("numero_documento")
            if not numero_factura: continue

            base_key = f"processed-invoice/{numero_factura}.txt"
            meta_key = f"processed-invoice/{numero_factura}.txt.metadata.json"
            
            # 🚨 EXTRACCIÓN DE DETRACCIÓN
            tiene_detraccion = item.get("tiene_detraccion", False)
            tasa_detraccion = float(item.get("tasa_detraccion", 0.0)) * 100
            monto_detraccion = item.get("monto_detraccion", 0.0)
            monto_neto_pagar = item.get("monto_neto_pagar", item.get("monto", 0.0))

            contenido_texto = (
                f"Número Documento: {numero_factura}\n"
                f"Cliente: {item.get('cliente', '')}\n"
                f"RUC Cliente: {item.get('ruc_cliente', '')}\n"
                f"Monto Total Bruto: {item.get('monto', 0.0)}\n"
                f"Moneda: {item.get('moneda', 'PEN')}\n"
                f"Fecha Emisión: {item.get('fecha_emision', '')}\n"
                f"Fecha Vencimiento: {item.get('fecha_vencimiento', '')}\n"
                f"Sujeto a Detracción: {'SI' if tiene_detraccion else 'NO'}\n"
                f"Tasa Detracción: {tasa_detraccion}%\n"
                f"Monto Detracción: {monto_detraccion}\n"
                f"Monto Neto a Pagar: {monto_neto_pagar}\n"
                f"Estado: {item.get('estado', 'PENDIENTE')}\n"
            )

            metadata_json = {
                "metadataAttributes": {
                    "empresa_emisora_ruc": str(item.get("empresa_emisora_ruc", "")),
                    "estado": str(item.get("estado", "PENDIENTE"))
                }
            }

            try:
                s3.put_object(Bucket=BUCKET_NAME, Key=base_key, Body=contenido_texto.encode("utf-8"))
                s3.put_object(Bucket=BUCKET_NAME, Key=meta_key, Body=json.dumps(metadata_json))
                cambios_detectados = True
            except Exception as e:
                print(f"Error escribiendo en S3 para la factura {numero_factura}: {e}")

    if cambios_detectados and KNOWLEDGE_BASE_ID and DATA_SOURCE_ID:
        try:
            bedrock_agent.start_ingestion_job(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=DATA_SOURCE_ID
            )
            print("✅ Ingestion Job iniciada.")
        except bedrock_agent.exceptions.ConflictException:
            print("⚠️ Ya hay un Ingestion Job ejecutándose.")
        except Exception as e:
            print(f"Error iniciando Ingestion Job: {e}")

    return {"statusCode": 200, "body": "OK"}