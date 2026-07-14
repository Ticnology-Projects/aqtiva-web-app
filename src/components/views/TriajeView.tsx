"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Download, Calendar } from "lucide-react";
import ResolucionModal from "../modals/ResolucionModal";

export default function TriajeView() {
  const { data: session } = useSession();
  
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Estados de Selección Múltiple y Filtros
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [sortOrder, setSortOrder] = useState<"DESC" | "ASC">("DESC");

  const tenantId = (session?.user as any)?.tenantId || session?.user?.email;
  const userRole = (session?.user as any)?.rol || 'USER';

  const fetchData = () => {
    if (!tenantId) return;
    setIsLoading(true);
    
    Promise.all([
      fetch(`/api/vouchers`).then(res => res.json()),
      fetch(`/api/empresas?tenantId=${encodeURIComponent(tenantId)}`).then(res => res.json())
    ])
      .then(([vouchersData, empresasData]) => {
        let misEmpresas: any[] = [];
        
        if (empresasData.success) {
          misEmpresas = empresasData.data;
          setEmpresas(misEmpresas);
        }

        if (vouchersData.success) {
          const userRucs = new Set(misEmpresas.map(e => e.ruc));
          const misVouchers = vouchersData.data.filter((v: any) => userRucs.has(v.empresa_emisora_ruc));

          const sortedVouchers = misVouchers.sort((a: any, b: any) => {
            const timeA = a.fecha_importacion ? new Date(a.fecha_importacion).getTime() : 0;
            const timeB = b.fecha_importacion ? new Date(b.fecha_importacion).getTime() : 0;
            return timeB - timeA;
          });
          setVouchers(sortedVouchers);
        }
        
        setSelectedIds(new Set());
      })
      .catch(err => console.error("Error cargando Triaje:", err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const getEmpresaNombre = (ruc: string) => {
    const emp = empresas.find(e => e.ruc === ruc);
    return emp ? emp.nombreOriginal : "Empresa Desconocida";
  };

  // 🚨 LÓGICA DE FILTRADO MEJORADA (Texto + Fecha y Hora exacta)
  const filteredVouchers = vouchers.filter((v) => {
    const term = searchTerm.toLowerCase();
    const importeStr = String(v.conciliacion?.importe_pagado || "");
    const fechaStr = v.fecha_importacion ? new Date(v.fecha_importacion).toLocaleString('es-PE').toLowerCase() : "";

    // Búsqueda de texto inclusiva (ahora también busca por la fecha visual, ej: "14:30")
    const matchSearch = !term ||
      v.fileName?.toLowerCase().includes(term) ||
      v.empresa_emisora_ruc?.toLowerCase().includes(term) ||
      getEmpresaNombre(v.empresa_emisora_ruc).toLowerCase().includes(term) ||
      importeStr.includes(term) ||
      fechaStr.includes(term);

    // Filtro Exacto por Fecha y Hora (incluyendo los segundos)
    let matchFecha = true;
    if (fechaInicio || fechaFin) {
      const vDate = v.fecha_importacion ? new Date(v.fecha_importacion).getTime() : 0;
      if (vDate > 0) {
        const start = fechaInicio ? new Date(fechaInicio).getTime() : 0;
        let end = Infinity;
        
        if (fechaFin) {
          const d = new Date(fechaFin);
          d.setSeconds(59, 999); // Abarcar hasta el final del minuto
          end = d.getTime();
        }
        
        matchFecha = vDate >= start && vDate <= end;
      } else {
        matchFecha = false; 
      }
    }

    return matchSearch && matchFecha;
  });

  filteredVouchers.sort((a, b) => {
    const timeA = a.fecha_importacion ? new Date(a.fecha_importacion).getTime() : 0;
    const timeB = b.fecha_importacion ? new Date(b.fecha_importacion).getTime() : 0;
    return sortOrder === "DESC" ? timeB - timeA : timeA - timeB;
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredVouchers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredVouchers.map(v => v.s3_key)));
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleExportar = () => {
    const dataToExport = selectedIds.size > 0 
      ? filteredVouchers.filter(v => selectedIds.has(v.s3_key))
      : filteredVouchers;

    if (dataToExport.length === 0) {
      alert("No hay vouchers para exportar.");
      return;
    }

    const cabeceras = ["Fecha Ingreso", "Voucher (Archivo)", "Empresa Destino", "RUC Destino", "Monto Extraído", "Moneda", "Confianza IA"];
    const filas = dataToExport.map(v => [
      v.fecha_importacion ? new Date(v.fecha_importacion).toLocaleString('es-PE') : 'Sin fecha',
      v.fileName,
      getEmpresaNombre(v.empresa_emisora_ruc),
      v.empresa_emisora_ruc,
      Number(v.conciliacion?.importe_pagado || 0).toFixed(2),
      v.conciliacion?.moneda || "PEN",
      v.conciliacion?.nivel_confianza === "MEDIO" ? "AMBIGUO" : (v.conciliacion?.nivel_confianza || "NO MATCH")
    ]);

    const contenidoCSV = [cabeceras.join(";"), ...filas.map(fila => fila.join(";"))].join("\n");
    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Bandeja_Triaje_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (vouchersAEliminar: any[]) => {
    if (userRole !== 'ADMIN') {
      alert("Acceso denegado: Solo el Administrador puede eliminar vouchers.");
      return;
    }

    if (!window.confirm(`¿Seguro que deseas descartar ${vouchersAEliminar.length} voucher(s)?\nSe borrarán de la bandeja de Triaje y de S3.`)) return;

    setIsDeleting(true);
    try {
      const payload = vouchersAEliminar.map(v => ({ s3_key: v.s3_key, PK: v.PK }));
      const res = await fetch("/api/vouchers/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vouchers: payload })
      });

      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Error de red al intentar eliminar.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResolverVoucher = async (payloadConfirmacion: any) => {
    setIsResolving(true);
    try {
      const res = await fetch("/api/facturas/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facturas: payloadConfirmacion.facturas,
          s3_key_voucher: selectedVoucher.s3_key,
          PK_Voucher: selectedVoucher.PK,
          es_automatico: false,
          // 🚨 Se envían los datos de trazabilidad
          usuario_resolutor: session?.user?.email || "Usuario Desconocido",
          historial_previo: selectedVoucher.historial_trazabilidad || []
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setSelectedVoucher(null);
        fetchData(); 
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Error al resolver la conciliación.");
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Triaje de IA</h1>
          <p className="text-gray-500 mt-1">Supervisa y aprueba las conciliaciones de los vouchers entrantes.</p>
        </div>
        <div className="flex gap-2">
          {userRole === 'ADMIN' && selectedIds.size > 0 && (
            <button onClick={() => handleDelete(vouchers.filter(v => selectedIds.has(v.s3_key)))} disabled={isDeleting} className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50">
              {isDeleting ? "Descartando..." : `Descartar (${selectedIds.size})`}
            </button>
          )}
          
          <button onClick={fetchData} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-2">
            Actualizar Bandeja
          </button>

          <button onClick={handleExportar} className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors shadow-sm flex items-center gap-2">
            <Download className="w-4 h-4" />
            Exportar CSV ({selectedIds.size > 0 ? selectedIds.size : filteredVouchers.length})
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm items-center flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input
            type="text"
            placeholder="Buscar por hora, documento, empresa o monto (Ej. 150.00)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
          />
        </div>

        {/* 🚨 INPUTS DE HORA (DATETIME-LOCAL) */}
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 w-full sm:w-auto self-start">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500 font-medium ml-1">Rango:</span>
            <input 
                type="datetime-local" 
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)} 
                className="bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-auto"
            />
            <span className="text-gray-400 mx-1">a</span>
            <input 
                type="datetime-local" 
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)} 
                className="bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-auto"
            />
            {(fechaInicio || fechaFin) && (
              <button 
                onClick={() => { setFechaInicio(""); setFechaFin(""); }}
                className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Limpiar fechas"
              >
                ✕
              </button>
            )}
        </div>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "DESC" | "ASC")}
          className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-[200px] bg-white font-medium text-gray-700"
        >
          <option value="DESC">Más recientes</option>
          <option value="ASC">Más antiguos</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : filteredVouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-center">
            <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p className="text-xl font-medium text-gray-800">La bandeja está limpia</p>
            <p className="mt-1">No hay comprobantes pendientes que coincidan con la búsqueda.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                {userRole === 'ADMIN' && (
                  <th className="p-4 w-12 text-center">
                    <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" checked={selectedIds.size > 0 && selectedIds.size === filteredVouchers.length} onChange={toggleSelectAll} />
                  </th>
                )}
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Voucher Depositado</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Empresa (Cuenta Destino)</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs text-center">Confianza IA</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredVouchers.map(v => {
                const isSelected = selectedIds.has(v.s3_key);
                return (
                  <tr key={v.PK} className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                    
                    {userRole === 'ADMIN' && (
                      <td className="p-4 text-center">
                        <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" checked={isSelected} onChange={() => toggleSelectOne(v.s3_key)} />
                      </td>
                    )}

                    <td className="p-4">
                      <p className="font-bold text-gray-800 text-xs truncate max-w-[180px]" title={v.fileName}>{v.fileName}</p>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">Monto: {v.conciliacion?.moneda === 'USD' ? '$' : 'S/'} {Number(v.conciliacion?.importe_pagado || 0).toFixed(2)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {v.fecha_importacion ? new Date(v.fecha_importacion).toLocaleString('es-PE') : 'Sin fecha'}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-gray-800 text-xs truncate max-w-[150px] uppercase" title={getEmpresaNombre(v.empresa_emisora_ruc)}>{getEmpresaNombre(v.empresa_emisora_ruc)}</p>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">RUC: {v.empresa_emisora_ruc}</p>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest ${v.conciliacion?.nivel_confianza === "ALTO" ? "bg-green-100 text-green-800" : ["AMBIGUO", "MEDIO"].includes(v.conciliacion?.nivel_confianza) ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                        {v.conciliacion?.nivel_confianza === "MEDIO" ? "AMBIGUO" : (v.conciliacion?.nivel_confianza || "NO MATCH")}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        {userRole === 'ADMIN' && (
                          <button onClick={() => handleDelete([v])} className="bg-white border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors">
                            Borrar
                          </button>
                        )}
                        <button onClick={() => setSelectedVoucher(v)} className="bg-indigo-600 border border-transparent text-white hover:bg-indigo-700 px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors">
                          Resolver
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedVoucher && (
        <ResolucionModal
          voucher={selectedVoucher}
          empresas={empresas}
          onClose={() => setSelectedVoucher(null)}
          onConfirm={handleResolverVoucher}
          isResolving={isResolving}
        />
      )}
    </div>
  );
}