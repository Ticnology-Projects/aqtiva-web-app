"use client";
import { useState } from "react";

export default function ResolucionModal({ voucher, onClose, onConfirm, isResolving }: any) {
  const [manualSelection, setManualSelection] = useState<any | null>(null);

  if (!voucher) return null;

  const parseCandidato = (contenido: string) => {
    const docMatch = contenido.match(/Documento:\s*(.+?)(?=\s*Cliente:|$)/);
    const clienteMatch = contenido.match(/Cliente:\s*(.+?)(?=\s*RUC Cliente:|$)/);
    const montoMatch = contenido.match(/Monto Total:\s*(.+?)(?=\s*Moneda:|$)/);
    return {
      numero_documento: docMatch ? docMatch[1].trim() : "Desconocido",
      cliente: clienteMatch ? clienteMatch[1].trim() : "---",
      monto_total: montoMatch ? montoMatch[1].trim() : "0.00"
    };
  };

  const handleConfirmClick = () => {
    const facturaFinal = manualSelection || voucher.conciliacion?.factura_sugerida;
    if (facturaFinal) onConfirm(facturaFinal);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50 shrink-0">
          <h2 className="text-xl font-bold text-gray-800">Resolución Asistida: {voucher.conciliacion?.nivel_confianza}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          <div className="w-full lg:w-[45%] bg-gray-50 border-r p-6 overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">Sugerencia IA</h3>
            {voucher.conciliacion?.factura_sugerida ? (
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-sm font-bold text-gray-600">Documento:</span>
                <span className="text-xl font-bold text-indigo-700 font-mono block mt-1">{voucher.conciliacion.factura_sugerida.numero_documento}</span>
              </div>
            ) : (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm">Sin sugerencia segura. Selecciona manualmente.</div>
            )}
            <div className="mt-4 p-4 bg-gray-100 rounded-lg"><h4 className="text-xs font-bold text-gray-500">Justificación:</h4><p className="text-sm mt-1">{voucher.conciliacion?.justificacion}</p></div>
          </div>

          <div className="w-full lg:w-[55%] bg-white p-6 overflow-y-auto">
            <h3 className="text-sm font-bold text-indigo-600 uppercase mb-4">Candidatos Base de Datos</h3>
            <div className="space-y-3">
              {voucher.candidatos_kb?.map((c: any, i: number) => {
                const parsed = parseCandidato(c.contenido);
                const isManual = manualSelection?.numero_documento === parsed.numero_documento;
                const isSuggested = voucher.conciliacion?.factura_sugerida?.numero_documento === parsed.numero_documento;
                
                return (
                  <div key={i} onClick={() => setManualSelection(parsed)} className={`border-2 rounded-xl p-4 cursor-pointer ${isManual ? "border-green-500 bg-green-50" : isSuggested ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <div className="flex justify-between">
                      <div>
                        <h4 className={`font-bold ${isManual ? "text-green-900" : "text-gray-900"}`}>{parsed.numero_documento}</h4>
                        <p className="text-sm text-gray-600">{parsed.cliente}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">S/ {parsed.monto_total}</p>
                        <p className="text-xs text-gray-500">Score: {c.score}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border-t px-6 py-4 flex justify-between shrink-0">
          <button onClick={onClose} className="text-gray-600 font-medium">Cancelar</button>
          <button onClick={handleConfirmClick} disabled={isResolving || (!voucher.conciliacion?.factura_sugerida && !manualSelection)} className="bg-indigo-600 text-white px-6 py-2 rounded-lg disabled:opacity-50">
            {isResolving ? "Guardando..." : "Confirmar Conciliación"}
          </button>
        </div>
      </div>
    </div>
  );
}