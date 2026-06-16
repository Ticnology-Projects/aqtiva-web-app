import json
import boto3
import time
import os
from collections import defaultdict
from urllib.parse import unquote_plus


CLAUDE_MODEL_ID = os.environ.get(
    "CLAUDE_MODEL_ID",
    ""
)

REGION = os.environ.get("AWS_REGION", "us-east-1")
DEBUG = "true" 

MAX_RETRIES = 3
RETRY_DELAY = 1 
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".gif"}

textract = boto3.client("textract", region_name=REGION)
bedrock  = boto3.client("bedrock-runtime", region_name=REGION)
s3       = boto3.client("s3", region_name=REGION)


def get_s3_records(event: dict):
    """
    Soporta:
    - Evento S3 automático
    - Invocación manual
    """
    records = []

    # Evento S3
    if "Records" in event:
        for r in event["Records"]:
            bucket = r["s3"]["bucket"]["name"]
            key = unquote_plus(r["s3"]["object"]["key"])
            records.append((bucket, key))

    # Invocación manual
    elif "bucket" in event and "key" in event:
        records.append((event["bucket"], event["key"]))

    return records

def build_prompt(page_num: int, page_text: str) -> str:
    return f"""
Eres un analista experto en auditoría contable y conciliación de cuentas por cobrar en Perú.
Tu única tarea es extraer información estructurada del texto OCR de comprobantes de pago o vouchers de transferencia bancaria.

<texto_ocr>
Página {page_num}:
{page_text}
</texto_ocr>

<instrucciones>
Analiza el texto OCR y clasifica conceptualmente los actores según el tipo de documento:

1. DEFINICIÓN CRUCIAL DE ACTORES (Depende del tipo de documento):
   - Si es una FACTURA, BOLETA o RECIBO POR HONORARIOS:
     * EMISOR: Es la empresa que emite el documento (quien vende/cobra).
     * RECEPTOR: Es el cliente (campo "Cliente", "Señor(es)", "Adquiriente") a quien se le cobra.
   - Si es un VOUCHER DE PAGO, CONSTANCIA DE TRANSFERENCIA o CAPTURA DE BANCA MÓVIL (Ej: BCP, Telecrédito, etc.):
     * EMISOR: Es la entidad/persona que realiza el pago (Origen del dinero). Busca etiquetas como "Desde", "Cuenta de origen", "Empresa ordenante", "Ordenante", "Transferente" o el nombre que aparece dentro del campo "Mensaje".
     * RECEPTOR: Es la entidad/persona que recibe el dinero (Destino del dinero). Busca etiquetas como "Enviado a", "Beneficiario", "Cuenta de destino", "Destinatario".

2. REGLA DE ORO PARA EL CAMPO "MENSAJE" O "REFERENCIA" EN VOUCHERS:
   - Inspecciona minuciosamente los campos libres como "Mensaje", "Referencia" o "Motivo".
   - Si en el campo "Mensaje" encuentras una razón social acompañada de un código de factura (ej: "Dean Valdivia Inversiones SAC F001 156"), debes asumir que el EMISOR real del pago es esa empresa ("Dean Valdivia Inversiones SAC") y que el 'numero_documento' es "F001-156" (añade el guion si falta).

Extrae los siguientes datos manteniendo estricta fidelidad al texto:

EMISOR:
- nombre: Razón social o nombre completo obtenido según las reglas del punto 1 y 2. (Ej: "ENFOQUE VISUAL INVERSIONES S.A.C" o "Dean Valdivia Inversiones SAC"). Ignorar nombres de tipos de cuenta como "Ahorro Soles" o "Cuenta Corriente".
- ruc: Identificador tributario (11 dígitos en Perú). null si no aparece.
- direccion: Dirección fiscal.

RECEPTOR:
- nombre: Razón social o nombre completo del destino/beneficiario del cobro (Ej: "Gaa Solutions S.", "GAA SOLUTIONS SAC").
- ruc: Identificador tributario (11 dígitos). null si no aparece.
- direccion: Dirección fiscal.

DOCUMENTO:
- tipo_documento: "Factura" | "Boleta" | "Recibo por Honorarios" | "Voucher de pago" (usa este último para constancias de transferencia bancaria o Telecrédito).
- numero_documento: Número del comprobante (ej: F001-156, F001-153). Si estás en un voucher, búscalo obligatoriamente en los campos "Mensaje", "Referencia" o "Descripción". Formatea siempre con guion (ej: F001 156 -> F001-156).
- numero_operacion: Código numérico de la transacción bancaria (ej: "01404503", "00065120"). Solo aplica a vouchers.
- fecha_emision: Fecha en que se realizó la operación o emitió el documento (DD/MM/AAAA).
- fecha_pago: Fecha de vencimiento. Si es un voucher, puede ser igual a la fecha de emisión.
- moneda: PEN (si dice S/, Soles o Sol), USD (si dice $, Dólares o Dólar).
- forma_pago: Contado / Crédito / Transferencia.

ESTADO DE COBRO:
- Si es un voucher, constancia de transferencia exitosa o dice "PAGADO"/"CANCELADO" -> El estado es "COBRADO".
- estado: "PENDIENTE" | "COBRADO".

MONTOS:
- importe_total: El monto total de la operación (ej: 177.00, 236.00). Debe ser un número plano.
- monto_pendiente: Si el estado es COBRADO, este valor es 0.

ITEMS:
- Si es un voucher, crea un único item con nombre_item: "Transferencia bancaria recibida", cantidad: 1, costo_total: igual al importe_total.

TOTALES ADICIONALES / HONORARIOS / DETRACCIÓN:
- Colocar null o valores correspondientes según aplique.
</instrucciones>

<formato_salida>
Devuelve ÚNICAMENTE un JSON estructurado con la siguiente forma, sin textos de introducción o bloques de código markdown extraños (no uses ```json):
{{
    "pagina": {page_num},
    "estado_documento": "VALIDO",
    "emisor": {{
        "nombre": {{"valor": string|null, "valido": boolean}},
        "ruc": {{"valor": string|null, "valido": boolean}},
        "direccion": {{"valor": string|null, "valido": boolean}}
    }},
    "receptor": {{
        "nombre": {{"valor": string|null, "valido": boolean}},
        "ruc": {{"valor": string|null, "valido": boolean}},
        "direccion": {{"valor": string|null, "valido": boolean}}
    }},
    "tipo_documento": {{"valor": string|null, "valido": boolean}},
    "numero_documento": {{"valor": string|null, "valido": boolean}},
    "numero_operacion": {{"valor": string|null, "valido": boolean}},
    "fecha_emision": {{"valor": string|null, "valido": boolean}},
    "fecha_pago": {{"valor": string|null, "valido": boolean}},
    "moneda": {{"valor": string|null, "valido": boolean}},
    "forma_pago": {{"valor": string|null, "valido": boolean}},
    "estado": {{"valor": "PENDIENTE" | "COBRADO", "valido": boolean}},
    "importe_total": {{"valor": number|null, "valido": boolean}},
    "monto_pendiente": {{"valor": number|null, "valido": boolean}},
    "items": [
        {{
            "nombre_item": {{"valor": string|null, "valido": boolean}},
            "cantidad": {{"valor": number|null, "valido": boolean}},
            "unidad": {{"valor": string|null, "valido": boolean}},
            "valor_unitario": {{"valor": number|null, "valido": boolean}},
            "costo_total": {{"valor": number|null, "valido": boolean}}
        }}
    ],
    "totales": {{
        "subtotal": {{"valor": number|null, "valido": boolean}},
        "igv": {{"valor": number|null, "valido": boolean}},
        "isc": {{"valor": number|null, "valido": boolean}},
        "descuentos": {{"valor": number|null, "valido": boolean}},
        "otros_cargos": {{"valor": number|null, "valido": boolean}}
    }},
    "honorarios": {{
        "impuesto": {{"valor": number|null, "valido": boolean}},
        "tipo_impuesto": {{"valor": string|null, "valido": boolean}},
        "porcentaje_impuesto": {{"valor": number|null, "valido": boolean}},
        "total": {{"valor": number|null, "valido": boolean}},
        "total_neto_recibido": {{"valor": number|null, "valido": boolean}}
    }},
    "detraccion": {{
        "bien_o_servicio": {{"valor": string|null, "valido": boolean}},
        "medio_pago": {{"valor": string|null, "valido": boolean}},
        "nro_cta_banco_nacion": {{"valor": string|null, "valido": boolean}},
        "porcentaje": {{"valor": number|null, "valido": boolean}},
        "monto": {{"valor": number|null, "valido": boolean}}
    }},
    "observaciones": {{"valor": string|null, "valido": boolean}},
    "advertencias": []
}}
</formato_salida>
""".strip()

# ===============================
# TEXTRACT
# ===============================

def _is_image(key: str) -> bool:
    ext = os.path.splitext(key.lower())[1]
    return ext in IMAGE_EXTENSIONS

def ocr_image_sync(bucket: str, key: str) -> tuple[dict[int, str], list[str]]:
    """Extrae texto de imagen. Retorna (paginas, advertencias)"""
    advertencias = []
    try:
        response = textract.detect_document_text(
            Document={"S3Object": {"Bucket": bucket, "Name": key}}
        )
        lines = [b["Text"] for b in response.get("Blocks", []) if b["BlockType"] == "LINE"]
        
        if not lines:
            advertencias.append("OCR Imagen: No se detectó texto en la imagen")
        
        return ({1: "\n".join(lines)}, advertencias)
    except Exception as e:
        advertencias.append(f"ERROR OCR Imagen: {str(e)}")
        return ({}, advertencias)

def ocr_pdf_async(bucket: str, key: str) -> tuple[dict[int, str], list[str]]:
    """Extrae texto de PDF. Retorna (paginas, advertencias)"""
    advertencias = []
    try:
        start = textract.start_document_text_detection(
            DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
        )
        job_id = start["JobId"]

        while True:
            status = textract.get_document_text_detection(JobId=job_id)
            if status["JobStatus"] in ("SUCCEEDED", "FAILED", "PARTIAL_SUCCESS"):
                break
            time.sleep(3)

        if status["JobStatus"] == "FAILED":
            advertencias.append(f"ERROR Textract PDF: {status['JobStatus']}")
            return ({}, advertencias)

        if status["JobStatus"] == "PARTIAL_SUCCESS":
            advertencias.append("Textract PDF: resultado parcial, algunas páginas pueden faltar")

        blocks = []
        next_token = None
        while True:
            kwargs = {"JobId": job_id}
            if next_token:
                kwargs["NextToken"] = next_token
            response = textract.get_document_text_detection(**kwargs)
            blocks.extend(response.get("Blocks", []))
            next_token = response.get("NextToken")
            if not next_token:
                break

        page_lines = defaultdict(list)
        for block in blocks:
            if block["BlockType"] == "LINE":
                page_lines[block.get("Page", 1)].append(block["Text"])

        if not page_lines:
            advertencias.append("OCR PDF: No se detectó texto en ninguna página")

        return ({p: "\n".join(lines) for p, lines in page_lines.items()}, advertencias)
    except Exception as e:
        advertencias.append(f"ERROR Textract PDF: {str(e)}")
        return ({}, advertencias)

def extract_text_by_page(bucket: str, key: str) -> tuple[dict[int, str], list[str]]:
    """Extrae texto por tipo de archivo. Retorna (paginas_dict, advertencias)"""
    if _is_image(key):
        return ocr_image_sync(bucket, key)
    return ocr_pdf_async(bucket, key)

# ===============================
# LLM
# ===============================

def invoke_claude(prompt: str) -> str:
    """
    Invoca Claude con reintentos automáticos.
    
    """
    body = {
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        "max_tokens": 8192,
        "temperature": 0.1,
        "anthropic_version": "bedrock-2023-05-31"
    }

    for intento in range(1, MAX_RETRIES + 1):
        try:
            response = bedrock.invoke_model(
                modelId=CLAUDE_MODEL_ID,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json"
            )
            response_body = json.loads(response["body"].read())

            if DEBUG:
                usage = response_body.get("usage", {})
                input_tokens  = usage.get("input_tokens", "?")
                output_tokens = usage.get("output_tokens", "?")
                print(f"[DEBUG] Tokens usados — input: {input_tokens}, output: {output_tokens}, total: {(input_tokens or 0) + (output_tokens or 0)}")

            return response_body["content"][0]["text"]
        
        except Exception as e:
            if intento == MAX_RETRIES:
                raise RuntimeError(f"Bedrock falló después de {MAX_RETRIES} intentos: {str(e)}")
            
            tiempo_espera = RETRY_DELAY * (2 ** (intento - 1))
            print(f"Intento {intento}/{MAX_RETRIES} falló. Reintentando en {tiempo_espera}s...")
            time.sleep(tiempo_espera)

def parse_llm_output(raw: str) -> dict:
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except json.JSONDecodeError as e:
        return {"_parse_error": str(e), "_raw": raw[:500]}

# ===============================
# CONSOLIDACIÓN
# ===============================

def _primero_valido(pages_list: list, *keys) -> dict:
    """Retorna el primer valor válido de un campo anidado en una lista de páginas."""
    for page in pages_list:
        obj = page
        for key in keys:
            if not isinstance(obj, dict):
                obj = None
                break
            obj = obj.get(key, {})
        if isinstance(obj, dict) and obj.get("valido"):
            return obj
    return {"valor": None, "valido": False}

def _consolidar_objeto(pages_list: list, obj_key: str, campos: list) -> dict:
    """Consolida un objeto anidado tomando el primer valor válido por campo."""
    return {campo: _primero_valido(pages_list, obj_key, campo) for campo in campos}

def consolidar_paginas(resultados: dict[int, dict]) -> dict:
    advertencias = []
    items = []
    valid_pages = []

    for p, page in resultados.items():
        if "_parse_error" in page:
            advertencias.append(f"Página {p}: {page['_parse_error']}")
        else:
            valid_pages.append(page)

    emisor = _consolidar_objeto(valid_pages, "emisor", ["nombre", "ruc", "direccion"])
    receptor = _consolidar_objeto(valid_pages, "receptor", ["nombre", "ruc", "direccion"])

    campos_planos = [
        "tipo_documento", "numero_documento", "numero_operacion", "fecha_emision", "fecha_pago",
        "moneda", "forma_pago", "estado", "importe_total", "monto_pendiente", "observaciones"
    ]
    doc = {campo: _primero_valido(valid_pages, campo) for campo in campos_planos}

    campos_totales = ["subtotal", "igv", "isc", "descuentos", "otros_cargos"]
    totales = _consolidar_objeto(valid_pages, "totales", campos_totales)

    honorarios = _consolidar_objeto(valid_pages, "honorarios", ["impuesto", "tipo_impuesto", "porcentaje_impuesto", "total", "total_neto_recibido"])
    detraccion = _consolidar_objeto(valid_pages, "detraccion", ["bien_o_servicio", "medio_pago", "nro_cta_banco_nacion", "porcentaje", "monto"])

    for page in valid_pages:
        items.extend(page.get("items", []))

    for page in valid_pages:
        advertencias.extend(page.get("advertencias", []))

    return {
        "emisor": emisor,
        "receptor": receptor,
        **doc,
        "items": items,
        "totales": totales,
        "honorarios": honorarios,
        "detraccion": detraccion,
        "advertencias": advertencias
    }

# ===============================
# CORE PROCESAMIENTO
# ===============================

def guardar_resultado_s3(bucket: str, key: str, resultado: dict) -> str:
    """
    Guarda el resultado JSON en S3 en la carpeta output/.
    Retorna la key del archivo guardado.
    """
    # Obtener el nombre del archivo sin extensión
    nombre_archivo = os.path.splitext(os.path.basename(key))[0]
    output_key = f"output/{nombre_archivo}.json"
    
    try:
        s3.put_object(
            Bucket=bucket,
            Key=output_key,
            Body=json.dumps(resultado, ensure_ascii=False, indent=2),
            ContentType="application/json"
        )
        print(f"Resultado guardado en: s3://{bucket}/{output_key}")
        return output_key
    except Exception as e:
        print(f"Error al guardar en S3: {e}")
        raise

def procesar_documento(bucket: str, key: str) -> dict:
    """Procesa documento con manejo completo de errores"""
    print(f"[START] Procesando: s3://{bucket}/{key}")
    
    advertencias_globales = []
    resultados = {}
    consolidado = None
    estado = None

    try:
        # Paso 1: Extraer texto con Textract
        print("Extrayendo texto con Textract...")
        paginas, advertencias_textract = extract_text_by_page(bucket, key)
        advertencias_globales.extend(advertencias_textract)
        print(f"Textract OK — {len(paginas)} página(s) detectadas")
        if DEBUG:
            for num, texto in paginas.items():
                print(f"[DEBUG] Textract — Página {num}:\n{texto}")

        # Paso 2: Procesar cada página con LLM
        print(f"[Invocando Claude para {len(paginas)} página(s)...")
        for num, texto in paginas.items():
            if not texto.strip():
                advertencias_globales.append(f"Página {num}: Texto vacío después de OCR")
                continue
            try:
                print(f"[Página {num}/{len(paginas)}...")
                prompt = build_prompt(num, texto)
                raw = invoke_claude(prompt)
                resultados[num] = parse_llm_output(raw)
            except Exception as e:
                advertencias_globales.append(f"Página {num}: Error LLM: {str(e)}")
        print(f" Claude OK — {len(resultados)} página(s) procesadas")

        # Paso 3: Consolidar resultados
        print("[Consolidando resultados...")
        consolidado = consolidar_paginas(resultados)
        consolidado["advertencias"].extend(advertencias_globales)
        print(f"Consolidado OK — {len(resultados)} página(s)")

        if DEBUG:
            print(f"[DEBUG] Resultado consolidado:\n{json.dumps(consolidado, ensure_ascii=False, indent=2)}")

    except Exception as e:
        # Error crítico: crear respuesta mínima
        print(f"Error crítico procesando {key}: {str(e)}")
        advertencias_globales.append(f"ERROR CRÍTICO: {str(e)}")
        
        _v = {"valor": None, "valido": False}
        consolidado = {
            "emisor": {"nombre": _v, "ruc": _v, "direccion": _v},
            "receptor": {"nombre": _v, "ruc": _v, "direccion": _v},
            "tipo_documento": _v,
            "numero_documento": _v,
            "fecha_emision": _v,
            "fecha_pago": _v,
            "moneda": _v,
            "forma_pago": _v,
            "estado": _v,
            "importe_total": _v,
            "monto_pendiente": _v,
            "observaciones": _v,
            "items": [],
            "totales": {k: _v for k in ["subtotal", "igv", "isc", "descuentos", "otros_cargos"]},
            "honorarios": {k: _v for k in ["impuesto", "tipo_impuesto", "porcentaje_impuesto", "total", "total_neto_recibido"]},
            "detraccion": {k: _v for k in ["bien_o_servicio", "medio_pago", "nro_cta_banco_nacion", "porcentaje", "monto"]},
            "advertencias": advertencias_globales
        }

    resultado_final = {
        "archivo": key,
        "paginas_procesadas": len(resultados),
        "extraccion": consolidado,
    }
    
    # Siempre guardar resultado en S3
    try:
        output_key = guardar_resultado_s3(bucket, key, resultado_final)
        resultado_final["output_s3_key"] = output_key
    except Exception as e:
        print(f"Error guardando en S3: {e}")
        resultado_final["error_guardado"] = str(e)

    return resultado_final

# ===============================
# LAMBDA HANDLER
# ===============================

def lambda_handler(event, context):
    print(f"Evento recibido: {json.dumps(event)}")

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    }

    records = get_s3_records(event)

    if not records:
        return {
            "statusCode": 400,
            "headers": cors_headers,
            "body": json.dumps({"error": "No se encontraron archivos en el evento"})
        }

    resultados = []

    # Procesar TODOS los archivos, capturar errores individuales
    for bucket, key in records:
        try:
            resultado = procesar_documento(bucket, key)
            resultados.append(resultado)
        except Exception as e:
            # Si falla un archivo, agregar error pero continuar con los demás
            print(f"Error procesando {key}: {e}")
            resultados.append({
                "archivo": key,
                "paginas_procesadas": 0,
                "extraccion": {"advertencias": [f"ERROR FATAL: {str(e)}"]},
                "error": str(e)
            })

    return {
        "statusCode": 200,
        "headers": cors_headers,
        "body": json.dumps(resultados, ensure_ascii=False)
    }