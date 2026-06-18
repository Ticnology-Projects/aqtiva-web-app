"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { uploadAndMatchInvoice } from "@/lib/api";
import { useSession } from "next-auth/react";

interface InvoiceUploaderProps {
  // onUploadSuccess ahora recibe la lista de resultados para que el dashboard los dibuje
  onUploadSuccess: (resultados: any[]) => void; 
}

export function InvoiceUploader({ onUploadSuccess }: InvoiceUploaderProps) {
  const { data: session } = useSession();
  
  // Estados de empresa
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");
  const [isLoadingEmpresas, setIsLoadingEmpresas] = useState(true);

  // Estados de archivos
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [fileStatus, setFileStatus] = useState<Record<string, string>>({});
  
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar empresas al inicio
  useEffect(() => {
    if (!session?.user?.email) return;
    fetch(`/api/empresas?usuarioId=${encodeURIComponent(session.user.email)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setEmpresas(data.data);
      })
      .catch(err => console.error(err))
      .finally(() => setIsLoadingEmpresas(false));
  }, [session]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (selectedEmpresa) setIsDragOver(true);
  }, [selectedEmpresa]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!selectedEmpresa) {
      alert("Selecciona primero la empresa cobradora.");
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, [selectedEmpresa]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles(files.filter((_, index) => index !== indexToRemove));
  };

  const handleUploadAll = async () => {
    if (files.length === 0 || !selectedEmpresa) return;
    
    setIsUploading(true);
    setCurrentFileIndex(0);
    
    let successCount = 0;
    let autoConciliados = 0; // 🚨 NUEVO: Contador de auto-conciliados
    const resultadosBatch: any[] = [];

    // Procesamos secuencialmente
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFileIndex(i + 1);
      
      try {
        const result = await uploadAndMatchInvoice(file, selectedEmpresa, (progressMessage) => {
          setFileStatus((prev) => ({ ...prev, [file.name]: progressMessage }));
        });
        
        const conciliacion = result.data?.conciliacion;
        
        // 🚀 MAGIA STP: Auto-conciliación si hay alta certeza
        if (conciliacion?.nivel_confianza === "ALTO" && conciliacion?.factura_sugerida) {
          setFileStatus((prev) => ({ ...prev, [file.name]: "🤖 Match ALTO: Auto-conciliando..." }));
          
          // Reconstruimos las llaves exactas que DynamoDB espera
          const s3KeyOriginal = result.data.s3_key || "";
          const baseName = s3KeyOriginal.split('/').pop()?.replace('.json', '') || file.name;
          const processedS3Key = `processed/${baseName}.json`;
          const voucherPK = `VOUCHER#${baseName}`;

          // Disparamos la misma API que usa el humano en el Triaje
          const autoRes = await fetch("/api/facturas/resolver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              factura_pk: conciliacion.factura_sugerida.PK, 
              numero_documento: conciliacion.factura_sugerida.numero_documento, 
              s3_key_voucher: processedS3Key, 
              PK_Voucher: voucherPK,
              es_automatico: true
            })
          });

          const autoData = await autoRes.json();
          if (autoData.success) {
             setFileStatus((prev) => ({ ...prev, [file.name]: "✅ Procesado y Auto-conciliado" }));
             autoConciliados++;
          } else {
             setFileStatus((prev) => ({ ...prev, [file.name]: "⚠️ Procesado, pero falló la auto-conciliación" }));
          }
        } else {
          // Si es Medio, Bajo o Sin Match, se queda solo procesado para revisión manual
          setFileStatus((prev) => ({ ...prev, [file.name]: "✅ Procesado (Enviado a Triaje)" }));
        }

        resultadosBatch.push({ fileName: file.name, ...result.data });
        successCount++;
        
      } catch (error: any) {
        setFileStatus((prev) => ({ ...prev, [file.name]: `❌ Error: ${error.message}` }));
      }
    }

    setIsUploading(false);
    
    setTimeout(() => {
      // 🚨 NUEVO: Alerta detallada
      alert(`Lote finalizado: ${successCount} comprobantes analizados.\n🤖 ${autoConciliados} se auto-conciliaron y ${successCount - autoConciliados} pasaron a Triaje.`);
      setFiles([]);
      setFileStatus({});
      onUploadSuccess(resultadosBatch); 
    }, 1500);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-bold text-gray-800">Analizar Vouchers</h2>
        <p className="text-sm text-gray-500">Arrastra comprobantes (PDF, JPG, PNG)</p>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        {/* SELECTOR DE EMPRESA */}
        <div className="flex flex-col space-y-2 mb-6">
          <label className="text-sm font-bold text-gray-700">Empresa (A la que le pagaron) <span className="text-indigo-500">*</span></label>
          <select 
            value={selectedEmpresa}
            onChange={(e) => setSelectedEmpresa(e.target.value)}
            disabled={isUploading}
            className="border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-gray-700"
          >
            <option value="">-- Selecciona una empresa --</option>
            {empresas.map((emp, idx) => (
              <option key={idx} value={emp.ruc}>{emp.nombreOriginal} (RUC: {emp.ruc})</option>
            ))}
          </select>
        </div>

        {/* Zona Dropzone */}
        {!isUploading && (
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              if(!selectedEmpresa) alert("Selecciona una empresa primero.");
              else fileInputRef.current?.click();
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
              !selectedEmpresa ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60" :
              isDragOver ? "border-indigo-500 bg-indigo-50 cursor-pointer" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg" disabled={!selectedEmpresa} />
            <div className={`mx-auto w-12 h-12 mb-3 ${selectedEmpresa ? "text-indigo-400" : "text-gray-300"}`}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
            <p className="text-gray-600 font-medium">Arrastra tus archivos aquí</p>
          </div>
        )}

        {/* Lista de archivos en cola */}
        {files.length > 0 && (
          <div className="mt-4 flex-1 overflow-y-auto max-h-[180px] pr-2 custom-scrollbar">
            <ul className="space-y-2">
              {files.map((file, index) => (
                <li key={index} className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium truncate pr-4">📄 {file.name}</span>
                    {!isUploading && (
                      <button onClick={() => removeFile(index)} className="text-red-400 hover:text-red-600">✕</button>
                    )}
                  </div>
                  {(isUploading && fileStatus[file.name]) && (
                    <div className="mt-2 text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{fileStatus[file.name]}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer de Acción */}
      <div className="p-6 bg-gray-50 border-t border-gray-200 mt-auto">
        {isUploading ? (
           <div className="space-y-2">
             <div className="flex justify-between text-xs font-bold text-gray-700">
               <span>Analizando lote...</span>
               <span>{currentFileIndex} / {files.length}</span>
             </div>
             <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${(currentFileIndex / files.length) * 100}%` }}></div></div>
           </div>
        ) : (
          <button
            onClick={handleUploadAll}
            disabled={files.length === 0 || !selectedEmpresa}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Iniciar Conciliación de {files.length || ""} Vouchers
          </button>
        )}
      </div>
    </div>
  );
}