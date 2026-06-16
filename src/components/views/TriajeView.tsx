"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import ResolucionModal from "../modals/ResolucionModal";

export default function TriajeView() {
  const { data: session } = useSession();
  
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Estados de Empresas
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [empresaFiltro, setEmpresaFiltro] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [nivelFiltro, setNivelFiltro] = useState<"TODOS" | "ALTO" | "AMBIGUO" | "MANUAL">("TODOS");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!session?.user?.email) return;
    fetch(`/api/empresas?usuarioId=${encodeURIComponent(session.user.email)}`)
      .then(res => res.json())
      .then(data => { if (data.success) setEmpresas(data.data); })
      .catch(err => console.error(err));
  }, [session]);

  const fetchVouchers = () => {
    setIsLoading(true);
    fetch("/api/vouchers")
      .then(res => res.json())
      .then(data => { 
        if (data.success) {
          setVouchers(data.data); 
          setSelectedIds(new Set());
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchVouchers(); }, []);

  const handleConfirm = async (facturaSeleccionada: any) => {
    setIsResolving(true);
    try {
      const res = await fetch("/api/facturas/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          factura_pk: facturaSeleccionada.PK, 
          numero_documento: facturaSeleccionada.numero_documento, 
          s3_key_voucher: selectedVoucher.s3_key, 
          PK_Voucher: selectedVoucher.PK 
        })
      });
      const data = await res.json();
      if (data.success) {
        setVouchers(prev => prev.filter(v => v.PK !== selectedVoucher.PK));
        setSelectedVoucher(null);
      } else alert(data.error);
    } catch (e) { alert("Error de red"); }
    setIsResolving(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredVouchers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredVouchers.map(v => v.PK)));
  };

  const toggleSelectOne = (pk: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(pk)) newSet.delete(pk);
    else newSet.add(pk);
    setSelectedIds(newSet);
  };

  const handleDelete = async (vouchersToDel: any[]) => {
    if (!window.confirm(`¿Seguro que deseas eliminar permanentemente ${vouchersToDel.length} archivo(s) de la base de datos y de S3?`)) return;

    setIsDeleting(true);
    try {
      const payload = vouchersToDel.map(v => ({ PK: v.PK, s3_key: v.s3_key }));
      const res = await fetch("/api/vouchers/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vouchers: payload })
      });
      const data = await res.json();
      if (data.success) {
        setVouchers(prev => prev.filter(v => !payload.some(p => p.PK === v.PK)));
        setSelectedIds(new Set());
      } else alert(data.error);
    } catch (e) {
      alert("Error al intentar eliminar los vouchers.");
    } finally {
      setIsDeleting(false);
    }
  };

  const vouchersPorEmpresa = vouchers.filter(v => !empresaFiltro || v.empresa_emisora_ruc === empresaFiltro);

  const metricas = {
    altos: vouchersPorEmpresa.filter(v => v.conciliacion?.nivel_confianza === "ALTO").length,
    ambiguos: vouchersPorEmpresa.filter(v => v.conciliacion?.nivel_confianza === "AMBIGUO").length,
    manual: vouchersPorEmpresa.filter(v => ["BAJO", "SIN_MATCH"].includes(v.conciliacion?.nivel_confianza)).length,
  };

  const filteredVouchers = vouchersPorEmpresa.filter((v) => {
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

  // Helper para obtener nombre de empresa
  const getEmpresaNombre = (ruc: string) => {
    const emp = empresas.find(e => e.ruc === ruc);
    return emp ? emp.nombreOriginal : "Empresa Desconocida";
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Triaje de Vouchers</h1>
          <p className="text-gray-500 mt-1">Mostrando {filteredVouchers.length} de {vouchers.length} documentos procesados.</p>
        </div>
      </div>

      <div className="mb-6 flex flex-col xl:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm items-start xl:items-center">
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:flex-1">
          <div className="relative flex-1 w-full">
            <input type="text" placeholder="Buscar por archivo, razón social o justificación..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none" />
          </div>
          <select value={empresaFiltro} onChange={(e) => setEmpresaFiltro(e.target.value)} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-indigo-500 outline-none min-w-[220px] bg-white">
            <option value="">Todas las empresas</option>
            {empresas.map(emp => <option key={emp.ruc} value={emp.ruc}>{emp.nombreOriginal}</option>)}
          </select>
        </div>
        
        <div className="flex gap-2 flex-wrap items-center w-full xl:w-auto justify-end">
          {selectedIds.size > 0 && (
            <button onClick={() => handleDelete(filteredVouchers.filter(v => selectedIds.has(v.PK)))} disabled={isDeleting} className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 flex items-center gap-2 transition-colors disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              {isDeleting ? "Borrando..." : `Borrar (${selectedIds.size})`}
            </button>
          )}
          <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto shrink-0">
            <button onClick={() => setNivelFiltro("TODOS")} className={`px-4 py-1.5 rounded-md text-sm font-semibold ${nivelFiltro === "TODOS" ? "bg-white shadow-sm" : "text-gray-500"}`}>Todos</button>
            <button onClick={() => setNivelFiltro("ALTO")} className={`px-4 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 ${nivelFiltro === "ALTO" ? "bg-green-100 text-green-800" : "text-gray-500"}`}><span className="w-2 h-2 rounded-full bg-green-500"></span>Altos ({metricas.altos})</button>
            <button onClick={() => setNivelFiltro("AMBIGUO")} className={`px-4 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 ${nivelFiltro === "AMBIGUO" ? "bg-amber-100 text-amber-800" : "text-gray-500"}`}><span className="w-2 h-2 rounded-full bg-amber-500"></span>Ambig ({metricas.ambiguos})</button>
            <button onClick={() => setNivelFiltro("MANUAL")} className={`px-4 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 ${nivelFiltro === "MANUAL" ? "bg-red-100 text-red-800" : "text-gray-500"}`}><span className="w-2 h-2 rounded-full bg-red-500"></span>Sin Match ({metricas.manual})</button>
          </div>
          <button onClick={fetchVouchers} className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">Refrescar</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : filteredVouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <p className="text-lg font-medium">No hay vouchers que coincidan.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-4 w-12 text-center"><input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" checked={selectedIds.size > 0 && selectedIds.size === filteredVouchers.length} onChange={toggleSelectAll} /></th>
                <th className="p-4 font-semibold">Voucher Analizado</th>
                <th className="p-4 font-semibold">Empresa (Cobrador)</th>
                <th className="p-4 font-semibold">Sugerencia (Cliente)</th>
                <th className="p-4 font-semibold">Justificación IA</th>
                <th className="p-4 text-center font-semibold">Nivel de Match</th>
                <th className="p-4 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredVouchers.map(v => (
                <tr key={v.PK} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(v.PK) ? 'bg-indigo-50/30' : ''}`}>
                  <td className="px-4 py-4 text-center"><input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" checked={selectedIds.has(v.PK)} onChange={() => toggleSelectOne(v.PK)} /></td>
                  <td className="p-4"><p className="font-medium text-gray-900 truncate max-w-[150px]">{v.fileName}</p></td>
                  <td className="p-4">
                    <p className="font-bold text-indigo-700 text-sm truncate max-w-[180px]" title={getEmpresaNombre(v.empresa_emisora_ruc)}>{getEmpresaNombre(v.empresa_emisora_ruc)}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {v.empresa_emisora_ruc || 'N/A'}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-gray-900 font-medium">{v.conciliacion?.factura_sugerida?.cliente || 'No detectado'}</p>
                    <p className="text-xs text-gray-500 font-mono mt-1">Sugerido: {v.conciliacion?.factura_sugerida?.numero_documento || '---'}</p>
                  </td>
                  <td className="p-4"><p className="text-xs text-gray-600 line-clamp-2 max-w-xs">{v.conciliacion?.justificacion}</p></td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${v.conciliacion?.nivel_confianza === "ALTO" ? "bg-green-100 text-green-800" : v.conciliacion?.nivel_confianza === "AMBIGUO" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                      {v.conciliacion?.nivel_confianza}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleDelete([v])} className="bg-white border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors">Borrar</button>
                      <button onClick={() => setSelectedVoucher(v)} className="bg-indigo-600 border border-transparent text-white hover:bg-indigo-700 px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors">Resolver</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* SE PASA LA LISTA DE EMPRESAS AL MODAL PARA IDENTIFICAR NOMBRES */}
      <ResolucionModal voucher={selectedVoucher} onClose={() => setSelectedVoucher(null)} onConfirm={handleConfirm} isResolving={isResolving} empresas={empresas} />
    </div>
  );
}