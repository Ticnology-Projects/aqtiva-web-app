import json
import os
import decimal
import re
from datetime import datetime

import boto3
import botocore.exceptions

CLAUDE_MODEL_ID   = os.environ.get("CLAUDE_MODEL_ID", "")
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
BUCKET_NAME       = os.environ.get("BUCKET_NAME", "")
REGION            = os.environ.get("AWS_REGION", "us-east-1")
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
    body_content = resp["Body"].read()
    try:
        return json.loads(body_content, parse_float=decimal.Decimal)
    except json.JSONDecodeError:
        raise Exception(f"El archivo OCR extraído ({key}) está vacío o corrupto.")

def get_tenant_dictionary(empresa_emisora_ruc: str) -> str:
    try:
        key = f"dictionaries/{empresa_emisora_ruc}.json"
        resp = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        body_content = resp["Body"].read()
        if not body_content or len(body_content.strip()) == 0:
            return "No hay diccionario oficial."
        return json.dumps(json.loads(body_content), ensure_ascii=False, indent=2)
    except Exception:
        return "No hay diccionario oficial."

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

def retrieve_dynamo_invoices(empresa_emisora_ruc: str):
    prefix = f"INVOICE#{empresa_emisora_ruc}#"
    candidates = []
    raw_db_items = []
    try:
        kwargs = {
            "FilterExpression": "begins_with(PK, :prefix) AND SK = :sk AND #st = :estado",
            "ExpressionAttributeNames": { "#st": "estado" },
            "ExpressionAttributeValues": {
                ":prefix": prefix,
                ":sk": "METADATA",
                ":estado": "PENDIENTE"
            }
        }
        response = table.scan(**kwargs)
        items = response.get("Items", [])
        
        while 'LastEvaluatedKey' in response:
            kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
            response = table.scan(**kwargs)
            items.extend(response.get("Items", []))
            
        raw_db_items = items
            
        for item in items:
            tiene_det = "SI" if str(item.get("tiene_detraccion", "false")).lower() in ["true", "si", "1"] else "NO"
            neto = item.get('monto_neto_pagar') or item.get('monto', '0')
            
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
        
        return candidates, raw_db_items
    except Exception as e:
        print(f"Error consultando DynamoDB: {e}")
        return [], []

def retrieve_kb(query: str, empresa_emisora_ruc: str) -> list[dict]:
    filtro = {"equals": {"key": "empresa_emisora_ruc", "value": empresa_emisora_ruc}}
    try:
        resp = bedrock_agent.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID, retrievalQuery={"text": query},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": KB_N_RESULTS, "filter": filtro}},
        )
        return [{"contenido": r["content"]["text"], "score": decimal.Decimal(str(round(r["score"], 4)))} for r in resp.get("retrievalResults", [])]
    except Exception:
        resp = bedrock_agent.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID, retrievalQuery={"text": query},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": KB_N_RESULTS}},
        )
        return [{"contenido": r["content"]["text"], "score": decimal.Decimal(str(round(r["score"], 4)))} for r in resp.get("retrievalResults", [])]

def parsear_fecha_segura(fecha_str):
    if not fecha_str: return None
    match = re.search(r'(\d{2})[/.-](\d{2})[/.-](\d{4})|(\d{4})[/.-](\d{2})[/.-](\d{2})', str(fecha_str))
    if not match: return None
    g = match.groups()
    try:
        if g[0]: return datetime(int(g[2]), int(g[1]), int(g[0]))
        elif g[3]: return datetime(int(g[3]), int(g[4]), int(g[5]))
    except: return None
    return None

def safe_float(val):
    if not val: return 0.0
    try:
        clean_val = re.sub(r'[^\d.-]', '', str(val))
        return float(clean_val) if clean_val else 0.0
    except:
        return 0.0

def evaluate(ext: dict, candidates: list[dict], diccionario_str: str) -> dict:
    # 🚨 AQUÍ ESTÁ LA SOLUCIÓN: Agregamos entidad_destino al JSON que lee la IA
    extracted_summary = json.dumps({
        "numero_documento":  _v(ext, "numero_documento"),
        "numero_operacion":  _v(ext, "numero_operacion"),
        "entidad_origen":    _v(ext, "emisor", "nombre"),
        "entidad_destino":   _v(ext, "receptor", "nombre"),
        "importe_pagado":    _v(ext, "importe_total") or _v(ext, "monto_pendiente"),
        "moneda":            _v(ext, "moneda"),
        "fecha_pago":        _v(ext, "fecha_pago") or _v(ext, "fecha_emision"),
    }, ensure_ascii=False, indent=2, cls=DecimalEncoder)

    candidates_txt = "\n\n".join(f"FACTURA {i + 1}:\n{c['contenido']}" for i, c in enumerate(candidates))

    prompt = f"""Eres un motor de conciliación contable estricto. Tu máxima prioridad es la MATEMÁTICA EXACTA y la CRONOLOGÍA LÓGICA.

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
   - Revisa todas las facturas. Si alguna indica "Sujeto a Detracción", calcula su neto: Neto = Bruto - (Bruto * Tasa).
   - SOLO usa los 'Montos Netos' para comparar.

2. REGLA DE IDENTIDAD Y COMPROBANTES ANÓNIMOS:
   - Verifica el <diccionario_clientes_oficial> usando TANTO la "entidad_origen" COMO la "entidad_destino" del comprobante_escaneado.
   - EXCEPCIÓN CRÍTICA: Si el comprobante es ANÓNIMO (las entidades son "null" o genéricas), PERO existe UNA ÚNICA coincidencia matemática exacta en el catálogo, DEBES auto-conciliarla. LA MATEMÁTICA EXACTA ES LA PRUEBA DEFINITIVA y reemplaza la identidad.

3. BÚSQUEDA MATEMÁTICA (1 a 1 y LOTES):
   - ¿Hay alguna factura o SUMA de facturas de un mismo cliente cuyo Monto Neto dé EXACTAMENTE el monto del comprobante?

4. REGLA DE TOLERANCIA CERO - PROHIBIDO FRACCIONAR:
   - El "monto_neto_aplicado" sugerido DEBE SER el 100% del "Monto Neto a Pagar" original. Nunca modifiques el monto para forzar un cuadre.

5. REGLA DE TOLERANCIA CERO - FACTURAS COBRADAS:
   - Queda ESTRICTAMENTE PROHIBIDO sugerir una factura con "Estado: COBRADO". Solo puedes conciliar con facturas "PENDIENTE".

6. REGLA DE TOLERANCIA CERO - CRONOLOGÍA (EMISIÓN VS VENCIMIENTO):
   - Es IMPOSIBLE pagar una factura antes de su "Fecha Emisión". Si ocurre, el nivel_confianza DEBE SER "MEDIO".
   - Es PERFECTAMENTE NORMAL Y VÁLIDO que un cliente pague después de la "Fecha Vencimiento" (pago atrasado). NUNCA rechaces, penalices, ni bajes la confianza de una conciliación porque se pagó fuera de plazo.

7. REGLA DE TOLERANCIA CERO - DISCREPANCIA MATEMÁTICA:
   - Si la diferencia matemática entre el comprobante y la(s) factura(s) es mayor a 1.00, el nivel_confianza DEBE SER "MEDIO".
</instrucciones>

Devuelve ÚNICAMENTE un JSON con esta estructura y en este ORDEN EXACTO:
{{
  "analisis_matematico": "string",
  "justificacion_identidad": "string",
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
    try:
        return json.loads(clean_json.strip(), parse_float=decimal.Decimal)
    except json.JSONDecodeError:
        raise Exception("La Inteligencia Artificial devolvió una respuesta no válida o en blanco.")

def save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion, candidates, archivo_original=None, extraccion=None):
    processed_s3_key = f"processed/{file_name}.json"
    datos_s3 = conciliacion.copy()
    if archivo_original: datos_s3["archivo"] = archivo_original
    datos_s3["candidatos_proporcionados_al_agente"] = candidates
        
    s3.put_object(Bucket=BUCKET_NAME, Key=processed_s3_key, Body=json.dumps(datos_s3, ensure_ascii=False, cls=DecimalEncoder), ContentType="application/json")
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    item_voucher = {
        "PK": f"VOUCHER#{file_name}", "SK": "METADATA", "fileName": file_name, "s3_key": processed_s3_key,
        "empresa_emisora_ruc": empresa_emisora_ruc, "estado": "PENDIENTE_REVISION",
        "conciliacion": conciliacion, "candidatos_kb": candidates, "fecha_importacion": timestamp
    }
    
    if extraccion:
        nop = _v(extraccion, "numero_operacion")
        if nop: item_voucher["numero_operacion"] = str(nop).lstrip("0").strip()

    table.put_item(Item=item_voucher)
    
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
        
        candidates, raw_db_items = retrieve_dynamo_invoices(empresa_emisora_ruc)
        
        if not candidates:
            query = build_query(extraccion, empresa_emisora_ruc)
            candidates = retrieve_kb(query, empresa_emisora_ruc)
            
        candidates = [c for c in candidates if "Estado: PENDIENTE" in c["contenido"]]
        
        if not candidates:
            conc_vacia = {"tipo_conciliacion": "NINGUNA", "facturas_sugeridas": [], "nivel_confianza": "SIN_MATCH", "score_kb": 0, "campos_coincidentes": [], "campos_discrepantes": [], "analisis_matematico": "No se encontraron facturas PENDIENTES."}
            save_voucher_and_audit(file_name, empresa_emisora_ruc, conc_vacia, [], archivo_original, extraccion)
            return _ok({"s3_key": s3_key, "empresa_emisora_ruc": empresa_emisora_ruc, "conciliacion": conc_vacia})

        conciliacion = evaluate(extraccion, candidates, diccionario_tenant)
        
        monto_origen = _v(extraccion, "importe_total") or _v(extraccion, "monto_pendiente")
        fecha_pago_origen = _v(extraccion, "fecha_pago") or _v(extraccion, "fecha_emision")
        numero_op_origen = _v(extraccion, "numero_operacion")

        mensajes_veto = []
        bajar_a_medio = False
        m_origen_float = safe_float(monto_origen)
        sugeridas = conciliacion.get("facturas_sugeridas", [])
        
        m_sugerido_float = 0.0
        for fac in sugeridas:
            m_sugerido_float += safe_float(fac.get("monto_neto_aplicado", fac.get("monto_total", 0)))

        if m_origen_float == 0.0:
            bajar_a_medio = True
            mensajes_veto.append("El OCR no detectó el monto original del voucher.")
        
        elif m_sugerido_float > 0 and abs(m_origen_float - m_sugerido_float) > 1.00:
            bajar_a_medio = True
            mensajes_veto.append(f"Discrepancia matemática de {abs(m_origen_float - m_sugerido_float):.2f}")

        try:
            if len(sugeridas) > 0:
                for fac in sugeridas:
                    doc_sug = fac.get("numero_documento")
                    monto_sug = safe_float(fac.get("monto_neto_aplicado", 0))
                    
                    db_resp = table.get_item(Key={"PK": f"INVOICE#{empresa_emisora_ruc}#{doc_sug}", "SK": "METADATA"})
                    db_item = db_resp.get("Item")
                    
                    if not db_item:
                        bajar_a_medio = True
                        mensajes_veto.append(f"La factura {doc_sug} no existe en la BD.")
                    elif db_item.get("estado") != "PENDIENTE":
                        bajar_a_medio = True
                        mensajes_veto.append(f"CACHÉ FANTASMA: La factura {doc_sug} ya está {db_item.get('estado')}.")
                    else:
                        monto_real = safe_float(db_item.get("monto_neto_pagar") or db_item.get("monto", 0))
                        if abs(monto_sug - monto_real) > 1.00:
                            bajar_a_medio = True
                            mensajes_veto.append(f"Pago parcial inventado para {doc_sug}.")
        except Exception as e:
            print("Error Veto 3:", e)

        try:
            fecha_voucher_dt = parsear_fecha_segura(fecha_pago_origen)
            if fecha_voucher_dt and len(sugeridas) > 0:
                for fac in sugeridas:
                    fecha_fac_dt = parsear_fecha_segura(fac.get("fecha_emision"))
                    if fecha_fac_dt and fecha_voucher_dt < fecha_fac_dt:
                        bajar_a_medio = True
                        mensajes_veto.append(f"Anacronismo detectado contra factura {fac.get('numero_documento')}")
                        break 
        except Exception as e:
            print("Error Veto 4:", e)

        try:
            if numero_op_origen:
                num_op_clean = str(numero_op_origen).lstrip("0").strip()
                if num_op_clean:
                    dup_resp = table.scan(
                        FilterExpression="begins_with(PK, :pk) AND SK = :sk AND empresa_emisora_ruc = :ruc AND numero_operacion = :nop AND estado = :est",
                        ExpressionAttributeValues={":pk": "VOUCHER#", ":sk": "METADATA", ":ruc": empresa_emisora_ruc, ":nop": num_op_clean, ":est": "RESUELTO"}
                    )
                    if len(dup_resp.get("Items", [])) > 0:
                        bajar_a_medio = True
                        mensajes_veto.append(f"DOBLE GASTO: La Operación N° {num_op_clean} ya fue cobrada previamente.")
        except Exception as e:
            print("Error Veto 5:", e)

        if bajar_a_medio and conciliacion.get("nivel_confianza") == "ALTO":
            conciliacion["nivel_confianza"] = "MEDIO"
            motivos_unidos = " y ".join(mensajes_veto)
            mensaje_final = f"\n\n[SISTEMA INTERNO]: Veto activado. Nivel forzado a MEDIO debido a: {motivos_unidos}."
            conciliacion["analisis_matematico"] = conciliacion.get("analisis_matematico", "") + mensaje_final
            print(mensaje_final)
        
        monto_final = m_origen_float if m_origen_float > 0 else m_sugerido_float
        conciliacion["importe_pagado"] = decimal.Decimal(str(round(monto_final, 2)))
        conciliacion["moneda"] = _v(extraccion, "moneda") or "PEN"

        if conciliacion.get("facturas_sugeridas") and isinstance(conciliacion["facturas_sugeridas"], list):
            for fac in conciliacion["facturas_sugeridas"]:
                doc = fac.get("numero_documento")
                if doc: fac["PK"] = f"INVOICE#{empresa_emisora_ruc}#{doc}"
            if len(conciliacion["facturas_sugeridas"]) == 1:
                conciliacion["factura_sugerida"] = conciliacion["facturas_sugeridas"][0]

        save_voucher_and_audit(file_name, empresa_emisora_ruc, conciliacion, candidates, archivo_original, extraccion)
        return _ok({"s3_key": s3_key, "empresa_emisora_ruc": empresa_emisora_ruc, "conciliacion": conciliacion})

    except Exception as e:
        error_msg = str(e)
        if "NoSuchKey" in error_msg or "AccessDenied" in error_msg: return _err(404, "El archivo OCR aún se procesa.")
        print(f"Error crítico: {e}")
        return _err(500, error_msg)

def _ok(body: dict) -> dict: return {"statusCode": 200, "headers": CORS, "body": json.dumps(body, ensure_ascii=False, cls=DecimalEncoder)}
def _err(status: int, msg: str) -> dict: return {"statusCode": status, "headers": CORS, "body": json.dumps({"error": msg})}