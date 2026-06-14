const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// NUEVO: Agregamos el parámetro empresaRuc
export async function uploadAndMatchInvoice(file: File, empresaRuc: string, onProgress: (msg: string) => void) {
  try {
    // Paso 1: Obtener la URL firmada para subir a S3
    onProgress("Generando URL de subida segura...");
    const urlResponse = await fetch(`${API_BASE_URL}/generate-upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });

    if (!urlResponse.ok) throw new Error("Error al generar la URL de subida.");
    
    const { upload_url, output_key } = await urlResponse.json(); 

    // Paso 2: Subir el archivo binario a S3
    onProgress("Subiendo archivo a almacenamiento S3...");
    const uploadResult = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!uploadResult.ok) throw new Error("Error al subir el archivo binario a S3.");

    // Paso 3: Polling al Motor de Match
    onProgress("Analizando documento con IA (esto tomará unos 10 segundos)...");
    
    await sleep(6000); 

    let matchResult = null;
    const maxRetries = 10; 
    const delayMs = 3000;  

    for (let i = 0; i < maxRetries; i++) {
      const matchResponse = await fetch(`${API_BASE_URL}/match-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          s3_key: output_key,
          empresa_emisora_ruc: empresaRuc // CRÍTICO: La llave Multi-tenant
        }), 
      });

      if (matchResponse.ok) {
        matchResult = await matchResponse.json();
        break; // ¡Éxito!
      }

      if (matchResponse.status === 404) {
        onProgress(`Aún extrayendo datos... (Reintento ${i + 1}/${maxRetries})`);
        await sleep(delayMs); 
        continue;
      }

      const errData = await matchResponse.json().catch(() => ({}));
      throw new Error(errData.error || "Error crítico durante la fase de match.");
    }

    if (!matchResult) {
      throw new Error("El procesamiento tardó demasiado.");
    }
    
    return { success: true, data: matchResult };

  } catch (error: any) {
    console.error("Fallo en el flujo de carga:", error);
    throw new Error(error.message || "Fallo inesperado en el proceso.");
  }
}