import json
import os
import boto3
from boto3.dynamodb.types import TypeDeserializer

# Configuración de variables
BUCKET_NAME       = os.environ.get("BUCKET_NAME")
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID")
DATA_SOURCE_ID    = os.environ.get("DATA_SOURCE_ID") # ID del origen de datos en Bedrock

s3            = boto3.client("s3")
bedrock_agent = boto3.client("bedrock-agent")
deserializer  = TypeDeserializer()

def deserialize_dynamo_obj(dynamo_obj):
    """Convierte el formato tipado de DynamoDB Stream a un diccionario Python normal"""
    return {k: deserializer.deserialize(v) for k, v in dynamo_obj.items()}

def lambda_handler(event, context):
    cambios_detectados = False

    for record in event.get("Records", []):
        # Solo nos importan inserciones o modificaciones en la base de datos
        if record["eventName"] in ["INSERT", "MODIFY"]:
            new_image = record["dynamodb"].get("NewImage")
            if not new_image: 
                continue
            
            item = deserialize_dynamo_obj(new_image)
            
            # Filtro de seguridad: Solo sincronizamos facturas (ignoramos perfiles/empresas)
            if not str(item.get("PK", "")).startswith("INVOICE#"):
                continue

            numero_factura = item.get("numero_documento", "Desconocido")
            
            # 1. Generar el documento de texto para la IA
            # (Le damos un resumen claro para que el OCR lo cruce)
            contenido_texto = (
                f"Documento: {numero_factura}\n"
                f"Cliente: {item.get('cliente', '')}\n"
                f"RUC Cliente: {item.get('ruc_cliente', '')}\n"
                f"Monto Total: {item.get('monto', 0.0)}\n"
                f"Moneda: {item.get('moneda', 'PEN')}\n"
                f"Fecha Emisión: {item.get('fecha_emision', '')}\n"
                f"Fecha Vencimiento: {item.get('fecha_vencimiento', '')}\n"
            )

            # 2. Generar el archivo de Metadatos (CRÍTICO PARA EL MULTI-TENANT)
            # Esto permite a match_invoice.py filtrar por "empresa_emisora_ruc"
            metadata_json = {
                "metadataAttributes": {
                    "empresa_emisora_ruc": str(item.get("empresa_emisora_ruc", "")),
                    "estado": str(item.get("estado", "PENDIENTE"))
                }
            }

            # Definir rutas en la carpeta procesada de S3
            base_key = f"processed-invoice/{numero_factura}.txt"
            meta_key = f"{base_key}.metadata.json"

            # 3. Subir ambos archivos a S3
            try:
                s3.put_object(Bucket=BUCKET_NAME, Key=base_key, Body=contenido_texto.encode("utf-8"))
                s3.put_object(Bucket=BUCKET_NAME, Key=meta_key, Body=json.dumps(metadata_json))
                cambios_detectados = True
                print(f"Factura {numero_factura} sincronizada en S3 con metadatos.")
            except Exception as e:
                print(f"Error escribiendo en S3 para la factura {numero_factura}: {e}")

    # 4. Disparar el Ingestion Job de Bedrock
    if cambios_detectados and KNOWLEDGE_BASE_ID and DATA_SOURCE_ID:
        try:
            bedrock_agent.start_ingestion_job(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=DATA_SOURCE_ID
            )
            print("✅ Sincronización de Knowledge Base (Ingestion Job) iniciada exitosamente.")
        except bedrock_agent.exceptions.ConflictException:
            # Control de errores inteligente: Si subes un CSV de 100 filas, DynamoDB 
            # disparará este evento en lotes. Bedrock lanzará ConflictException si
            # ya hay un Job corriendo, lo cual está bien (el job actual tomará todos los archivos nuevos).
            print("⚠️ Ya hay un Ingestion Job ejecutándose. Los archivos se procesarán en el ciclo actual.")
        except Exception as e:
            print(f"❌ Error al iniciar la sincronización en Bedrock: {e}")

    return {"statusCode": 200, "body": "Sincronización completada"}