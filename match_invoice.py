import json
import os

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

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _v(extraccion: dict, *path):
    """Navega el JSON extraído (estructura {valor, valido}) y retorna el valor o None."""
    node = extraccion
    for key in path:
        if not isinstance(node, dict):
            return None
        node = node.get(key, {})
    return node.get("valor") if isinstance(node, dict) else None


def read_s3_json(key: str) -> dict:
    resp = s3.get_object(Bucket=BUCKET_NAME, Key=key)
    return json.loads(resp["Body"].read())


def build_query(ext: dict) -> str:
    """Construye la query semántica para retrieve() a partir de los campos extraídos."""
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

    # Normalizar numero_operacion: eliminar ceros iniciales para coincidir con KB.
    # Los bancos emiten "01404503"; el Excel/KB almacena "1404503".
    if numero_operacion:
        numero_operacion = numero_operacion.lstrip("0") or numero_operacion

    # Usar formato markdown bold idéntico al texto indexado en la KB
    # para maximizar similitud coseno entre la query y los chunks.
    if numero_operacion:  parts.append(f"**Número De Operación:** {numero_operacion}")
    if numero:            parts.append(f"**Número Documento:** {numero}")
    if ruc_r:             parts.append(f"**RUC:** {ruc_r}")
    if ruc_e:             parts.append(f"**RUC:** {ruc_e}")
    if monto is not None: parts.append(f"**Monto Total:** {monto}")
    if fecha:             parts.append(f"**Fecha Emisión:** {fecha}")
    if emisor:           parts.append(f"**Cliente:** {emisor}")
    # if emisor:            parts.append(f"**Emisor:** {emisor}")
    if forma_pago:        parts.append(f"**Forma De Pago:** {forma_pago}")
    if moneda:            parts.append(f"**Moneda:** {moneda}")

    return " ".join(parts)


def retrieve_kb(query: str) -> list[dict]:
    resp = bedrock_agent.retrieve(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        retrievalQuery={"text": query},
        retrievalConfiguration={
            "vectorSearchConfiguration": {
                "numberOfResults": KB_N_RESULTS,
            }
        },
    )
    return [
        {
            "contenido": r["content"]["text"],
            "score":     round(r["score"], 4),
            "fuente":    r.get("location", {}).get("s3Location", {}).get("uri", ""),
        }
        for r in resp.get("retrievalResults", [])
    ]


def evaluate(ext: dict, candidates: list[dict]) -> dict:
    """Llama a Claude para evaluar los candidatos y elegir el mejor match."""
    extracted_summary = json.dumps(
        {
            "numero_documento":  _v(ext, "numero_documento"),
            "numero_operacion":  _v(ext, "numero_operacion"),
            "tipo_documento":    _v(ext, "tipo_documento"),
            "emisor":            _v(ext, "emisor", "nombre"),
            "ruc_emisor":        _v(ext, "emisor", "ruc"),
            # En vouchers: emisor.nombre = el pagador = el **Cliente** en la KB.
            # En facturas: el pagador también es el emisor del comprobante.
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
    )

    candidates_txt = "\n\n".join(
        f"FACTURA {i + 1} (score KB: {c['score']}):\n{c['contenido']}"
        for i, c in enumerate(candidates)
    )

    prompt = f"""Eres un experto en conciliación de cuentas por cobrar.
Tu única tarea es comparar un comprobante escaneado contra facturas del catálogo y determinar cuál coincide mejor, asignando el nivel de confianza correcto.

<comprobante_escaneado>
{extracted_summary}
</comprobante_escaneado>

<facturas_catalogo>
{candidates_txt}
</facturas_catalogo>

<instrucciones>
Sigue estos pasos en orden:

1. Elige la factura con mayor coincidencia usando esta prioridad de campos:
   numero_operacion exacto > numero_documento exacto > RUC exacto > monto (±1%) > fecha > cliente

2. Determina el nivel_confianza aplicando los criterios en orden descendente, deteniéndote en el primero que se cumpla:

   ALTO — si se cumple al menos una de estas condiciones:
     a) numero_operacion está presente en el comprobante Y en la factura, y son idénticos carácter a carácter.
     b) numero_documento está presente en el comprobante Y coincide exacto con el número de la factura.
     c) RUC está presente en el comprobante Y coincide exacto, Y el monto difiere menos de 1%, Y la fecha es el mismo mes.

   MEDIO — si no se cumple ningún criterio ALTO, pero se cumplen al menos 2 de estos grupos
     (monto y forma_pago juntos cuentan como un solo grupo, no como dos):
     · Grupo A: cliente o RUC presente en el comprobante y coincide exacto o muy similar.
     · Grupo B: monto difiere menos de 5% Y forma_pago coincide.
     · Grupo C: fecha en el mismo mes y año.

   BAJO — si solo coincide 1 grupo de los anteriores, o solo hay coincidencias en campos genéricos.

   SIN_MATCH — si ninguna factura tiene coincidencia significativa.

3. Reglas que deben respetarse siempre:
   - Un campo solo cuenta como coincidente si está presente (no nulo) en el comprobante Y en la factura. Un campo ausente en el comprobante no puede contar como coincidencia bajo ninguna circunstancia, sin importar lo que diga la factura.
   - Si numero_operacion está en el comprobante Y en la factura pero no son idénticos, el nivel máximo posible es BAJO, incluso si todos los demás campos coinciden. "Mismo prefijo" o "valor aproximado" no son coincidencias.
   - La justificacion debe explicar qué criterio aplicaste y por qué. No menciones otras facturas del catálogo.
</instrucciones>

<ejemplos>
<example>
Comprobante: numero_operacion=6062210, monto=247.8, forma_pago=Transferencia (sin RUC, sin numero_documento)
Factura: numero_operacion=06009429, monto=247.80, forma_pago=Transferencia, ruc=20611880244
Análisis: numero_operacion está en ambos pero no coincide (6062210 ≠ 06009429) → nivel máximo es BAJO.
Resultado: nivel_confianza=BAJO. campos_coincidentes=["monto_total","forma_pago"]. El RUC no aparece en el comprobante, no puede contarse.
</example>

<example>
Comprobante: numero_documento=F001-156, monto=177.0 (sin numero_operacion, sin RUC)
Factura: numero_documento=F001-156, monto=177.00, cliente=Dean Valdivia Inversiones SAC
Análisis: numero_documento presente en ambos y coincide exacto → criterio ALTO (b).
Resultado: nivel_confianza=ALTO. campos_coincidentes=["numero_documento","monto_total"].
</example>

<example>
Comprobante: numero_operacion=01404503, numero_documento=F001-156, monto=177.0 (sin RUC)
Factura: numero_operacion=1404503, numero_documento=F001-156, monto=177.00
Análisis: numero_operacion presentes en ambos. 01404503 vs 1404503 — no son idénticos carácter a carácter → nivel máximo BAJO. numero_documento coincide exacto pero ya aplicó la restricción del numero_operacion.
Resultado: nivel_confianza=BAJO.
</example>
</ejemplos>

Devuelve ÚNICAMENTE el siguiente JSON, sin ningún texto fuera de él:

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

    usage = response.get("usage", {})
    input_tokens  = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    total_tokens  = input_tokens + output_tokens
    print(f"[match_invoice] usage — input: {input_tokens} tokens | output: {output_tokens} tokens | total: {total_tokens} tokens")

    raw = response["content"][0]["text"]

    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


# ──────────────────────────────────────────────────────────────────────────────
# Lambda handler
# ──────────────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    s3_key = None
    try:
        body   = json.loads(event.get("body") or "{}")
        s3_key = body.get("s3_key") or event.get("s3_key")

        if not s3_key:
            return _err(400, "Campo requerido: s3_key")

        if not KNOWLEDGE_BASE_ID:
            return _err(500, "KNOWLEDGE_BASE_ID no está configurado")

        # 1. Leer JSON extraído de S3
        extracted  = read_s3_json(s3_key)
        print(f"[match_invoice] Extracción leída de S3 ({s3_key}):", json.dumps(extracted, ensure_ascii=False))
        extraccion = extracted.get("extraccion", extracted)

        # 2. Construir query semántica
        query = build_query(extraccion)
        print(f"[match_invoice] Query construida para retrieve(): {query}")
        if not query.strip():
            return _err(422, "La extracción no tiene campos suficientes para buscar")

        # 3. Retrieve en la KB
        candidates = retrieve_kb(query)
        print(f"[match_invoice] Candidatos obtenidos de la KB: {json.dumps(candidates, ensure_ascii=False)}")
        if not candidates:
            return _ok({
                "s3_key":       s3_key,
                "query_usada":  query,
                "conciliacion": {
                    "factura_sugerida":    None,
                    "nivel_confianza":     "SIN_MATCH",
                    "score_kb":            0,
                    "campos_coincidentes": [],
                    "campos_discrepantes": [],
                    "justificacion":       "La Knowledge Base no retornó candidatos.",
                },
            })

        # 4. Claude evalúa candidatos y elige el mejor match
        conciliacion = evaluate(extraccion, candidates)

        return _ok({
            "s3_key":        s3_key,
            "query_usada":   query,
            "conciliacion":  conciliacion,
        })

    except botocore.exceptions.ClientError as e:
        code = e.response["Error"]["Code"]
        # NoSuchKey → archivo aún no existe (extracción en curso o key incorrecta).
        # AccessDenied en GetObject → boto3 intenta s3:ListBucket para mejorar el
        # mensaje de error cuando el objeto no existe, pero la Lambda no tiene ese
        # permiso; el efecto práctico es el mismo: el archivo todavía no está listo.
        if code in ("NoSuchKey", "AccessDenied"):
            return _err(404, (
                f"El archivo '{s3_key}' no existe o aún se está procesando. "
                "Intente nuevamente en unos minutos."
            ))
        return _err(500, str(e))
    except Exception as e:
        print(f"Error en reconcile: {e}")
        return _err(500, str(e))


def _ok(body: dict) -> dict:
    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps(body, ensure_ascii=False),
    }


def _err(status: int, msg: str) -> dict:
    return {
        "statusCode": status,
        "headers": CORS,
        "body": json.dumps({"error": msg}),
    }
