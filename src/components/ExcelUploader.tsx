"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { useSession } from "next-auth/react";

export function ExcelUploader() {
  const { data: session } = useSession();

  const [empresas, setEmpresas] = useState<any[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");
  const [isLoadingEmpresas, setIsLoadingEmpresas] = useState(true);

  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Estados para Drag & Drop
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Cargar las empresas del usuario al inicio
  useEffect(() => {
    fetch("/api/empresas")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Si el backend ya filtra por usuario, tomamos la data
          setEmpresas(data.data);
        }
      })
      .catch(err => console.error("Error cargando empresas:", err))
      .finally(() => setIsLoadingEmpresas(false));
  }, []);

  // Manejo de Drag & Drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!selectedEmpresa) return; // No permitir drop si no hay empresa seleccionada
    setIsDragOver(true);
  }, [selectedEmpresa]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!selectedEmpresa) {
      setMessage({ text: "Primero debes seleccionar la empresa que emite estas facturas.", type: "error" });
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  }, [selectedEmpresa]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFile(e.target.files[0]);
      e.target.value = ''; // Limpiar input
    }
  };

  // Función principal de procesamiento
  // Función principal de procesamiento
  const processFile = async (file: File) => {
    setIsUploading(true);
    setMessage(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", raw: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        defval: "", 
        raw: false 
      });

      if (jsonData.length === 0) throw new Error("El archivo está vacío o no es válido.");

      const empresaData = empresas.find(e => e.ruc === selectedEmpresa);

      const res = await fetch("/api/facturas/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          rows: jsonData,
          fuenteOriginal: file.name,
          empresaEmisoraRuc: selectedEmpresa,
          empresaEmisoraNombre: empresaData?.nombreOriginal || "Desconocida",
          usuarioId: session?.user?.email || "anonimo"
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Error al importar.");

      setMessage({ text: result.message, type: "success" });
    } catch (error: any) {
      setMessage({ text: error.message, type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Cargar Facturas Pendientes</h2>
          <p className="text-sm text-gray-500">Selecciona tu empresa y sube el archivo (CSV/Excel)</p>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col space-y-6">

        {/* SELECTOR DE EMPRESA */}
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-bold text-gray-700">Empresa que factura (Cobrador) <span className="text-red-500">*</span></label>
          {isLoadingEmpresas ? (
            <div className="animate-pulse bg-gray-200 h-10 rounded-lg"></div>
          ) : (
            <select
              value={selectedEmpresa}
              onChange={(e) => {
                setSelectedEmpresa(e.target.value);
                setMessage(null);
              }}
              className="border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none font-medium text-gray-700 bg-white"
            >
              <option value="">-- Selecciona una empresa --</option>
              {empresas.map((emp, idx) => (
                <option key={idx} value={emp.ruc}>
                  {emp.nombreOriginal} (RUC: {emp.ruc})
                </option>
              ))}
            </select>
          )}
          {empresas.length === 0 && !isLoadingEmpresas && (
            <p className="text-xs text-amber-600">No tienes empresas creadas. Ve al "Directorio RUCs" para registrar tu primera empresa.</p>
          )}
        </div>

        {/* ZONA DRAG & DROP */}
        {isUploading ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto"></div>
            <p className="text-gray-600 font-medium">Leyendo celdas y guardando en base de datos...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                if (!selectedEmpresa) setMessage({ text: "Por favor, selecciona una empresa primero.", type: "error" });
                else fileInputRef.current?.click();
              }}
              className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 ${!selectedEmpresa ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60" :
                  isDragOver ? "border-green-500 bg-green-50 cursor-pointer" : "border-gray-300 hover:border-green-400 hover:bg-green-50 cursor-pointer"
                }`}
            >
              <input type="file" className="hidden" accept=".xlsx, .xls, .csv" ref={fileInputRef} onChange={handleFileChange} disabled={!selectedEmpresa} />
              <div className={`mx-auto w-12 h-12 mb-3 ${selectedEmpresa ? "text-green-500" : "text-gray-400"}`}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
              </div>
              <span className="text-gray-700 font-medium">Haz clic o arrastra tu Excel aquí</span>
              <span className="text-xs text-gray-400 mt-1">.csv, .xlsx</span>
            </div>

            {message && (
              <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {message.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}