"use client";
import { useState, useEffect } from "react";

export default function FacturaDetailsModal({ facturaDetails, onClose }: { facturaDetails: any, onClose: () => void }) {
  const [voucherImageUrl, setVoucherImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  useEffect(() => {
    if (facturaDetails?.estado === 'COBRADO' && facturaDetails?.voucher_conciliado?.endsWith('.json')) {
      setIsLoadingImage(true);
      fetch("/api/vouchers/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key_json: facturaDetails.voucher_conciliado })
      })
      .then(res => res.json())
      .then(data => { if (data.success) setVoucherImageUrl(data.url); })
      .finally(() => setIsLoadingImage(false));
    }
  }, [facturaDetails]);

  if (!facturaDetails) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 className="text-xl font-bold text-gray-800">Detalles de Factura</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Info Básica */}
          <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase">Documento</p>
              <p className="text-2xl font-bold text-indigo-700 font-mono">{facturaDetails.numero_documento}</p>
            </div>
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold shadow-sm ${facturaDetails.estado === 'COBRADO' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{facturaDetails.estado}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 font-semibold">Cliente</p><p className="text-sm font-medium">{facturaDetails.cliente}</p></div>
            <div><p className="text-xs text-gray-500 font-semibold">Monto Total</p><p className="text-lg font-bold">S/ {Number(facturaDetails.monto || 0).toFixed(2)}</p></div>
          </div>

          {/* Imagen S3 */}
          {facturaDetails.estado === 'COBRADO' && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
              <h3 className="text-sm font-bold text-indigo-800 uppercase mb-2">Auditoría de Conciliación</h3>
              <p className="text-xs text-indigo-600 font-medium">Voucher vinculado:</p>
              <p className="text-sm font-mono font-bold bg-white px-3 py-2 rounded border border-indigo-200 break-all">{facturaDetails.voucher_conciliado ? facturaDetails.voucher_conciliado.split('/').pop() : 'Manual'}</p>

              {facturaDetails.voucher_conciliado?.endsWith('.json') && (
                <div className="mt-4 border border-indigo-200 rounded-lg overflow-hidden bg-white flex items-center justify-center min-h-[200px]">
                  {isLoadingImage ? (
                    <div className="p-8 text-center text-indigo-500"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2 mx-auto"></div>Cargando...</div>
                  ) : voucherImageUrl ? (
                    <a href={voucherImageUrl} target="_blank" rel="noreferrer"><img src={voucherImageUrl} alt="Comprobante" className="w-full max-h-[300px] object-contain hover:opacity-90" /></a>
                  ) : (
                    <p className="p-8 text-red-500 text-xs">No se pudo cargar la imagen.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="bg-gray-50 border-t px-6 py-4 flex justify-end shrink-0">
          <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg">Cerrar</button>
        </div>
      </div>
    </div>
  );
}