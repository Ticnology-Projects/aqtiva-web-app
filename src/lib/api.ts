const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export async function uploadAndMatchInvoice(file: File, onProgress: (msg: string) => void) {
  try {
    // Paso 1: Obtener la URL firmada para subir a S3
    onProgress("Generando URL de subida segura...");
    const urlResponse = await fetch(`${API_BASE_URL}/generate-upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });

    if (!urlResponse.ok) throw new Error("Error al generar la URL de subida.");
    
    // Extraemos el 'output_key' exacto que retorna tu backend
    const { upload_url, output_key } = await urlResponse.json(); 

    // Paso 2: Subir el archivo binario directamente a S3
    onProgress("Subiendo archivo a almacenamiento S3...");
    const uploadResult = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!uploadResult.ok) throw new Error("Error al subir el archivo binario a S3.");

    // Paso 3: Espera inicial + Polling inteligente
    onProgress("Extrayendo texto del documento...");
    
    // ⏳ OPTIMIZACIÓN: Esperamos 6 segundos fijos antes de hacer la primera pregunta
    await sleep(6000); 

    let matchResult = null;
    const maxRetries = 10; 
    const delayMs = 3000;  

    for (let i = 0; i < maxRetries; i++) {
      
      // ----------------------------------------------------------------------
      // PASO A: Intentar leer y autocompletar el RUC desde Next.js
      // ----------------------------------------------------------------------
      const enrichResponse = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key: output_key }), 
      });

      // Si Next.js devuelve 404, significa que el OCR (Textract) en Python todavía no termina.
      if (enrichResponse.status === 404) {
        onProgress(`Aún extrayendo datos OCR... (Reintento ${i + 1}/${maxRetries})`);
        await sleep(delayMs); 
        continue; // Volvemos a iniciar el ciclo
      }

      if (!enrichResponse.ok) {
        throw new Error("Error interno al intentar enriquecer el documento.");
      }

      // ----------------------------------------------------------------------
      // PASO B: El OCR terminó y se inyectó el RUC. Ahora llamamos a la IA.
      // ----------------------------------------------------------------------
      onProgress("Realizando conciliación con Inteligencia Artificial...");
      const matchResponse = await fetch(`${API_BASE_URL}/match-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key: output_key }), 
      });

      if (matchResponse.ok) {
        matchResult = await matchResponse.json();
        break; // ¡Éxito! Salimos del bucle
      }

      // Si hay un error real (500), rompemos el ciclo
      const errData = await matchResponse.json().catch(() => ({}));
      throw new Error(errData.error || "Error crítico durante la fase de match.");
    }

    if (!matchResult) {
      throw new Error("El procesamiento tardó demasiado. Por favor, actualiza la tabla en un minuto.");
    }
    
    return { success: true, data: matchResult };

  } catch (error: any) {
    console.error("Fallo en el flujo de carga:", error);
    throw new Error(error.message || "Fallo inesperado en el proceso.");
  }
}