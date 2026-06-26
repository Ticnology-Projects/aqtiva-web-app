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
KB_N_RESULTS      = int(os.environ.get("KB_N_RESULTS", "15")) 

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
        if isinstance(o, decimal.Decimal): return float(o)
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
    numero           = _v(ext, "numero_documento")
    numero_operacion = _v(ext, "numero_operacion")
    emisor_nom       = _v(ext, "emisor", "nombre")
    emisor_ruc       = _v(ext, "emisor", "ruc")
    receptor_nom     = _v(ext, "receptor", "nombre")
    monto            = _v(ext, "monto_pendiente") or _v(ext, "importe_total")
    moneda           = _v(ext, "moneda")
    
    if numero_operacion: numero_operacion = str(numero_operacion).lstrip("0") or numero_operacion
    
    if empresa_ruc: parts.append(f"**RUC Empresa A Cobrar:** {empresa_ruc}")
    if numero_operacion:  parts.append(f"**Número De Operación:** {numero_operacion}")
    if numero:            parts.append(f"**Número Documento:** {numero}")
    if emisor_nom:        parts.append(f"**Entidad Origen:** {emisor_nom}")
    if receptor_nom:      parts.append(f"**Entidad Destino:** {receptor_nom}")
    if emisor_ruc:        parts.append(f"**RUC Origen:** {emisor_ruc}")
    if monto is not None: parts.append(f"**Monto:** {monto}")
    if moneda:            parts.append(f"**Moneda:** {moneda}")

    return " ".join(parts)

def retrieve_kb(query: str) -> list[dict]:
    resp = bedrock_agent.retrieve(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        retrievalQuery={"text": query},
        retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": KB_N_RESULTS}},
    )
    return [{"contenido": r["content"]["text"], "score": decimal.Decimal(str(round(r["score"], 4)))} for r in resp.get("retrievalResults", [])]

def evaluate(ext: dict, candidates: list[dict]) -> dict:
    extracted_summary = json.dumps({
        "numero_documento":  _v(ext, "numero_documento"),
        "numero_operacion":  _v(ext, "numero_operacion"),
        "entidad_origen":    _v(ext, "emisor", "nombre"),
        "importe_pagado":    _v(ext, "importe_total") or _v(ext, "monto_pendiente"),
        "moneda":            _v(ext, "moneda"),
        "fecha_pago":        _v(ext, "fecha_pago") or _v(ext, "fecha_emision"),
    }, ensure_ascii=False, indent=2, cls=DecimalEncoder)

    candidates_txt = "\n\n".join(f"FACTURA {i + 1}:\n{c['contenido']}" for i, c in enumerate(candidates))

    prompt = f"""Eres un auditor estricto de conciliación de cuentas por cobrar. Tu tarea es cruzar comprobantes bancarios contra facturas y resolver problemas matemáticos de agrupación de pagos.

<comprobante_escaneado>
{extracted_summary}
</comprobante_escaneado>

<facturas_catalogo>
{candidates_txt}
</facturas_catalogo>

<instrucciones>
Sigue estos pasos rigurosamente:

1. ANÁLISIS INDIVIDUAL O LOTE:
   - Primero busca 1 sola factura cuyo "Monto Neto a Pagar" (o Total Bruto si no hay detracción) coincida exactamente (±1%) con el monto del comprobante.
   - Si no hay match 1:1, busca si la SUMA EXACTA de los montos netos de 2 o más facturas del MISMO CLIENTE cuadra con el comprobante.
   
2. REGLA DE DETRACCIÓN (CRÍTICA): Usa SIEMPRE el "Monto Neto a Pagar" si la factura está sujeta a detracción.

3. NIVELES DE CONFIANZA:
   ALTO — El monto pagado difiere menos de un 1% del Monto Neto de 1 factura O de la suma de varias. Moneda idéntica. ADEMÁS debe coincidir el numero_operacion, numero_documento o nombre del cliente claramente.
   MEDIO — Coinciden cliente/documentos, PERO el cliente pagó el Total Bruto ignorando la detracción, faltan unidades significativas o la suma del lote difiere más de 1%.
   BAJO — Discrepancia total de divisas o nula coincidencia.
   SIN_MATCH — No hay combinaciones válidas.
</instrucciones>

Devuelve ÚNICAMENTE un JSON con este esquema exacto:
{{
  "tipo_conciliacion": "INDIVIDUAL" | "LOTE" | "NINGUNA",
  "facturas_sugeridas": [
    {{ "numero_documento": "string", "cliente": "string", "ruc": "string", "monto_neto_aplicado": number, "moneda": "string" }}
  ],
  "nivel_confianza": "ALTO"|"MEDIO"|"BAJO"|"SIN_MATCH",
  "score_kb": number,
  "campos_coincidentes": ["string"],
  "campos_discrepantes": ["string"],
  "justificacion": "string"
}}"""

    body = {"messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}], "max_tokens": 2048, "temperature": 0.0, "anthropic_version": "bedrock-2023-05-31"}
    response = json.loads(bedrock.invoke_model(modelId=CLAUDE_MODEL_ID, body=json.dumps(body), contentType="application/json", accept="application/json")["body"].read())
    raw = response["content"][0]["text"]
    
    start_idx, end_idx = raw.find('{'), raw.rfind('}')
    clean_json = raw[start_idx:end_idx+1] if start_idx != -1 and end_idx != -1 else raw 
    return json.loads(clean_json.strip(), parse_float=decimal.Decimal)

def save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion, candidates, archivo_original=None):
    processed_s3_key = f"processed/{file_name}.json"
    datos_s3 = conciliacion.copy()
    if archivo_original: datos_s3["archivo"] = archivo_original
        
    s3.put_object(Bucket=BUCKET_NAME, Key=processed_s3_key, Body=json.dumps(datos_s3, ensure_ascii=False, cls=DecimalEncoder), ContentType="application/json")
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    table.put_item(Item={
        "PK": f"VOUCHER#{file_name}", "SK": "METADATA", "fileName": file_name, "s3_key": processed_s3_key,
        "empresa_emisora_ruc": empresa_emisora_ruc, "estado": "PENDIENTE_REVISION",
        "conciliacion": conciliacion, "candidatos_kb": candidates, "fecha_importacion": timestamp
    })
    table.put_item(Item={
        "PK": f"AUDIT#{timestamp}#VOUCHER_{file_name}", "SK": "METADATA", "tipo_accion": "ANALISIS_IA",
        "numero_documento": "VOUCHER", "voucher_vinculado": processed_s3_key, "empresa_emisora_ruc": empresa_emisora_ruc,
        "fecha_registro": timestamp, "estado": "AUDITADO"
    })

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        s3_key = body.get("s3_key") or event.get("s3_key")
        empresa_emisora_ruc = body.get("empresa_emisora_ruc") or event.get("empresa_emisora_ruc")

        if not s3_key or not empresa_emisora_ruc: return _err(400, "Faltan parámetros clave")
        file_name = os.path.basename(s3_key).replace(".json", "")

        extracted  = read_s3_json(s3_key)
        extraccion = extracted.get("extraccion", extracted)
        archivo_original = extracted.get("archivo")

        query = build_query(extraccion, empresa_emisora_ruc)
        candidates = retrieve_kb(query)
        
        if not candidates:
            conc_vacia = {"tipo_conciliacion": "NINGUNA", "facturas_sugeridas": [], "nivel_confianza": "SIN_MATCH", "score_kb": 0, "campos_coincidentes": [], "campos_discrepantes": [], "justificacion": "No hay facturas."}
            save_voucher_and_audit(file_name, empresa_emisora_ruc, conc_vacia, [], archivo_original)
            return _ok({"s3_key": s3_key, "empresa_emisora_ruc": empresa_emisora_ruc, "conciliacion": conc_vacia})

        conciliacion = evaluate(extraccion, candidates)
        
        # 🚨 PARCHE RETROCOMPATIBLE (Corregido para DynamoDB)
        monto_origen = _v(extraccion, "importe_total") or _v(extraccion, "monto_pendiente")
        monto_calc = float(monto_origen) if monto_origen else sum(float(f.get("monto_neto_aplicado", 0)) for f in conciliacion.get("facturas_sugeridas", []))
        
        # Convertimos el float a string y luego a Decimal para que DynamoDB lo acepte
        conciliacion["importe_pagado"] = decimal.Decimal(str(round(monto_calc, 2)))
        conciliacion["moneda"] = _v(extraccion, "moneda") or "PEN"

        if conciliacion.get("facturas_sugeridas") and isinstance(conciliacion["facturas_sugeridas"], list):
            for fac in conciliacion["facturas_sugeridas"]:
                doc = fac.get("numero_documento")
                if doc: fac["PK"] = f"INVOICE#{empresa_emisora_ruc}#{doc}"
            
            # MAGIA: Creamos el objeto singular para satisfacer a tu script de auto-conciliación
            if len(conciliacion["facturas_sugeridas"]) == 1:
                conciliacion["factura_sugerida"] = conciliacion["facturas_sugeridas"][0]

        save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion, candidates, archivo_original)
        return _ok({"s3_key": s3_key, "empresa_emisora_ruc": empresa_emisora_ruc, "conciliacion": conciliacion})

    except Exception as e:
        error_msg = str(e)
        if "NoSuchKey" in error_msg or "AccessDenied" in error_msg: return _err(404, "El archivo OCR aún se está procesando en Textract.")
        return _err(500, error_msg)

def _ok(body: dict) -> dict: return {"statusCode": 200, "headers": CORS, "body": json.dumps(body, ensure_ascii=False, cls=DecimalEncoder)}
def _err(status: int, msg: str) -> dict: return {"statusCode": status, "headers": CORS, "body": json.dumps({"error": msg})}