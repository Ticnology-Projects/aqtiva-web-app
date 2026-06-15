"use client";

import { useState, useEffect } from "react";
import FacturaDetailsModal from "../modals/FacturaDetailsModal";

export default function CatalogoView() {
  const [facturas, setFacturas] = useState<any[]>([]);
  const [isLoadingFacturas, setIsLoadingFacturas] = useState(false);
  const [facturaDetails, setFacturaDetails] = useState<any | null>(null);

  const fetchFacturas = () => {
    setIsLoadingFacturas(true);
    fetch("/api/facturas")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const sorted = data.data.sort((a: any, b: any) => {
            if (!a.fecha_emision) return 1;
            if (!b.fecha_emision) return -1;
            return new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime();
          });
          setFacturas(sorted);
        }
      })
      .catch((err) => console.error("Error cargando facturas:", err))
      .finally(() => setIsLoadingFacturas(false));
  };

  useEffect(() => {
    fetchFacturas();
  }, []);

  // NUEVO: Función para exportar las facturas a Excel/CSV
  const handleExportarBackup = () => {
    const cabeceras = ["Documento", "Empresa Emisora", "RUC Emisor", "Cliente", "RUC Cliente", "Monto", "Moneda", "Estado", "Voucher Vinculado"];
    
    const filas = facturas.map(f => [
      f.numero_documento,
      f.empresa_emisora_nombre || "N/A",
      f.empresa_emisora_ruc || "N/A",
      f.cliente,
      f.ruc_cliente || "N/A",
      Number(f.monto || 0).toFixed(2),
      f.moneda || "PEN",
      f.estado,
      f.voucher_conciliado ? f.voucher_conciliado.split('/').pop() : "Ninguno"
    ]);

    const contenidoCSV = [
      cabeceras.join(";"),
      ...filas.map(fila => fila.join(";"))
    ].join("\n");

    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Backup_CatalogoFacturas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo de Facturas</h1>
          <p className="text-gray-500 mt-1">Todas las facturas pendientes y cobradas importadas a la base de datos.</p>
        </div>
        <div className="flex gap-3">
          {/* BOTÓN DE BACKUP */}
          <button 
            onClick={handleExportarBackup} 
            className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors shadow-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Exportar CSV
          </button>
          
          <button 
            onClick={fetchFacturas} 
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Refrescar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoadingFacturas ? (
          <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : facturas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg font-medium">No hay facturas registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Documento</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Empresa (Cobrador)</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Cliente a cobrar</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-500">Monto</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-500">Estado</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {facturas.map((factura, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{factura.numero_documento}</td>
                    <td className="px-6 py-4">
                      <p className="text-indigo-700 font-bold text-sm truncate max-w-[200px]">{factura.empresa_emisora_nombre || 'N/A'}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {factura.empresa_emisora_ruc || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-gray-900 font-medium truncate max-w-[200px]">{factura.cliente}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {factura.ruc_cliente || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-gray-700">
                      {factura.moneda === 'USD' ? '$' : 'S/'} {Number(factura.monto || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${factura.estado === 'COBRADO' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {factura.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setFacturaDetails(factura)} className="text-indigo-600 hover:text-indigo-900 font-semibold text-xs border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors">Ver detalles</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FacturaDetailsModal facturaDetails={facturaDetails} onClose={() => setFacturaDetails(null)} />
    </div>
  );
}