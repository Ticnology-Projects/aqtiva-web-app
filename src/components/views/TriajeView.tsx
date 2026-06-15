"use client";
import { useState, useEffect } from "react";
import ResolucionModal from "../modals/ResolucionModal";

export default function TriajeView() {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    fetch("/api/vouchers").then(res => res.json()).then(data => { if (data.success) setVouchers(data.data); });
  }, []);

  const handleConfirm = async (facturaSeleccionada: any) => {
    setIsResolving(true);
    try {
      const res = await fetch("/api/facturas/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_documento: facturaSeleccionada.numero_documento, s3_key_voucher: selectedVoucher.s3_key, PK_Voucher: selectedVoucher.PK })
      });
      const data = await res.json();
      if (data.success) {
        setVouchers(prev => prev.filter(v => v.PK !== selectedVoucher.PK));
        setSelectedVoucher(null);
        alert(data.message);
      } else alert(data.error);
    } catch (e) { alert("Error de red"); }
    setIsResolving(false);
  };

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-6">Triaje de Vouchers ({vouchers.length} pendientes)</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr><th className="p-4">Archivo</th><th className="p-4">Sugerencia</th><th className="p-4 text-center">Nivel</th><th className="p-4">Acción</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {vouchers.map(v => (
              <tr key={v.PK} className="hover:bg-gray-50">
                <td className="p-4 font-medium">{v.fileName}</td>
                <td className="p-4">{v.conciliacion?.factura_sugerida?.cliente || 'Sin Match'}</td>
                <td className="p-4 text-center font-bold text-xs">{v.conciliacion?.nivel_confianza}</td>
                <td className="p-4"><button onClick={() => setSelectedVoucher(v)} className="border px-3 py-1 rounded bg-white hover:bg-gray-50">Resolver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ResolucionModal voucher={selectedVoucher} onClose={() => setSelectedVoucher(null)} onConfirm={handleConfirm} isResolving={isResolving} />
    </div>
  );
}