"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, File as FileIcon, CheckCircle, AlertCircle } from "lucide-react";
import { uploadAndMatchInvoice } from "@/lib/api";
import { useSession } from "next-auth/react";

interface UploadedFile {
  file: File;
  id: string;
  status: "idle" | "uploading" | "success" | "error" | "resolved";
  progress: number;
  matchResult?: any;
  message?: string;
  companyRuc?: string;
}

export default function InvoiceUploader() {
  const { data: session } = useSession();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [empresas, setEmpresas] = useState<any[]>([]);
  const [selectedCompanyRuc, setSelectedCompanyRuc] = useState<string>("");

  const tenantId = (session?.user as any)?.tenantId || session?.user?.email;

  useEffect(() => {
    if (!tenantId) return;

    fetch(`/api/empresas?tenantId=${encodeURIComponent(tenantId)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.length > 0) {
          setEmpresas(data.data);
          setSelectedCompanyRuc(data.data[0].ruc);
        }
      })
      .catch(err => console.error("Error cargando empresas:", err));
  }, [tenantId]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const processFiles = (newFiles: FileList | File[]) => {
    if (!selectedCompanyRuc) {
      alert("Por favor, selecciona una empresa recaudadora antes de subir archivos.");
      return;
    }

    const validFiles = Array.from(newFiles).filter(
      (file) => file.type.startsWith("image/") || file.type === "application/pdf"
    );

    if (validFiles.length !== newFiles.length) {
      alert("Solo se admiten imágenes (JPG, PNG) y PDFs.");
    }

    const fileObjects: UploadedFile[] = validFiles.map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
      status: "idle",
      progress: 0,
      companyRuc: selectedCompanyRuc
    }));

    setFiles((prev) => [...prev, ...fileObjects]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadFiles = async () => {
    setIsProcessing(true);
    const filesToUpload = files.filter((f) => f.status === "idle" || f.status === "error");

    for (const fileObj of filesToUpload) {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileObj.id ? { ...f, status: "uploading", progress: 10, message: "Iniciando..." } : f))
      );

      try {
        const result = await uploadAndMatchInvoice(
          fileObj.file,
          fileObj.companyRuc!,
          (msg: string) => {
            setFiles((prev) =>
              prev.map((f) => (f.id === fileObj.id ? { ...f, message: msg, progress: f.progress < 90 ? f.progress + 15 : 90 } : f))
            );
          }
        );

        const confianza = result.data?.conciliacion?.nivel_confianza;
        const facturas = result.data?.conciliacion?.facturas_sugeridas || [];

        // 🚨 BLOQUE DE AUTOCONCILIACIÓN CORREGIDO
        if (confianza === "ALTO" && facturas.length > 0) {

          // 1. Extraemos el nombre exacto con el que el backend guardó el Voucher en DynamoDB
          const s3KeyRecibido = result.data?.s3_key || "";
          const baseName = s3KeyRecibido.split('/').pop()?.replace('.json', '') || fileObj.file.name;

          // 2. Mapeo universal y seguro de facturas (Sirve para Lotes y para Individuales)
          const facturasAProcesar = facturas.map((f: any) => ({
            PK: f.PK,
            numero_documento: f.numero_documento
          }));

          const resAutocierre = await fetch("/api/facturas/resolver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              es_automatico: true,
              PK_Voucher: `VOUCHER#${baseName}`, // Ahora apunta al ID correcto
              s3_key_voucher: `processed/${baseName}.json`,
              facturas: facturasAProcesar
            })
          });

          if (resAutocierre.ok) {
            setFiles((prev) =>
              prev.map((f) => (f.id === fileObj.id ? { ...f, status: "resolved", progress: 100, message: "¡Match Perfecto! Autocerrado." } : f))
            );
            continue; // Pasamos al siguiente archivo sin marcarlo como "success" manual
          } else {
            const errorData = await resAutocierre.json();
            console.error(`Fallo silencioso en autocierre para ${baseName}:`, errorData);
            // Si falla el autocierre, la ejecución continúa y el voucher cae en la bandeja manual de Triaje (success)
          }
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? { ...f, status: "success", progress: 100, matchResult: result.data, message: "Enviado a Triaje." }
              : f
          )
        );
      } catch (error: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? { ...f, status: "error", progress: 0, message: error.message || "Error al procesar" }
              : f
          )
        );
      }
    }
    setIsProcessing(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Cargar Vouchers</h2>
          <p className="text-sm text-gray-500">Arrastra aqui los vouchers a conciliar</p>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col space-y-6">

        {/* SELECTOR DE EMPRESA */}
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-bold text-gray-700">Cuenta Recaudadora <span className="text-red-500">*</span></label>
          <select
            value={selectedCompanyRuc}
            onChange={(e) => setSelectedCompanyRuc(e.target.value)}
            className="border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none font-medium text-gray-700 bg-white"
          >
            {empresas.length === 0 ? (
              <option value="">Cargando empresas...</option>
            ) : (
              empresas.map((emp) => (
                <option key={emp.ruc} value={emp.ruc}>
                  {emp.nombreOriginal} (RUC: {emp.ruc})
                </option>
              ))
            )}
          </select>
        </div>

        {/* ZONA DRAG & DROP */}
        <div className="flex-1 flex flex-col">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 ${
              isDragging ? "border-green-500 bg-green-50 cursor-pointer" : "border-gray-300 hover:border-green-400 hover:bg-green-50 cursor-pointer"
            }`}
          >
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,application/pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileInput}
            />
            <div className="mx-auto w-12 h-12 mb-3 text-green-500">
              <Upload className="w-full h-full" strokeWidth={1.5} />
            </div>
            <span className="text-gray-700 font-medium">Subir Comprobantes Bancarios</span>
            <span className="text-xs text-gray-400 mt-1">Arrastra tus archivos aquí o haz clic para buscar</span>
            <span className="text-[10px] text-gray-400 mt-1">JPG, PNG o PDF hasta 5MB</span>
          </div>

          {files.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-gray-900">Cola de Procesamiento ({files.length})</h4>
                <button
                  onClick={uploadFiles}
                  disabled={isProcessing || !files.some((f) => f.status === "idle" || f.status === "error")}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isProcessing ? "Procesando..." : "Iniciar Carga Masiva"}
                </button>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {files.map((fileObj) => (
                  <div key={fileObj.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 bg-white rounded shadow-sm border border-gray-100 flex items-center justify-center flex-shrink-0">
                        <FileIcon className="w-4 h-4 text-green-500" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-gray-900 truncate">{fileObj.file.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-gray-500">{(fileObj.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          {fileObj.message && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                              <p className={`text-[10px] font-medium truncate max-w-[200px] ${fileObj.status === 'error' ? 'text-red-500' :
                                  fileObj.status === 'resolved' ? 'text-green-600' :
                                    fileObj.status === 'success' ? 'text-amber-600' : 'text-green-600'
                                }`}>
                                {fileObj.message}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {fileObj.status === "uploading" && (
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-green-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${fileObj.progress}%` }}></div>
                        </div>
                      )}

                      {fileObj.status === "resolved" && <CheckCircle className="w-5 h-5 text-green-500" />}
                      {fileObj.status === "success" && <div className="w-5 h-5 rounded-full border-2 border-amber-500 flex items-center justify-center"><span className="w-1 h-1 bg-amber-500 rounded-full"></span></div>}
                      {fileObj.status === "error" && <AlertCircle className="w-5 h-5 text-red-500" />}

                      {fileObj.status === "idle" && (
                        <button onClick={() => removeFile(fileObj.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
