"use client";

import { ExcelUploader } from "@/components/ExcelUploader";
import InvoiceUploader from "@/components/InvoiceUploader";

interface CargaMasivaProps {
  onGoToTriaje: () => void;
}

export default function CargaMasivaView({ onGoToTriaje }: CargaMasivaProps) {
  return (
    <div className="animate-fadeIn">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Centro de Importación</h1>
        <p className="text-gray-500 mt-1">Sube tu catálogo de facturas pendientes y los comprobantes a analizar.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
            Base de Datos (Facturas)
          </h2>
          <div className="flex-1 min-h-[500px]">
            <ExcelUploader />
          </div>
        </div>
        
        <div className="flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
            Documentos (Vouchers)
          </h2>
          <div className="flex-1 min-h-[500px]">
            {/* Al terminar de subir, ejecutamos la función que nos mandó el orquestador para cambiar de pestaña */}
            <InvoiceUploader/>
          </div>
        </div>
      </div>
    </div>
  );
}