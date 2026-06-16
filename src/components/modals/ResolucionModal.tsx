"use client";
import { useState, useEffect } from "react";

export default function ResolucionModal({ voucher, onClose, onConfirm, isResolving }: any) {
  const [manualSelection, setManualSelection] = useState<any | null>(null);
  const [voucherImageUrl, setVoucherImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // Obtener la imagen segura de S3 apenas se abre el modal
  useEffect(() => {
    if (voucher?.s3_key) {
      setIsLoadingImage(true);
      fetch("/api/vouchers/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key_json: voucher.s3_key })
      })
      .then(res => res.json())
      .then(data => { if (data.success) setVoucherImageUrl(data.url); })
      .finally(() => setIsLoadingImage(false));
    }
  }, [voucher]);

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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[90vw] h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${voucher.conciliacion?.nivel_confianza === "ALTO" ? "bg-green-500" : voucher.conciliacion?.nivel_confianza === "AMBIGUO" ? "bg-amber-500" : "bg-red-500"}`}></span>
              Resolución Asistida: {voucher.conciliacion?.nivel_confianza}
            </h2>
            <p className="text-sm text-gray-500 mt-1 font-mono">{voucher.fileName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
        </div>

        {/* CONTENIDO DIVIDIDO EN 2 COLUMNAS */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          
          {/* COLUMNA IZQUIERDA: VISOR DE IMAGEN (45%) */}
          <div className="w-full lg:w-[45%] bg-gray-100 border-r border-gray-200 p-4 flex flex-col relative">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 shrink-0">Comprobante Analizado</h3>
            <div className="flex-1 bg-white rounded-xl border border-gray-300 overflow-hidden flex items-center justify-center relative shadow-inner">
              {isLoadingImage ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                  <span className="text-sm text-indigo-500 font-medium">Desencriptando S3...</span>
                </div>
              ) : voucherImageUrl ? (
                <a href={voucherImageUrl} target="_blank" rel="noreferrer" title="Click para ver en pantalla completa" className="w-full h-full flex items-center justify-center cursor-zoom-in p-2">
                  <img src={voucherImageUrl} alt="Voucher" className="max-w-full max-h-full object-contain" />
                </a>
              ) : (
                <p className="text-red-500 text-sm font-medium">No se pudo cargar la imagen del servidor.</p>
              )}
            </div>
          </div>

          {/* COLUMNA DERECHA: DATOS (55%) */}
          <div className="w-full lg:w-[55%] flex flex-col flex-1 overflow-hidden bg-white">
            
            {/* SECCIÓN SUPERIOR: IA SUGERENCIA */}
            <div className="p-6 bg-gray-50 border-b border-gray-200 shrink-0">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4">Match Sugerido por IA</h3>
              {voucher.conciliacion?.factura_sugerida ? (
                <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Documento Seleccionado</span>
                    <span className="text-2xl font-bold text-indigo-700 font-mono">{voucher.conciliacion.factura_sugerida.numero_documento}</span>
                    <p className="text-sm font-medium text-gray-800 mt-1">{voucher.conciliacion.factura_sugerida.cliente}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Monto Detectado</span>
                    <span className="text-xl font-bold text-gray-900">S/ {voucher.conciliacion.factura_sugerida.monto_total}</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">
                  Sin sugerencia segura. Selecciona un candidato de la lista inferior manualmente.
                </div>
              )}
              <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200 text-sm text-gray-600">
                <span className="font-bold text-gray-700 mr-2">Justificación:</span>
                {voucher.conciliacion?.justificacion}
              </div>
            </div>

            {/* SECCIÓN INFERIOR: CANDIDATOS KB */}
            <div className="p-6 flex-1 overflow-y-auto">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Candidatos en Base de Datos</h3>
              {(!voucher.candidatos_kb || voucher.candidatos_kb.length === 0) ? (
                 <p className="text-gray-500 text-sm">No se encontraron facturas similares.</p>
              ) : (
                <div className="space-y-3">
                  {voucher.candidatos_kb.map((c: any, i: number) => {
                    const parsed = parseCandidato(c.contenido);
                    const isManual = manualSelection?.numero_documento === parsed.numero_documento;
                    const isSuggested = voucher.conciliacion?.factura_sugerida?.numero_documento === parsed.numero_documento;
                    
                    return (
                      <div key={i} onClick={() => setManualSelection(parsed)} className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${isManual ? "border-green-500 bg-green-50" : isSuggested ? "border-indigo-400 bg-indigo-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className={`font-bold text-lg ${isManual ? "text-green-900" : isSuggested ? "text-indigo-900" : "text-gray-900"}`}>{parsed.numero_documento}</h4>
                              {isSuggested && !isManual && <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Sugerido</span>}
                              {isManual && <span className="bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Seleccionado</span>}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{parsed.cliente}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">S/ {parsed.monto_total}</p>
                            <p className="text-xs text-gray-500 mt-1">Score IA: {c.score}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between shrink-0">
          <button onClick={onClose} className="text-gray-600 font-medium hover:text-gray-900 px-4 py-2">Cancelar</button>
          <button onClick={handleConfirmClick} disabled={isResolving || (!voucher.conciliacion?.factura_sugerida && !manualSelection)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-lg font-bold shadow-md disabled:opacity-50 transition-colors">
            {isResolving ? "Guardando..." : "Confirmar Conciliación"}
          </button>
        </div>
      </div>
    </div>
  );
}