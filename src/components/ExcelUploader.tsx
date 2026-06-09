"use client";

import * as XLSX from "xlsx";
import { useState, useRef } from "react";

export function ExcelUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Manejadores de Drag & Drop ---
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  // --- Manejador de Selección Tradicional ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    // Validar extensión (opcional pero recomendado)
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setStatusMessage({ type: 'error', text: 'Por favor, sube un archivo Excel válido (.xlsx, .csv)' });
      return;
    }
    
    setFile(selectedFile);
    setStatusMessage(null); // Limpiar mensajes anteriores
  };

  const clearFile = () => {
    setFile(null);
    setStatusMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  
  // --- Lógica de Procesamiento y Subida ---
  const processAndUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    setStatusMessage(null);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        
        const sheetName = "DIC-2025"; 
        const actualSheetName = workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[actualSheetName];
        
        // 1. Leemos toda la hoja como un arreglo 2D (matriz cruda)
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // 2. Buscamos automáticamente en qué fila están los verdaderos encabezados
        let headerRowIndex = -1;
        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i] as any[];
          // Si la fila contiene la columna "CLIENTE" o "Serie", ¡bingo!
          if (row.includes("CLIENTE") || row.includes("Serie") || row.includes("ESTADO")) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          throw new Error("No se encontraron los encabezados válidos (CLIENTE, Serie) en el Excel.");
        }

        // 3. Extraemos y limpiamos los nombres de los encabezados (quitamos saltos de línea)
        const headers = (rawData[headerRowIndex] as any[]).map((header, index) => 
          header ? String(header).replace(/[\r\n]+/g, " ").trim() : `COLUMNA_VACIA_${index}`
        );

        // 4. Mapeamos las verdaderas filas de datos usando nuestros encabezados limpios
        const jsonData = [];
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i] as any[];
          
          // Ignoramos filas completamente vacías
          if (row.length === 0 || row.every(cell => cell === undefined || cell === null || cell === "")) {
            continue;
          }

          const rowObj: any = {};
          headers.forEach((header, index) => {
            rowObj[header] = row[index];
          });
          jsonData.push(rowObj);
        }

        // 5. Enviamos la data limpia al Backend
        const res = await fetch("/api/process-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            rows: jsonData,
            fuenteOriginal: file.name
          }),
        });

        const result = await res.json();
        
        if (res.ok) {
          setStatusMessage({ type: 'success', text: result.message });
          setFile(null); 
        } else {
          throw new Error(result.error || "Error en el servidor");
        }
      } catch (error: any) {
        setStatusMessage({ type: 'error', text: error.message || "Error procesando el archivo Excel" });
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setStatusMessage({ type: 'error', text: "Error de lectura del archivo local" });
      setIsProcessing(false);
    };

    reader.readAsArrayBuffer(file);
  };
  

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800">Carga Masiva de Facturas</h2>
        <p className="text-sm text-gray-500">Sube tu Excel o CSV para convertirlo a Markdown en S3.</p>
      </div>

      {/* ZONA DE ARRASTRE */}
      {!file ? (
        <div 
          className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-colors ${
            isDragging ? "border-indigo-500 bg-indigo-50" : "border-gray-300 bg-gray-50 hover:bg-gray-100"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            accept=".xlsx, .xls, .csv" 
            onChange={handleFileSelect} 
            className="hidden"
          />
          <div className="bg-white p-3 rounded-full shadow-sm mb-3">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 text-center">
            Haz clic o arrastra tu archivo aquí
          </p>
          <p className="text-xs text-gray-400 mt-1">.XLSX, .CSV hasta 10MB</p>
        </div>
      ) : (
        /* ARCHIVO SELECCIONADO */
        <div className="flex-1 flex flex-col justify-center">
          <div className="border border-indigo-100 bg-indigo-50 rounded-lg p-4 flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3 overflow-hidden">
              <svg className="w-8 h-8 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              <div className="truncate">
                <p className="text-sm font-semibold text-gray-800 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button 
              onClick={clearFile}
              disabled={isProcessing}
              className="text-gray-400 hover:text-red-500 p-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <button
            onClick={processAndUpload}
            disabled={isProcessing}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando y Subiendo...
              </>
            ) : (
              "Iniciar Conversión a Markdown"
            )}
          </button>
        </div>
      )}

      {/* MENSAJES DE ESTADO */}
      {statusMessage && (
        <div className={`mt-4 p-3 rounded-lg text-sm font-medium text-center ${
          statusMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
        }`}>
          {statusMessage.text}
        </div>
      )}
    </div>
  );
}