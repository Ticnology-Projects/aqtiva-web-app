"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import ResolucionModal from "../modals/ResolucionModal";

const getSugerenciaInfo = (conciliacion: any) => {
  if (!conciliacion) return { cliente: 'No detectado', doc: '---' };
  
  if (conciliacion.tipo_conciliacion === 'LOTE' && conciliacion.facturas_sugeridas?.length > 1) {
    const clientes = [...new Set(conciliacion.facturas_sugeridas.map((f: any) => f.cliente))];
    return {
      cliente: clientes.join(", ") || 'Múltiples clientes',
      doc: `Lote de ${conciliacion.facturas_sugeridas.length} facturas`
    };
  }

  const sug = conciliacion.factura_sugerida || conciliacion.facturas_sugeridas?.[0];
  return {
    cliente: sug?.cliente || 'No detectado',
    doc: sug?.numero_documento || '---'
  };
};

export default function TriajeView() {
  const { data: session } = useSession();
  
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  // 🚨 REGLAS MULTI-TENANT Y RBAC
  const tenantId = (session?.user as any)?.tenantId || session?.user?.email;
  const userRole = (session?.user as any)?.rol || 'USER';

  const fetchData = () => {
    if (!tenantId) return;
    setIsLoading(true);
    
    Promise.all([
      // 🚨 Ya no le pasamos tenantId a los vouchers, traemos todos los pendientes
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
          // 🚨 FILTRO CRUZADO SEGURO: Extraemos los RUCs de las empresas que le pertenecen a este Tenant
          const userRucs = new Set(misEmpresas.map(e => e.ruc));
          
          // Solo conservamos los vouchers que pertenezcan a los RUCs autorizados
          const misVouchers = vouchersData.data.filter((v: any) => userRucs.has(v.empresa_emisora_ruc));

          // Ordenar por fecha de registro (más recientes primero)
          const sortedVouchers = misVouchers.sort((a: any, b: any) => {
            const timeA = a.fecha_registro ? new Date(a.fecha_registro).getTime() : 0;
            const timeB = b.fecha_registro ? new Date(b.fecha_registro).getTime() : 0;
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

  const toggleSelectAll = () => {
    if (selectedIds.size === vouchers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(vouchers.map(v => v.s3_key)));
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleDelete = async (vouchersAEliminar: any[]) => {
    // Protección RBAC (Frontend)
    if (userRole !== 'ADMIN') {
      alert("Acceso denegado: Solo el Administrador puede eliminar vouchers.");
      return;
    }

    if (!window.confirm(`¿Seguro que deseas descartar ${vouchersAEliminar.length} voucher(s)?\nSe borrarán de la bandeja de Triaje y de S3.`)) return;

    setIsDeleting(true);
    try {
      const payload = vouchersAEliminar.map(v => ({ s3_key: v.s3_key }));
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
          es_automatico: false
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
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : vouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-center">
            <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p className="text-xl font-medium text-gray-800">La bandeja está limpia</p>
            <p className="mt-1">No hay comprobantes pendientes de revisión.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                {userRole === 'ADMIN' && (
                  <th className="p-4 w-12 text-center">
                    <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" checked={selectedIds.size > 0 && selectedIds.size === vouchers.length} onChange={toggleSelectAll} />
                  </th>
                )}
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Voucher Depositado</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Empresa (Cuenta Destino)</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Sugerencia IA (Cliente y Doc)</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs text-center">Confianza IA</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vouchers.map(v => {
                const sugInfo = getSugerenciaInfo(v.conciliacion);
                
                return (
                  <tr key={v.PK} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(v.s3_key) ? 'bg-indigo-50/30' : ''}`}>
                    {userRole === 'ADMIN' && (
                      <td className="p-4 text-center">
                        <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" checked={selectedIds.has(v.s3_key)} onChange={() => toggleSelectOne(v.s3_key)} />
                      </td>
                    )}
                    <td className="p-4">
                      <p className="font-bold text-gray-800 text-xs truncate max-w-[180px]" title={v.fileName}>{v.fileName}</p>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">Monto: {v.conciliacion?.moneda === 'USD' ? '$' : 'S/'} {Number(v.conciliacion?.importe_pagado || 0).toFixed(2)}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-gray-800 text-xs truncate max-w-[150px] uppercase" title={getEmpresaNombre(v.empresa_emisora_ruc)}>{getEmpresaNombre(v.empresa_emisora_ruc)}</p>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">RUC: {v.empresa_emisora_ruc}</p>
                    </td>
                    <td className="p-4">
                      <div className="bg-gray-50 border border-gray-100 p-2 rounded-lg">
                        <p className="font-bold text-indigo-700 text-xs truncate max-w-[180px]" title={sugInfo.cliente}>{sugInfo.cliente}</p>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">Documento: {sugInfo.doc}</p>
                      </div>
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