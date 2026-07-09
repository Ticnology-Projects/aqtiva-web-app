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
# 🚨 AUMENTADO A 40 PARA EL MVP
KB_N_RESULTS      = int(os.environ.get("KB_N_RESULTS", "40"))

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

# ==============================================================================
# LECTURA DEL DICCIONARIO
# ==============================================================================
def get_tenant_dictionary(empresa_emisora_ruc: str) -> str:
    try:
        key = f"dictionaries/{empresa_emisora_ruc}.json"
        resp = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        dict_data = json.loads(resp["Body"].read())
        return json.dumps(dict_data, ensure_ascii=False, indent=2)
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            return "No hay diccionario oficial."
        return "Error leyendo el diccionario."

def build_query(ext: dict, empresa_ruc: str) -> str:
    parts = []
    numero           = _v(ext, "numero_documento")
    numero_operacion = _v(ext, "numero_operacion")
    emisor_nom       = _v(ext, "emisor", "nombre")
    emisor_ruc       = _v(ext, "emisor", "ruc")
    receptor_nom     = _v(ext, "receptor", "nombre")
    monto            = _v(ext, "monto_pendiente") or _v(ext, "importe_total")
    moneda           = _v(ext, "moneda")
    fecha_pago       = _v(ext, "fecha_pago") or _v(ext, "fecha_emision")
    
    if numero_operacion: numero_operacion = str(numero_operacion).lstrip("0") or numero_operacion
    
    if empresa_ruc: parts.append(f"**RUC Empresa A Cobrar:** {empresa_ruc}")
    if numero_operacion:  parts.append(f"**Número De Operación:** {numero_operacion}")
    if numero:            parts.append(f"**Número Documento:** {numero}")
    if emisor_nom:        parts.append(f"**Entidad Origen:** {emisor_nom}")
    if receptor_nom:      parts.append(f"**Entidad Destino:** {receptor_nom}")
    if emisor_ruc:        parts.append(f"**RUC Origen:** {emisor_ruc}")
    if monto is not None: parts.append(f"**Monto:** {monto}")
    if moneda:            parts.append(f"**Moneda:** {moneda}")
    if fecha_pago:        parts.append(f"**Fecha de Pago:** {fecha_pago}")

    return " ".join(parts)

# ==============================================================================
# 🚨 NUEVO: OBTENER FACTURAS DIRECTO DE DYNAMODB (Cero puntos ciegos)
# ==============================================================================
def retrieve_dynamo_invoices(empresa_emisora_ruc: str) -> list[dict]:
    prefix = f"INVOICE#{empresa_emisora_ruc}#"
    try:
        response = table.scan(
            FilterExpression="begins_with(PK, :prefix) AND SK = :sk AND estado = :estado",
            ExpressionAttributeValues={
                ":prefix": prefix,
                ":sk": "METADATA",
                ":estado": "PENDIENTE"
            }
        )
        items = response.get("Items", [])
        
        candidates = []
        for item in items:
            tiene_det = "SI" if str(item.get("tiene_detraccion", "false")).lower() in ["true", "si", "1"] else "NO"
            neto = item.get('monto_neto_pagar') or item.get('monto', '0')
            
            # Formateamos exactamente igual a como responde la Base de Conocimientos
            contenido = (
                f"Número Documento: {item.get('numero_documento', '')}\n"
                f"Cliente: {item.get('cliente', '')}\n"
                f"RUC Cliente: {item.get('ruc_cliente', '')}\n"
                f"Monto Total Bruto: {item.get('monto', '0')}\n"
                f"Moneda: {item.get('moneda', 'PEN')}\n"
                f"Fecha Emisión: {item.get('fecha_emision', '')}\n"
                f"Fecha Vencimiento: {item.get('fecha_vencimiento', '')}\n"
                f"Sujeto a Detracción: {tiene_det}\n"
                f"Tasa Detracción: {item.get('tasa_detraccion', '0')}\n"
                f"Monto Neto a Pagar: {neto}\n"
                f"Estado: {item.get('estado', 'PENDIENTE')}"
            )
            candidates.append({"contenido": contenido, "score": decimal.Decimal("1.0000")})
        
        return candidates
    except Exception as e:
        print(f"Error consultando DynamoDB directamente: {e}")
        return []

# ==============================================================================
# FALLBACK: OBTENER DE BEDROCK KNOWLEDGE BASE
# ==============================================================================
def retrieve_kb(query: str, empresa_emisora_ruc: str) -> list[dict]:
    filtro = {
        "equals": {
            "key": "empresa_emisora_ruc",
            "value": empresa_emisora_ruc
        }
    }
    try:
        resp = bedrock_agent.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": KB_N_RESULTS,
                    "filter": filtro
                }
            },
        )
        return [{"contenido": r["content"]["text"], "score": decimal.Decimal(str(round(r["score"], 4)))} for r in resp.get("retrievalResults", [])]
    except Exception as e:
        resp = bedrock_agent.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": query},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": KB_N_RESULTS}},
        )
        return [{"contenido": r["content"]["text"], "score": decimal.Decimal(str(round(r["score"], 4)))} for r in resp.get("retrievalResults", [])]

def parsear_fecha_segura(fecha_str):
    if not fecha_str: return None
    import re
    match = re.search(r'(\d{2})[/.-](\d{2})[/.-](\d{4})|(\d{4})[/.-](\d{2})[/.-](\d{2})', str(fecha_str))
    if not match: return None
    
    g = match.groups()
    try:
        if g[0]: return datetime(int(g[2]), int(g[1]), int(g[0]))
        elif g[3]: return datetime(int(g[3]), int(g[4]), int(g[5]))
    except:
        return None
    return None

def evaluate(ext: dict, candidates: list[dict], diccionario_str: str) -> dict:
    extracted_summary = json.dumps({
        "numero_documento":  _v(ext, "numero_documento"),
        "numero_operacion":  _v(ext, "numero_operacion"),
        "entidad_origen":    _v(ext, "emisor", "nombre"),
        "importe_pagado":    _v(ext, "importe_total") or _v(ext, "monto_pendiente"),
        "moneda":            _v(ext, "moneda"),
        "fecha_pago":        _v(ext, "fecha_pago") or _v(ext, "fecha_emision"),
    }, ensure_ascii=False, indent=2, cls=DecimalEncoder)

    candidates_txt = "\n\n".join(f"FACTURA {i + 1}:\n{c['contenido']}" for i, c in enumerate(candidates))

    prompt = f"""Eres un motor de conciliación contable estricto. Tu máxima prioridad es la MATEMÁTICA EXACTA y la CRONOLOGÍA LÓGICA, por encima de las identidades de texto.

<diccionario_clientes_oficial>
{diccionario_str}
</diccionario_clientes_oficial>

<comprobante_escaneado>
{extracted_summary}
</comprobante_escaneado>

<facturas_catalogo>
{candidates_txt}
</facturas_catalogo>

<instrucciones>
Sigue este orden lógico de evaluación OBLIGATORIAMENTE:

1. REGLA DE DETRACCIÓN (CÁLCULO PREVIO):
   - Revisa todas las facturas. Si alguna indica "Sujeto a Detracción" o tiene una tasa > 0, OBLIGATORIAMENTE calcula su neto: Neto = Bruto - (Bruto * Tasa).
   - SOLO usa los 'Montos Netos' para comparar contra el importe_pagado del comprobante.

2. BÚSQUEDA MATEMÁTICA (1 a 1 y LOTES):
   - ¿Hay alguna factura individual o una SUMA de varias facturas de un mismo cliente cuyo Monto Neto dé EXACTAMENTE el monto del comprobante?
   - Si la matemática cuadra exacto, IGNORA SI EL NOMBRE ES GENÉRICO (ej: "Transferencia BCP", "Abono", "Pago de terceros"). La matemática es la prueba definitiva.

3. REGLA DE TOLERANCIA CERO - CRONOLOGÍA:
   - Compara la 'fecha_pago' del comprobante_escaneado con la 'Fecha Emisión' de la(s) factura(s).
   - Un cliente no puede pagar una factura antes de que esta exista. Si la fecha del comprobante es ANTERIOR a la Fecha de Emisión de la factura sugerida, queda ESTRICTAMENTE PROHIBIDO asignar nivel_confianza "ALTO". Debes bajarlo a "MEDIO" o "BAJO".

4. REGLA DE TOLERANCIA CERO - MATEMÁTICA:
   - Queda ESTRICTAMENTE PROHIBIDO asignar nivel_confianza "ALTO" si la diferencia matemática entre el comprobante y la(s) factura(s) es mayor a 1.00.
   - Si la matemática no cuadra exactamente, debes asignar "MEDIO" o "BAJO", incluso si estás 100% seguro de la identidad del cliente en el diccionario.

Piensa paso a paso. Tu primer campo en el JSON debe ser obligatoriamente 'analisis_matematico' explicando tus cálculos de netos, diferencias y la VALIDACIÓN DE FECHAS.
</instrucciones>

Devuelve ÚNICAMENTE un JSON con esta estructura y en este ORDEN EXACTO:
{{
  "analisis_matematico": "string (Escribe paso a paso tus sumas, el cálculo de la detracción, la diferencia final detectada y valida expresamente si la fecha del comprobante es igual o posterior a la fecha de emisión de la factura)",
  "justificacion_identidad": "string (Explica si el nombre del voucher es genérico, válido o si usaste el diccionario)",
  "tipo_conciliacion": "INDIVIDUAL" | "LOTE" | "NINGUNA",
  "facturas_sugeridas": [
    {{ "numero_documento": "string", "cliente": "string", "ruc": "string", "monto_total": number, "monto_neto_aplicado": number, "moneda": "string", "fecha_emision": "string" }}
  ],
  "campos_coincidentes": ["string"],
  "campos_discrepantes": ["string"],
  "nivel_confianza": "ALTO"|"MEDIO"|"BAJO"|"SIN_MATCH",
  "score_kb": number
}}"""

    body = {"messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}], "max_tokens": 2048, "temperature": 0.0, "anthropic_version": "bedrock-2023-05-31"}
    response = json.loads(bedrock.invoke_model(modelId=CLAUDE_MODEL_ID, body=json.dumps(body), contentType="application/json", accept="application/json")["body"].read())
    raw = response["content"][0]["text"]
    
    start_idx, end_idx = raw.find('{'), raw.rfind('}')
    clean_json = raw[start_idx:end_idx+1] if start_idx != -1 and end_idx != -1 else raw 
    return json.loads(clean_json.strip(), parse_float=decimal.Decimal)

def save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion, candidates, archivo_original=None):
    processed_s3_key = f"processed/{file_name}.json"
    
    # Hacemos una copia de la respuesta de la IA
    datos_s3 = conciliacion.copy()
    if archivo_original: 
        datos_s3["archivo"] = archivo_original
    
    # 🚨 NUEVO: Inyectamos el catálogo exacto que se le dio a la IA para depuración
    datos_s3["candidatos_proporcionados_al_agente"] = candidates
        
    s3.put_object(
        Bucket=BUCKET_NAME, 
        Key=processed_s3_key, 
        Body=json.dumps(datos_s3, ensure_ascii=False, cls=DecimalEncoder), 
        ContentType="application/json"
    )
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    table.put_item(Item={
        "PK": f"VOUCHER#{file_name}", "SK": "METADATA", "fileName": file_name, "s3_key": processed_s3_key,
        "empresa_emisora_ruc": empresa_emisora_ruc, "estado": "PENDIENTE_REVISION",
        "conciliacion": conciliacion, 
        "candidatos_kb": candidates, # Esto ya se guardaba en DynamoDB
        "fecha_importacion": timestamp
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

        diccionario_tenant = get_tenant_dictionary(empresa_emisora_ruc)
        
        # 🚨 FLUJO HÍBRIDO: Primero intentamos con la data en vivo de DynamoDB
        candidates = retrieve_dynamo_invoices(empresa_emisora_ruc)
        
        # 🚨 FALLBACK: Si Dynamo falla o extrañamente no trae nada, usamos Knowledge Base
        if not candidates:
            print("Fallback a Bedrock Knowledge Base...")
            query = build_query(extraccion, empresa_emisora_ruc)
            candidates = retrieve_kb(query, empresa_emisora_ruc)
        
        if not candidates:
            conc_vacia = {"tipo_conciliacion": "NINGUNA", "facturas_sugeridas": [], "nivel_confianza": "SIN_MATCH", "score_kb": 0, "campos_coincidentes": [], "campos_discrepantes": [], "analisis_matematico": "No hay facturas pendientes en la base de datos para esta empresa."}
            save_voucher_and_audit(file_name, empresa_emisora_ruc, conc_vacia, [], archivo_original)
            return _ok({"s3_key": s3_key, "empresa_emisora_ruc": empresa_emisora_ruc, "conciliacion": conc_vacia})

        conciliacion = evaluate(extraccion, candidates, diccionario_tenant)
        
        monto_origen = _v(extraccion, "importe_total") or _v(extraccion, "monto_pendiente")
        monto_calc = float(monto_origen) if monto_origen else sum(float(f.get("monto_neto_aplicado", f.get("monto_total", 0))) for f in conciliacion.get("facturas_sugeridas", []))
        fecha_pago_origen = _v(extraccion, "fecha_pago") or _v(extraccion, "fecha_emision")

        # 🚨 VETO DEL SISTEMA (KILL SWITCH MULTIPLE) 🚨
        try:
            m_origen_float = float(monto_origen) if monto_origen else 0.0
            m_sugerido_float = sum(float(f.get("monto_neto_aplicado", f.get("monto_total", 0))) for f in conciliacion.get("facturas_sugeridas", []))
            
            mensajes_veto = []
            bajar_a_medio = False

            if m_origen_float > 0 and m_sugerido_float > 0:
                diferencia = abs(m_origen_float - m_sugerido_float)
                if diferencia > 1.00:
                    bajar_a_medio = True
                    mensajes_veto.append(f"discrepancia matemática de {diferencia:.2f}")

            fecha_voucher_dt = parsear_fecha_segura(fecha_pago_origen)
            sugeridas = conciliacion.get("facturas_sugeridas", [])
            
            if fecha_voucher_dt and len(sugeridas) > 0:
                for fac in sugeridas:
                    fecha_fac_dt = parsear_fecha_segura(fac.get("fecha_emision"))
                    if fecha_fac_dt and fecha_voucher_dt < fecha_fac_dt:
                        bajar_a_medio = True
                        mensajes_veto.append(f"anacronismo detectado (El voucher es del {fecha_pago_origen}, pero la factura se emitió después, el {fac.get('fecha_emision')})")
                        break 

            if bajar_a_medio and conciliacion.get("nivel_confianza") == "ALTO":
                conciliacion["nivel_confianza"] = "MEDIO"
                motivos_unidos = " y ".join(mensajes_veto)
                mensaje_final = f"\n\n[SISTEMA INTERNO]: Veto activado. La IA intentó asignar confianza ALTA, pero Python detectó: {motivos_unidos}. Nivel forzado a MEDIO."
                conciliacion["analisis_matematico"] = conciliacion.get("analisis_matematico", "") + mensaje_final
                print(mensaje_final)

        except Exception as e:
            print("No se pudo ejecutar el veto del sistema:", e)
        
        conciliacion["importe_pagado"] = decimal.Decimal(str(round(monto_calc, 2)))
        conciliacion["moneda"] = _v(extraccion, "moneda") or "PEN"

        if conciliacion.get("facturas_sugeridas") and isinstance(conciliacion["facturas_sugeridas"], list):
            for fac in conciliacion["facturas_sugeridas"]:
                doc = fac.get("numero_documento")
                if doc: fac["PK"] = f"INVOICE#{empresa_emisora_ruc}#{doc}"
            
            if len(conciliacion["facturas_sugeridas"]) == 1:
                conciliacion["factura_sugerida"] = conciliacion["facturas_sugeridas"][0]

        save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion, candidates, archivo_original)
        return _ok({"s3_key": s3_key, "empresa_emisora_ruc": empresa_emisora_ruc, "conciliacion": conciliacion})

    except Exception as e:
        error_msg = str(e)
        if "NoSuchKey" in error_msg or "AccessDenied" in error_msg: return _err(404, "El archivo OCR aún se está procesando en Textract.")
        print(f"Error crítico: {e}")
        return _err(500, error_msg)

def _ok(body: dict) -> dict: return {"statusCode": 200, "headers": CORS, "body": json.dumps(body, ensure_ascii=False, cls=DecimalEncoder)}
def _err(status: int, msg: str) -> dict: return {"statusCode": status, "headers": CORS, "body": json.dumps({"error": msg})}