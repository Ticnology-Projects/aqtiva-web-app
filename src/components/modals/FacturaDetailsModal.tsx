"use client";
import { useState, useEffect } from "react";

export default function FacturaDetailsModal({ facturaDetails, onClose, onRefresh }: any) {
  const [voucherImageUrl, setVoucherImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);

  useEffect(() => {
    const voucherKey = facturaDetails?.voucher_conciliado;
    if (facturaDetails?.estado === 'COBRADO' && voucherKey && voucherKey.includes('/')) {
      setIsLoadingImage(true);
      fetch("/api/vouchers/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key_json: voucherKey })
      })
        .then(res => res.json())
        .then(data => { if (data.success) setVoucherImageUrl(data.url); })
        .finally(() => setIsLoadingImage(false));
    }
  }, [facturaDetails]);

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAttaching(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        try {
            const res = await fetch("/api/facturas/adjuntar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    factura_pk: facturaDetails.PK,
                    numero_documento: facturaDetails.numero_documento,
                    fileName: file.name,
                    fileBase64: base64
                })
            });
            const data = await res.json();
            if (data.success) {
                alert("Comprobante adjuntado exitosamente. Se ha registrado en la Auditoría.");
                if (onRefresh) onRefresh();
                onClose();
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert("Error de red al adjuntar comprobante.");
        } finally {
            setIsAttaching(false);
        }
    };
    reader.readAsDataURL(file);
  };

  if (!facturaDetails) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 className="text-xl font-bold text-gray-800">Detalles de Factura</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase">Documento</p>
              <p className="text-2xl font-bold text-indigo-700 font-mono">{facturaDetails.numero_documento}</p>
            </div>
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold shadow-sm ${facturaDetails.estado === 'COBRADO' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{facturaDetails.estado}</span>
          </div>

          <div className="grid grid-cols-2 gap-5 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            {/* NUEVO: Campo de Empresa (Cobradora) */}
            <div className="col-span-2 border-b border-gray-100 pb-3">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Empresa Cobradora (Emisor)</p>
              <p className="text-sm font-bold text-indigo-800 uppercase flex items-center gap-2">
                🏢 {facturaDetails.empresa_emisora_nombre || 'N/A'}
              </p>
              <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {facturaDetails.empresa_emisora_ruc || 'N/A'}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Cliente a Cobrar</p>
              <p className="text-sm font-medium text-gray-900">{facturaDetails.cliente}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Monto Total</p>
              <p className="text-lg font-black text-gray-900">S/ {Number(facturaDetails.monto || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Fecha Emisión</p>
              <p className="text-sm font-medium text-gray-800">{facturaDetails.fecha_emision ? new Date(facturaDetails.fecha_emision).toLocaleDateString('es-PE') : '---'}</p>
            </div>
          </div>

          {facturaDetails.estado === 'COBRADO' && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
              <h3 className="text-sm font-bold text-indigo-800 uppercase mb-2">Constancia de Pago</h3>
              
              {facturaDetails.voucher_conciliado && facturaDetails.voucher_conciliado.includes('/') ? (
                <>
                  <p className="text-xs text-indigo-600 font-medium">Voucher vinculado:</p>
                  <p className="text-sm font-mono font-bold bg-white px-3 py-2 rounded border border-indigo-200 break-all mb-4">
                    {facturaDetails.voucher_conciliado.split('/').pop()}
                  </p>
                  <div className="border border-indigo-200 rounded-lg overflow-hidden bg-white flex items-center justify-center min-h-[200px]">
                    {isLoadingImage ? (
                      <div className="p-8 text-center text-indigo-500"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2 mx-auto"></div>Cargando...</div>
                    ) : voucherImageUrl ? (
                      <a href={voucherImageUrl} target="_blank" rel="noreferrer"><img src={voucherImageUrl} alt="Comprobante" className="w-full max-h-[300px] object-contain hover:opacity-90" /></a>
                    ) : (
                      <p className="p-8 text-red-500 text-xs">No se pudo cargar la imagen.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-2 border-2 border-dashed border-indigo-300 rounded-xl bg-white p-6 text-center">
                  <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3 text-indigo-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Esta factura ya fue cobrada</p>
                  <p className="text-xs text-gray-500 mb-4">No tiene un comprobante visual adjunto. Puedes subir uno como constancia para la auditoría.</p>
                  <label className={`cursor-pointer bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm inline-flex items-center gap-2 ${isAttaching ? 'opacity-50 cursor-wait' : ''}`}>
                    {isAttaching ? "Subiendo..." : "Adjuntar PNG/JPG"}
                    <input type="file" accept="image/png, image/jpeg, image/jpg" className="hidden" onChange={handleAttach} disabled={isAttaching} />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="bg-gray-50 border-t px-6 py-4 flex justify-end shrink-0">
          <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
}