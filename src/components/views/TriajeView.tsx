"use client";
import { useState, useEffect } from "react";
import ResolucionModal from "../modals/ResolucionModal";

export default function TriajeView() {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      } else alert(data.error);
    } catch (e) { alert("Error de red"); }
    setIsResolving(false);
  };

  // NUEVO: Función para eliminar vouchers defectuosos
  const handleEliminarVoucher = async (voucher: any) => {
    if (!window.confirm(`¿Seguro que deseas eliminar permanentemente el archivo ${voucher.fileName} del triaje?`)) return;

    try {
      const res = await fetch("/api/vouchers/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pk_voucher: voucher.PK })
      });
      const data = await res.json();
      if (data.success) {
        setVouchers(prev => prev.filter(v => v.PK !== voucher.PK));
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Error al intentar eliminar el voucher.");
    }
  };

  const filteredVouchers = vouchers.filter((v) => {
    const term = searchTerm.toLowerCase();
    const clienteSugerido = v.conciliacion?.factura_sugerida?.cliente || "sin match";
    const matchSearch = !term || v.fileName?.toLowerCase().includes(term) || clienteSugerido.toLowerCase().includes(term) || v.conciliacion?.justificacion?.toLowerCase().includes(term);
    let matchNivel = true;
    const nivelIA = v.conciliacion?.nivel_confianza || "SIN_MATCH";
    if (nivelFiltro !== "TODOS") {
      matchNivel = nivelFiltro === "MANUAL" ? ["BAJO", "SIN_MATCH"].includes(nivelIA) : nivelIA === nivelFiltro;
    }
    return matchSearch && matchNivel;
  });

  const metricas = {
    altos: vouchers.filter(v => v.conciliacion?.nivel_confianza === "ALTO").length,
    ambiguos: vouchers.filter(v => v.conciliacion?.nivel_confianza === "AMBIGUO").length,
    manual: vouchers.filter(v => ["BAJO", "SIN_MATCH"].includes(v.conciliacion?.nivel_confianza)).length,
  };

  return (
    <div className="animate-fadeIn">
      {/* HEADER Y FILTROS SE MANTIENEN IGUAL... */}
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Triaje de Vouchers</h1>
          <p className="text-gray-500 mt-1">Mostrando {filteredVouchers.length} de {vouchers.length} documentos procesados.</p>
        </div>
        <button onClick={fetchVouchers} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Refrescar</button>
      </div>

      <div className="mb-6 flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <input type="text" placeholder="Buscar por archivo, razón social o justificación..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto shrink-0">
          <button onClick={() => setNivelFiltro("TODOS")} className={`px-4 py-1.5 rounded-md text-sm font-semibold ${nivelFiltro === "TODOS" ? "bg-white shadow-sm" : "text-gray-500"}`}>Todos</button>
          <button onClick={() => setNivelFiltro("ALTO")} className={`px-4 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 ${nivelFiltro === "ALTO" ? "bg-green-100 text-green-800" : "text-gray-500"}`}><span className="w-2 h-2 rounded-full bg-green-500"></span>Altos ({metricas.altos})</button>
          <button onClick={() => setNivelFiltro("AMBIGUO")} className={`px-4 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 ${nivelFiltro === "AMBIGUO" ? "bg-amber-100 text-amber-800" : "text-gray-500"}`}><span className="w-2 h-2 rounded-full bg-amber-500"></span>Ambigüedades ({metricas.ambiguos})</button>
          <button onClick={() => setNivelFiltro("MANUAL")} className={`px-4 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 ${nivelFiltro === "MANUAL" ? "bg-red-100 text-red-800" : "text-gray-500"}`}><span className="w-2 h-2 rounded-full bg-red-500"></span>Sin Match ({metricas.manual})</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : filteredVouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <p className="text-lg font-medium">No hay vouchers que coincidan con tus filtros.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="p-4 font-semibold">Voucher Analizado</th>
                <th className="p-4 font-semibold">Sugerencia (Razón Social)</th>
                <th className="p-4 font-semibold">Justificación IA</th>
                <th className="p-4 text-center font-semibold">Nivel de Match</th>
                <th className="p-4 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredVouchers.map(v => (
                <tr key={v.PK} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4"><p className="font-medium text-gray-900 truncate max-w-[150px]">{v.fileName}</p></td>
                  <td className="p-4">
                    <p className="text-gray-900 font-medium">{v.conciliacion?.factura_sugerida?.cliente || 'No detectado'}</p>
                    <p className="text-xs text-gray-500 font-mono mt-1">Monto: {v.conciliacion?.factura_sugerida ? `S/ ${v.conciliacion.factura_sugerida.monto_total}` : '---'}</p>
                  </td>
                  <td className="p-4"><p className="text-xs text-gray-600 line-clamp-2 max-w-xs">{v.conciliacion?.justificacion}</p></td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${v.conciliacion?.nivel_confianza === "ALTO" ? "bg-green-100 text-green-800" : v.conciliacion?.nivel_confianza === "AMBIGUO" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                      {v.conciliacion?.nivel_confianza}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {/* NUEVO: Contenedor flex para los dos botones */}
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleEliminarVoucher(v)} className="bg-white border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors">
                        Borrar
                      </button>
                      <button onClick={() => setSelectedVoucher(v)} className="bg-indigo-600 border border-transparent text-white hover:bg-indigo-700 px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors">
                        Resolver
                      </button>
                    </div>
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