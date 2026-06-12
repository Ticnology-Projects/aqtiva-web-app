"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;

  return (
    <nav className="bg-white border-b border-gray-200 px-8 py-4 mb-8 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-8">
        <h1 className="text-xl font-bold text-indigo-900">AQTIVA Workspace</h1>
        
        {/* ENLACES DE NAVEGACIÓN */}
        <div className="flex gap-2">
          <Link 
            href="/" 
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              pathname === "/" 
                ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
            }`}
          >
            📊 Conciliación
          </Link>
          <Link 
            href="/chat" 
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              pathname === "/chat" 
                ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
            }`}
          >
            🤖 Agente IA
          </Link>
          <Link 
            href="/empresas" 
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              pathname === "/chat" 
                ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
            }`}
          >
            🏢 Empresas
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-bold text-gray-800">{session.user?.name}</p>
          <p className="text-xs text-gray-500">{(session.user as any)?.rol} • {session.user?.email}</p>
        </div>
        <button 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors border border-transparent hover:border-red-100"
        >
          Cerrar Sesión
        </button>
      </div>
    </nav>
  );
}

//src/lib/api.ts
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
    await sleep(9000); 

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