"use client";

import { useState, useRef } from "react";
import { uploadAndMatchInvoice } from "@/lib/api";

interface InvoiceUploaderProps {
  onUploadSuccess: () => void;
}

export function InvoiceUploader({ onUploadSuccess }: InvoiceUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  
  // Nuevos estados para retener el archivo antes de subirlo
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [customFilename, setCustomFilename] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const captureFile = (file: File) => {
    const allowedExtensions = /(\.pdf|\.jpg|\.jpeg|\.png)$/i;
    if (!allowedExtensions.exec(file.name)) {
      alert("Por favor, sube un archivo válido (PDF o Imagen JPG/PNG).");
      return;
    }

    setPendingFile(file);
    // ✅ CORREGIDO: Quitamos el .toLowerCase()
    const safeName = file.name.replace(/\s+/g, '-'); 
    setCustomFilename(safeName);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      captureFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      captureFile(e.target.files[0]);
    }
  };

  const handleFilenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Forzar minúsculas y reemplazar espacios por guiones en tiempo real
    const value = e.target.value.toLowerCase().replace(/\s+/g, '-');
    setCustomFilename(value);
  };

  const confirmUpload = async () => {
    if (!pendingFile || !customFilename.trim()) return;

    setLoading(true);
    setStatusMessage("Iniciando proceso...");
    try {
      // Magia: Creamos una copia exacta del archivo pero con el nuevo nombre seguro
      const renamedFile = new File([pendingFile], customFilename, {
        type: pendingFile.type,
      });

      await uploadAndMatchInvoice(renamedFile, (msg) => setStatusMessage(msg));
      alert("¡Documento procesado y conciliado con éxito!");
      
      // Limpiamos el estado y recargamos la tabla
      setPendingFile(null);
      setCustomFilename("");
      onUploadSuccess(); 
    } catch (error: any) {
      alert(`Error en el proceso: ${error.message}`);
    } finally {
      setLoading(false);
      setStatusMessage("");
    }
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setCustomFilename("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-8">
      <h3 className="text-lg font-bold text-gray-800 mb-2">Cargar Nuevo Comprobante</h3>
      
      {/* FLUJO 1: SELECCIONAR ARCHIVO */}
      {!pendingFile && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            Sube el voucher de transferencia o constancia para ejecutar la auditoría automática.
          </p>
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer ${
              isDragActive ? "border-indigo-500 bg-indigo-50/50" : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
            />
            <div className="text-center">
              <span className="text-4xl mb-3 block">📥</span>
              <p className="text-sm font-medium text-gray-700">
                Arrastra y suelta tu archivo aquí, o <span className="text-indigo-600 underline">búscalo en tu equipo</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">Soporta PDF, JPG, JPEG y PNG</p>
            </div>
          </div>
        </>
      )}

      {/* FLUJO 2: CONFIRMAR NOMBRE (Paso Intermedio) */}
      {pendingFile && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
          {/* Alerta de advertencia para el usuario */}
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 mb-5 rounded shadow-sm text-sm">
            <strong>⚠️ Importante para el análisis:</strong> Asegúrate de incluir el identificador exacto de la factura (ej: <b>f001-120</b>) dentro del nombre del archivo. Esto ayuda a la IA a cruzar los datos correctamente con tu catálogo.
          </div>

          <div className="flex flex-col space-y-4">
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-1">
                Nombre del archivo (sólo minúsculas y sin espacios)
              </label>
              <input
                type="text"
                value={customFilename}
                onChange={handleFilenameChange}
                disabled={loading}
                className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm disabled:opacity-50"
              />
            </div>

            {loading ? (
              <div className="flex items-center space-x-3 bg-white p-3 rounded-lg border">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                <p className="text-sm font-semibold text-indigo-700 animate-pulse">{statusMessage}</p>
              </div>
            ) : (
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={cancelUpload}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmUpload}
                  className="px-4 py-2 bg-indigo-600 rounded-lg text-white hover:bg-indigo-700 transition-colors font-medium text-sm shadow-sm flex items-center gap-2"
                >
                  <span>🚀</span> Iniciar Subida y Auditoría
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}