"use client";

import { useState, useEffect } from "react";

const formatModalDate = (dateStr: string) => {
  if (!dateStr) return 'Sin fecha';
  if (dateStr.includes('/') && !dateStr.includes('T')) return dateStr;
  try {
    const dateObj = new Date(dateStr);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  } catch (e) {}
  if (dateStr.includes('-')) {
    const parts = dateStr.split('T')[0].split('-');
    if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const getModalCurrencySymbol = (monedaStr: string) => {
  if (!monedaStr) return "S/";
  const m = monedaStr.toUpperCase();
  if (m === "USD" || m.includes("DOLAR") || m.includes("DÓLAR")) return "$";
  if (m === "EUR" || m.includes("EURO")) return "€";
  return "S/";
};

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
    const formData = new FormData();
    formData.append("file", file);
    formData.append("factura_pk", facturaDetails.PK);
    formData.append("numero_documento", facturaDetails.numero_documento);
    formData.append("empresa_emisora_ruc", facturaDetails.empresa_emisora_ruc);

    try {
      const res = await fetch("/api/facturas/adjuntar-comprobante", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        alert("Comprobante visual adjuntado correctamente.");
        if (onRefresh) onRefresh();
        onClose();
      } else {
        alert(data.error || "Error al adjuntar el archivo.");
      }
    } catch (err) {
      alert("Error de red al intentar subir el archivo.");
    } finally {
      setIsAttaching(false);
    }
  };

  if (!facturaDetails) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Cabecera */}
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Detalles de Factura</h2>
            <p className="text-xs text-indigo-600 font-mono mt-0.5">ID: {facturaDetails.numero_documento}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* 🚨 BLOQUE DE MONTO CONDICIONAL (SI HAY DETRACCIÓN, MUESTRA DESGLOSE) */}
          <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Estado Financiero</span>
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${facturaDetails.estado === 'COBRADO' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {facturaDetails.estado}
              </span>
            </div>

            {facturaDetails.tiene_detraccion ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Monto Bruto Facturado</span>
                  <span className="text-lg font-bold text-gray-400 line-through decoration-red-400">
                    {getModalCurrencySymbol(facturaDetails.moneda)} {Number(facturaDetails.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded">Detracción ({(facturaDetails.tasa_detraccion || 0) * 100}%)</span>
                  <span className="text-lg font-bold text-amber-600">
                    - {getModalCurrencySymbol(facturaDetails.moneda)} {Number(facturaDetails.monto_detraccion || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                  <span className="text-sm font-black text-indigo-900 uppercase tracking-widest">NETO A PAGAR</span>
                  <span className="text-4xl font-black text-gray-900 inline-flex items-center gap-1.5">
                    <span className="text-indigo-600 font-mono font-medium text-2xl">{getModalCurrencySymbol(facturaDetails.moneda)}</span>
                    {Number(facturaDetails.monto_neto_pagar || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Monto a Pagar</span>
                <span className="text-4xl font-black text-gray-900 inline-flex items-center gap-1.5">
                  <span className="text-indigo-600 font-mono font-medium text-2xl">{getModalCurrencySymbol(facturaDetails.moneda)}</span>
                  {Number(facturaDetails.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Razón Social / Cliente</span>
              <p className="text-sm font-bold text-gray-800 leading-tight">{facturaDetails.cliente || "No especificado"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">RUC del Adquiriente</span>
              <p className="text-sm font-mono font-bold text-gray-700">{facturaDetails.ruc_cliente || "---"}</p>
            </div>

            <div className="space-y-1 pt-2 border-t border-gray-100 md:border-none">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Fecha de Emisión</span>
              <p className="text-sm font-medium text-gray-800">{formatModalDate(facturaDetails.fecha_emision)}</p>
            </div>
            <div className="space-y-1 pt-2 border-t border-gray-100 md:border-none">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Fecha de Vencimiento</span>
              <p className="text-sm font-medium text-gray-800">{formatModalDate(facturaDetails.fecha_vencimiento)}</p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-5">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Constancia del Depósito (Voucher)</h4>
            {isLoadingImage ? (
              <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div></div>
            ) : voucherImageUrl ? (
              <div className="w-full bg-gray-100 rounded-xl border border-gray-200 overflow-hidden flex justify-center p-2 max-h-64 shadow-inner">
                <img src={voucherImageUrl} alt="Comprobante de Pago" className="max-w-full max-h-full object-contain rounded" />
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50/50">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">No hay comprobante visual vinculado</p>
                <label className={`cursor-pointer bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm inline-flex items-center gap-1.5 ${isAttaching ? 'opacity-50 cursor-wait' : ''}`}>
                  {isAttaching ? "Subiendo..." : "Adjuntar Comprobante"}
                  <input type="file" accept="image/png, image/jpeg, image/jpg" className="hidden" onChange={handleAttach} disabled={isAttaching} />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-50 border-t px-6 py-4 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-white border border-gray-300 hover:bg-gray-50 font-bold rounded-lg text-sm transition-colors text-gray-700 shadow-sm">
            Cerrar Ventana
          </button>
        </div>
      </div>
    </div>
  );
}