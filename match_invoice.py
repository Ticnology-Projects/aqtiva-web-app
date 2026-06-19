import json
import os
import decimal
from datetime import datetime

import boto3
import botocore.exceptions

CLAUDE_MODEL_ID   = os.environ.get("CLAUDE_MODEL_ID", "")
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
BUCKET_NAME       = os.environ.get("BUCKET_NAME", "")
REGION            = os.environ.get("AWS_REGION", "us-east-1")
KB_N_RESULTS      = int(os.environ.get("KB_N_RESULTS", "5"))

bedrock       = boto3.client("bedrock-runtime",       region_name=REGION)
bedrock_agent = boto3.client("bedrock-agent-runtime", region_name=REGION)
s3            = boto3.client("s3",                    region_name=REGION)

dynamodb      = boto3.resource("dynamodb",            region_name=REGION)
table         = dynamodb.Table("AqtivaChatDB")

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)

def _v(extraccion: dict, *path):
    node = extraccion
    for key in path:
        if not isinstance(node, dict): return None
        node = node.get(key, {})
    return node.get("valor") if isinstance(node, dict) else None

def read_s3_json(key: str) -> dict:
    resp = s3.get_object(Bucket=BUCKET_NAME, Key=key)
    return json.loads(resp["Body"].read(), parse_float=decimal.Decimal)

def build_query(ext: dict, empresa_ruc: str) -> str:
    parts = []
    numero          = _v(ext, "numero_documento")
    numero_operacion = _v(ext, "numero_operacion")
    emisor          = _v(ext, "emisor",   "nombre")
    cliente         = _v(ext, "receptor", "nombre")
    ruc_r           = _v(ext, "receptor", "ruc")
    ruc_e           = _v(ext, "emisor",   "ruc")
    monto           = _v(ext, "monto_pendiente") or _v(ext, "importe_total")
    moneda          = _v(ext, "moneda")
    fecha           = _v(ext, "fecha_emision")
    forma_pago      = _v(ext, "forma_pago")

    if numero_operacion:
        numero_operacion = str(numero_operacion).lstrip("0") or numero_operacion

    if empresa_ruc: parts.append(f"**RUC Emisor:** {empresa_ruc}")

    if numero_operacion:  parts.append(f"**Número De Operación:** {numero_operacion}")
    if numero:            parts.append(f"**Número Documento:** {numero}")
    if ruc_r:             parts.append(f"**RUC:** {ruc_r}")
    if ruc_e:             parts.append(f"**RUC:** {ruc_e}")
    if monto is not None: parts.append(f"**Monto Total:** {monto}")
    if fecha:             parts.append(f"**Fecha Emisión:** {fecha}")
    if emisor:            parts.append(f"**Cliente:** {emisor}")
    if forma_pago:        parts.append(f"**Forma De Pago:** {forma_pago}")
    if moneda:            parts.append(f"**Moneda:** {moneda}")

    return " ".join(parts)

def retrieve_kb(query: str) -> list[dict]:
    resp = bedrock_agent.retrieve(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        retrievalQuery={"text": query},
        retrievalConfiguration={
            "vectorSearchConfiguration": {"numberOfResults": KB_N_RESULTS}
        },
    )
    return [
        {
            "contenido": r["content"]["text"],
            "score":     decimal.Decimal(str(round(r["score"], 4))),
            "fuente":    r.get("location", {}).get("s3Location", {}).get("uri", ""),
        }
        for r in resp.get("retrievalResults", [])
    ]

def evaluate(ext: dict, candidates: list[dict]) -> dict:
    extracted_summary = json.dumps(
        {
            "numero_documento":  _v(ext, "numero_documento"),
            "numero_operacion":  _v(ext, "numero_operacion"),
            "tipo_documento":    _v(ext, "tipo_documento"),
            "emisor":            _v(ext, "emisor", "nombre"),
            "ruc_emisor":        _v(ext, "emisor", "ruc"),
            "cliente":           _v(ext, "emisor", "nombre"),
            "ruc_cliente":       _v(ext, "receptor", "ruc"),
            "importe_total":     _v(ext, "importe_total"),
            "monto_pendiente":   _v(ext, "monto_pendiente"),
            "moneda":            _v(ext, "moneda"),
            "fecha_emision":     _v(ext, "fecha_emision"),
            "forma_pago":        _v(ext, "forma_pago"),
        },
        ensure_ascii=False, 
        indent=2,
        cls=DecimalEncoder
    )

    candidates_txt = "\n\n".join(
        f"FACTURA {i + 1} (score KB: {c['score']}):\n{c['contenido']}"
        for i, c in enumerate(candidates)
    )

    prompt = f"""Eres un experto en conciliación de cuentas por cobrar.
Tu única tarea es comparar un comprobante escaneado contra facturas del catálogo y determinar cuál coincide mejor.

<comprobante_escaneado>
{extracted_summary}
</comprobante_escaneado>

<facturas_catalogo>
{candidates_txt}
</facturas_catalogo>

<instrucciones>
Sigue estos pasos en orden:

1. Elige la factura con mayor coincidencia usando esta prioridad de campos:
   numero_operacion exacto > numero_documento exacto > RUC exacto > monto (±1%) > REGLA FIFO (La Más Antigua) > cliente

2. Determina el nivel_confianza aplicando los criterios en orden descendente, deteniéndote en el primero que se cumpla:

   ALTO — si se cumple al menos una de estas condiciones:
     a) numero_operacion está presente en el comprobante Y en la factura, y son idénticos carácter a carácter.
     b) numero_documento está presente en el comprobante Y coincide exacto con el número de la factura.
     c) RUC está presente en el comprobante Y coincide exacto, Y el monto difiere menos de 1%, Y la fecha es el mismo mes.

   MEDIO — si no se cumple ningún criterio ALTO, pero se cumplen al menos 2 de estos grupos:
     · Grupo A: cliente o RUC presente en el comprobante y coincide exacto o muy similar.
     · Grupo B: monto difiere menos de 5% Y forma_pago coincide.
     · Grupo C: fecha en el mismo mes y año.

   BAJO — si solo coincide 1 grupo de los anteriores, o solo hay coincidencias en campos genéricos.

   SIN_MATCH — si ninguna factura tiene coincidencia significativa.

3. Reglas que deben respetarse siempre:
   - Un campo solo cuenta como coincidente si está presente (no nulo) en el comprobante Y en la factura.
   - Si numero_operacion está en el comprobante Y en la factura pero no son idénticos, el nivel máximo posible es BAJO.
   - REGLA FIFO (First-In, First-Out): Si el comprobante coincide con varias facturas del mismo cliente por el mismo monto exacto, y el comprobante no indica un numero_documento ni numero_operacion que permita diferenciarlas, OBLIGATORIAMENTE debes sugerir la factura MÁS ANTIGUA (la que tenga la fecha_emision más lejana en el pasado) para conciliarla primero.
   - La justificacion debe explicar qué criterio aplicaste y por qué. Si aplicaste la Regla FIFO, indícalo explícitamente en el campo 'justificacion'.
</instrucciones>

Devuelve ÚNICAMENTE un objeto JSON válido. NO escribas saludos ni justificaciones fuera de la estructura JSON.

{{
  "factura_sugerida": {{
    "numero_documento": string|null,
    "cliente":          string|null,
    "ruc":              string|null,
    "monto_total":      number|null,
    "moneda":           string|null,
    "fecha_emision":    string|null,
    "vencimiento":      string|null,
    "estado":           string|null
  }},
  "nivel_confianza":     "ALTO" | "MEDIO" | "BAJO" | "SIN_MATCH",
  "score_kb":            number,
  "campos_coincidentes": [string],
  "campos_discrepantes": [string],
  "justificacion":       string
}}
"""

    body = {
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        "max_tokens": 2048,
        "temperature": 0.0,
        "anthropic_version": "bedrock-2023-05-31",
    }

    response = json.loads(
        bedrock.invoke_model(
            modelId=CLAUDE_MODEL_ID,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )["body"].read()
    )

    raw = response["content"][0]["text"]
    
    # 🚨 EXTRACCIÓN ROBUSTA: Encontramos la primera { y la última } ignorando el texto humano
    start_idx = raw.find('{')
    end_idx = raw.rfind('}')
    
    if start_idx != -1 and end_idx != -1:
        clean_json = raw[start_idx:end_idx+1]
    else:
        clean_json = raw # Fallback de emergencia
        
    return json.loads(clean_json.strip(), parse_float=decimal.Decimal)


def save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion, candidates, archivo_original=None):
    processed_s3_key = f"processed/{file_name}.json"
    
    # Inyección segura del archivo de imagen
    datos_s3 = conciliacion.copy()
    if archivo_original:
        datos_s3["archivo"] = archivo_original
        
    # 1. Guardar archivo final JSON en S3
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=processed_s3_key,
        Body=json.dumps(datos_s3, ensure_ascii=False, cls=DecimalEncoder),
        ContentType="application/json"
    )
    
    # 2. Guardar Voucher en DynamoDB
    timestamp = datetime.utcnow().isoformat() + "Z"
    voucher_pk = f"VOUCHER#{file_name}"
    
    table.put_item(Item={
        "PK": voucher_pk,
        "SK": "METADATA",
        "fileName": file_name,
        "s3_key": processed_s3_key,
        "empresa_emisora_ruc": empresa_emisora_ruc,
        "estado": "PENDIENTE_REVISION",
        "conciliacion": conciliacion,
        "candidatos_kb": candidates, 
        "fecha_importacion": timestamp
    })
    
    # 3. Crear Ticket de Auditoría inicial
    table.put_item(Item={
        "PK": f"AUDIT#{timestamp}#VOUCHER_{file_name}",
        "SK": "METADATA",
        "tipo_accion": "ANALISIS_IA",
        "numero_documento": "VOUCHER",
        "voucher_vinculado": processed_s3_key,
        "empresa_emisora_ruc": empresa_emisora_ruc,
        "fecha_registro": timestamp,
        "estado": "AUDITADO"
    })
    
    return processed_s3_key


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        s3_key = body.get("s3_key") or event.get("s3_key")
        empresa_emisora_ruc = body.get("empresa_emisora_ruc") or event.get("empresa_emisora_ruc")

        if not s3_key: return _err(400, "Campo requerido: s3_key")
        if not empresa_emisora_ruc: return _err(400, "Campo requerido: empresa_emisora_ruc")
        if not KNOWLEDGE_BASE_ID: return _err(500, "KNOWLEDGE_BASE_ID no está configurado")

        file_name = os.path.basename(s3_key)
        if file_name.endswith(".json"):
            file_name = file_name[:-5]

        extracted  = read_s3_json(s3_key)
        extraccion = extracted.get("extraccion", extracted)
        archivo_original = extracted.get("archivo")

        query = build_query(extraccion, empresa_emisora_ruc)
        candidates = retrieve_kb(query)
        
        if not candidates:
            conciliacion_vacia = {
                "factura_sugerida": None,
                "nivel_confianza": "SIN_MATCH",
                "score_kb": decimal.Decimal("0"),
                "campos_coincidentes": [],
                "campos_discrepantes": [],
                "justificacion": "La Base de Datos no retornó facturas candidatas.",
            }
            save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion_vacia, [], archivo_original)
            return _ok({
                "s3_key": s3_key,
                "empresa_emisora_ruc": empresa_emisora_ruc,
                "conciliacion": conciliacion_vacia
            })

        conciliacion = evaluate(extraccion, candidates)
        
        if conciliacion.get("factura_sugerida") and isinstance(conciliacion["factura_sugerida"], dict):
            doc = conciliacion["factura_sugerida"].get("numero_documento")
            if doc:
                conciliacion["factura_sugerida"]["PK"] = f"INVOICE#{empresa_emisora_ruc}#{doc}"

        save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion, candidates, archivo_original)

        return _ok({
            "s3_key": s3_key,
            "empresa_emisora_ruc": empresa_emisora_ruc,
            "conciliacion": conciliacion,
        })

    except botocore.exceptions.ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("NoSuchKey", "AccessDenied"):
            return _err(404, "El archivo no existe o aún se está procesando.")
        return _err(500, str(e))
    except Exception as e:
        import traceback
        print(f"Error crítico en Lambda: {e}")
        traceback.print_exc()
        return _err(500, str(e))


def _ok(body: dict) -> dict:
    return {"statusCode": 200, "headers": CORS, "body": json.dumps(body, ensure_ascii=False, cls=DecimalEncoder)}

def _err(status: int, msg: str) -> dict:
    return {"statusCode": status, "headers": CORS, "body": json.dumps({"error": msg})}