"use client";
import { useState, useEffect } from "react";
import ResolucionModal from "../modals/ResolucionModal";

export default function TriajeView() {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Estados para Búsqueda y Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [nivelFiltro, setNivelFiltro] = useState<"TODOS" | "ALTO" | "AMBIGUO" | "MANUAL">("TODOS");

  const fetchVouchers = () => {
    setIsLoading(true);
    fetch("/api/vouchers")
      .then(res => res.json())
      .then(data => { if (data.success) setVouchers(data.data); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchVouchers();
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

  // Lógica de Filtrado de Vouchers
  const filteredVouchers = vouchers.filter((v) => {
    // 1. Filtro por Texto (Archivo, Sugerencia o Justificación)
    const term = searchTerm.toLowerCase();
    const clienteSugerido = v.conciliacion?.factura_sugerida?.cliente || "sin match";
    const matchSearch = !term || 
      v.fileName?.toLowerCase().includes(term) ||
      clienteSugerido.toLowerCase().includes(term) ||
      v.conciliacion?.justificacion?.toLowerCase().includes(term);

    // 2. Filtro por Nivel de IA
    let matchNivel = true;
    const nivelIA = v.conciliacion?.nivel_confianza || "SIN_MATCH";
    
    if (nivelFiltro !== "TODOS") {
      if (nivelFiltro === "MANUAL") {
        matchNivel = ["BAJO", "SIN_MATCH"].includes(nivelIA);
      } else {
        matchNivel = nivelIA === nivelFiltro;
      }
    }

    return matchSearch && matchNivel;
  });

  // Métricas para los botones de filtro
  const metricas = {
    altos: vouchers.filter(v => v.conciliacion?.nivel_confianza === "ALTO").length,
    ambiguos: vouchers.filter(v => v.conciliacion?.nivel_confianza === "AMBIGUO").length,
    manual: vouchers.filter(v => ["BAJO", "SIN_MATCH"].includes(v.conciliacion?.nivel_confianza)).length,
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Triaje de Vouchers</h1>
          <p className="text-gray-500 mt-1">
            Mostrando {filteredVouchers.length} de {vouchers.length} documentos procesados.
          </p>
        </div>
        <button onClick={fetchVouchers} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Refrescar
        </button>
      </div>

      {/* BARRA DE FILTROS RÁPIDOS Y BÚSQUEDA */}
      <div className="mb-6 flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        
        {/* Buscador de Texto */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input
            type="text"
            placeholder="Buscar por archivo, razón social sugerida o justificación..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg leading-5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>

        {/* Botones de Filtro por Nivel */}
        <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto shrink-0">
          <button 
            onClick={() => setNivelFiltro("TODOS")}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${nivelFiltro === "TODOS" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Todos
          </button>
          <button 
            onClick={() => setNivelFiltro("ALTO")}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2 ${nivelFiltro === "ALTO" ? "bg-green-100 text-green-800 shadow-sm" : "text-gray-500 hover:text-green-700"}`}
          >
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Altos ({metricas.altos})
          </button>
          <button 
            onClick={() => setNivelFiltro("AMBIGUO")}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2 ${nivelFiltro === "AMBIGUO" ? "bg-amber-100 text-amber-800 shadow-sm" : "text-gray-500 hover:text-amber-700"}`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            Ambigüedades ({metricas.ambiguos})
          </button>
          <button 
            onClick={() => setNivelFiltro("MANUAL")}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2 ${nivelFiltro === "MANUAL" ? "bg-red-100 text-red-800 shadow-sm" : "text-gray-500 hover:text-red-700"}`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            Sin Match ({metricas.manual})
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : filteredVouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p className="text-lg font-medium">No hay vouchers que coincidan con tus filtros.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="p-4 font-semibold">Voucher Analizado</th>
                <th className="p-4 font-semibold">Sugerencia (Razón Social)</th>
                <th className="p-4 font-semibold">Justificación IA</th>
                <th className="p-4 text-center font-semibold">Nivel de Match</th>
                <th className="p-4 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredVouchers.map(v => (
                <tr key={v.PK} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-400 shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      </div>
                      <p className="font-medium text-gray-900 truncate max-w-[150px]" title={v.fileName}>{v.fileName}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="text-gray-900 font-medium">{v.conciliacion?.factura_sugerida?.cliente || 'No detectado'}</p>
                    <p className="text-xs text-gray-500 font-mono mt-1">Monto: {v.conciliacion?.factura_sugerida ? `S/ ${v.conciliacion.factura_sugerida.monto_total}` : '---'}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-xs text-gray-600 line-clamp-2 max-w-xs" title={v.conciliacion?.justificacion}>{v.conciliacion?.justificacion}</p>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                      v.conciliacion?.nivel_confianza === "ALTO" ? "bg-green-100 text-green-800" :
                      v.conciliacion?.nivel_confianza === "AMBIGUO" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                    }`}>
                      {v.conciliacion?.nivel_confianza}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => setSelectedVoucher(v)} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors">
                      Resolver / Validar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ResolucionModal voucher={selectedVoucher} onClose={() => setSelectedVoucher(null)} onConfirm={handleConfirm} isResolving={isResolving} />
    </div>
  );
}