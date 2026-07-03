"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

// ==========================================
// HELPERS PARA MONTO Y MONEDA
// ==========================================
const getVoucherMonto = (v: any) => {
  let monto = Number(v.conciliacion?.importe_pagado);
  if (!monto || isNaN(monto)) monto = Number(v.conciliacion?.factura_sugerida?.monto_total);
  if (!monto || isNaN(monto)) monto = Number(v.conciliacion?.facturas_sugeridas?.[0]?.monto_total);
  return monto || 0;
};

const getVoucherMoneda = (v: any) => {
  let monedaStr = v.conciliacion?.moneda || v.conciliacion?.factura_sugerida?.moneda || "PEN";
  const m = monedaStr.toUpperCase();
  if (m === "USD" || m.includes("DOLAR") || m.includes("DÓLAR")) return "$";
  if (m === "EUR" || m.includes("EURO")) return "€";
  return "S/";
};

// ==========================================
// 1. REPORTE LEGIBLE DE IA PARA HUMANOS
// ==========================================
const ReporteIAHumano = ({ data }: { data: any }) => {
  let d = data;
  if (typeof d === "string") {
    try { d = JSON.parse(d); } catch (e) {}
  }

  if (!d || !d.nivel_confianza) {
    return (
      <div className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs overflow-auto font-mono">
        <pre>{JSON.stringify(d, null, 2)}</pre>
      </div>
    );
  }

  const getVal = (field: any) => field?.S || field?.N || field;
  const getArray = (field: any) => {
    if (Array.isArray(field)) return field;
    if (field?.L) return field.L.map((item: any) => getVal(item));
    return [];
  };

  const nivel = getVal(d.nivel_confianza);
  const score = getVal(d.score_kb);
  const justificacion = getVal(d.justificacion);
  const sugerida = d.factura_sugerida?.M ? {
    numero_documento: getVal(d.factura_sugerida.M.numero_documento),
    cliente: getVal(d.factura_sugerida.M.cliente),
    monto_total: getVal(d.factura_sugerida.M.monto_total)
  } : d.factura_sugerida;

  const coincidentes = getArray(d.campos_coincidentes);
  const discrepantes = getArray(d.campos_discrepantes);

  return (
    <div className="space-y-6 text-gray-800">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Confianza IA</span>
          <span className={`text-2xl font-black ${nivel === 'ALTO' ? 'text-green-600' : nivel === 'AMBIGUO' ? 'text-amber-500' : 'text-red-500'}`}>
            {nivel}
          </span>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Score BD</span>
          <span className="text-2xl font-black text-indigo-600 font-mono">
            {Number(score || 0).toFixed(4)}
          </span>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 shadow-sm">
        <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-widest mb-2 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Justificación del Algoritmo
        </h4>
        <p className="text-sm text-indigo-900 leading-relaxed font-medium">{justificacion}</p>
      </div>

      {sugerida && sugerida.numero_documento && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Factura Sugerida</h4>
          <div className="bg-white border-2 border-indigo-200 rounded-xl p-5 flex justify-between items-center shadow-sm">
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase mb-1">Documento</p>
              <p className="text-xl font-bold text-gray-900">{sugerida.numero_documento}</p>
              <p className="text-sm text-gray-600 mt-1">{sugerida.cliente}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 font-bold uppercase mb-1">Monto</p>
              <p className="text-2xl font-black text-indigo-700 font-mono">S/ {sugerida.monto_total}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-gray-100">
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            Coincidentes
          </h4>
          <div className="flex flex-wrap gap-2">
            {coincidentes.length > 0 ? coincidentes.map((c: string, i: number) => (
              <span key={i} className="bg-green-50 border border-green-200 text-green-700 px-3 py-1 rounded-md text-xs font-bold uppercase">{c.replace(/_/g, ' ')}</span>
            )) : <span className="text-sm text-gray-400">Ninguno detectado</span>}
          </div>
        </div>
        
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            Discrepantes
          </h4>
          <div className="flex flex-wrap gap-2">
            {discrepantes.length > 0 ? discrepantes.map((c: string, i: number) => (
              <span key={i} className="bg-red-50 border border-red-200 text-red-700 px-3 py-1 rounded-md text-xs font-bold uppercase">{c.replace(/_/g, ' ')}</span>
            )) : <span className="text-sm text-gray-400">Ninguno detectado</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. COMPONENTE: VISOR VOUCHER DE S3
// ==========================================
const VisorVoucher = ({ s3_key, isPdf }: { s3_key: string, isPdf: boolean }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!s3_key) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/vouchers/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3_key_json: s3_key })
    })
      .then(res => res.json())
      .then(data => { if (data.success) setUrl(data.url); })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [s3_key]);

  if (loading) return <div className="h-full w-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  if (!url) return <div className="h-full w-full flex items-center justify-center text-sm text-gray-400 font-medium">No se pudo cargar el archivo</div>;
  
  if (isPdf) {
     return (
       <div className="flex flex-col items-center justify-center h-full w-full bg-gray-50 p-6 text-center">
         <svg className="w-16 h-16 text-red-500 mb-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4-2h-2v-4h2v4zm2-4h-2v-2h2v2z" opacity="0.3"/><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9.5 11.5c0 .83-.67 1.5-1.5 1.5H7v2H5.5V9H8c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V9H13c.83 0 1.5.67 1.5 1.5v3zm4-3.5h-2v1h1.5v1.5H16.5v2H15V9h3.5v1.5zM7 10.5h1v1H7v-1zm4.5 2.5h-1v-3h1v3z"/></svg>
         <p className="text-sm text-gray-600 font-medium mb-4">Documento en formato PDF</p>
         <a href={url} target="_blank" rel="noopener noreferrer" className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm">Abrir PDF en nueva pestaña</a>
       </div>
     );
  }

  return (
    <div className="h-full w-full p-2 flex justify-center items-center">
      <img src={url} alt="Voucher original" className="max-h-[60vh] max-w-full object-contain rounded shadow-sm" />
    </div>
  );
};


// ==========================================
// 3. COMPONENTE: TARJETA DE VOUCHER
// ==========================================
const VoucherCard = ({ voucher, onVerVoucher, isSelected, onToggleSelect, userRole }: any) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  const isPdf = voucher.fileName?.toLowerCase().endsWith('.pdf') || voucher.s3_key?.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    if (voucher.s3_key && !isPdf) {
      setIsLoadingImage(true);
      fetch("/api/vouchers/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key_json: voucher.s3_key })
      })
      .then(res => res.json())
      .then(data => { if (data.success) setImageUrl(data.url); })
      .catch(() => setImageUrl(null))
      .finally(() => setIsLoadingImage(false));
    }
  }, [voucher.s3_key, isPdf]);

  const monto = getVoucherMonto(voucher);
  const simbolo = getVoucherMoneda(voucher);

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all group border-2 ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-gray-200'}`}>
      <div className="h-48 bg-gray-100 border-b border-gray-200 relative flex items-center justify-center overflow-hidden">
        
        {/* 🚨 RBAC: Solo ADMIN ve los checkboxes */}
        {userRole === 'ADMIN' && (
          <div className="absolute top-3 left-3 z-20">
            <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(voucher.PK)} className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow-sm" />
          </div>
        )}

        <div className="absolute top-2 right-2 z-10">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm backdrop-blur-md ${voucher.estado === "RESUELTO" ? "bg-green-100/90 text-green-800 border border-green-200" : "bg-amber-100/90 text-amber-800 border border-amber-200"}`}>
            {voucher.estado === "PENDIENTE_REVISION" ? "EN TRIAJE" : voucher.estado}
          </span>
        </div>

        {isLoadingImage ? (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        ) : isPdf ? (
          <div className="flex flex-col items-center justify-center text-red-400 group-hover:scale-110 transition-transform duration-300">
            <svg className="w-16 h-16 mb-2 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4-2h-2v-4h2v4zm2-4h-2v-2h2v2z" opacity="0.3"/><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9.5 11.5c0 .83-.67 1.5-1.5 1.5H7v2H5.5V9H8c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V9H13c.83 0 1.5.67 1.5 1.5v3zm4-3.5h-2v1h1.5v1.5H16.5v2H15V9h3.5v1.5zM7 10.5h1v1H7v-1zm4.5 2.5h-1v-3h1v3z"/></svg>
            <span className="font-bold text-xs text-red-600 bg-white px-2 py-0.5 rounded shadow-sm">Documento PDF</span>
          </div>
        ) : imageUrl ? (
          <img src={imageUrl} alt="Voucher" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <span className="text-xs font-medium">Sin previsualización</span>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-bold text-sm text-gray-900 line-clamp-2 leading-tight mb-3" title={voucher.fileName}>{voucher.fileName}</h3>
        
        {/* 🚨 CORRECCIÓN FORMATO DE MONEDA */}
        <p className="text-xs text-gray-700 font-bold mb-2">Monto: <span className="font-mono text-indigo-600 text-sm ml-1">{simbolo} {monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>

        <p className="text-[11px] text-gray-500 font-mono mt-auto pt-2 border-t border-gray-100">Subido: {voucher.fecha_importacion ? new Date(voucher.fecha_importacion).toLocaleDateString('es-PE') : '---'}</p>
      </div>

      <div className="p-3 bg-gray-50 border-t border-gray-200">
        <button onClick={() => onVerVoucher(voucher)} className="w-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
          Ver Detalle
        </button>
      </div>
    </div>
  );
};


// ==========================================
// 4. VISTA PRINCIPAL (BOVEDA)
// ==========================================
export default function BovedaView() {
  const { data: session } = useSession();
  
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"TODOS" | "PENDIENTE_REVISION" | "RESUELTO">("TODOS");
  
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // 🚨 REGLAS MULTI-TENANT Y RBAC
  const tenantId = (session?.user as any)?.tenantId || session?.user?.email;
  const userRole = (session?.user as any)?.rol || 'USER';

  const fetchTodosLosVouchers = () => {
    setIsLoading(true);
    fetch("/api/vouchers/all")
      .then(res => res.json())
      .then(data => { 
        if (data.success) {
          setVouchers(data.data); 
          setSelectedIds(new Set()); 
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { 
    if (!tenantId) return;

    fetch(`/api/empresas?tenantId=${encodeURIComponent(tenantId)}`)
      .then(res => res.json())
      .then(data => { if (data.success) setEmpresas(data.data); });

    fetchTodosLosVouchers(); 
  }, [tenantId]);

  const toggleSelectOne = (pk: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(pk)) newSet.delete(pk);
    else newSet.add(pk);
    setSelectedIds(newSet);
  };

  const handleEliminarMasivo = async () => {
    // 🚨 RBAC Lock
    if (userRole !== 'ADMIN') return;

    const vouchersAEliminar = filteredVouchers.filter(v => selectedIds.has(v.PK));
    if (!window.confirm(`ATENCIÓN: Estás a punto de eliminar PERMANENTEMENTE ${vouchersAEliminar.length} documento(s).\n\nSe borrará su input (imagen/pdf), su output (IA) y su registro de procesamiento.\n\n¿Estás completamente seguro?`)) return;

    setIsDeleting(true);
    try {
      const payload = vouchersAEliminar.map(v => ({ PK: v.PK, s3_key: v.s3_key }));
      const res = await fetch("/api/vouchers/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vouchers: payload })
      });
      const data = await res.json();
      if (data.success) {
        setVouchers(prev => prev.filter(v => !selectedIds.has(v.PK)));
        setSelectedIds(new Set());
      } else alert(data.error);
    } catch (e) { alert("Error al intentar limpiar la bóveda."); } 
    finally { setIsDeleting(false); }
  };

  const userRucs = new Set(empresas.map((e: any) => e.ruc));

  const filteredVouchers = vouchers.filter((v) => {
    // Aislamiento Multi-Tenant
    if (!userRucs.has(v.empresa_emisora_ruc)) return false;
    
    const term = searchTerm.toLowerCase();
    const matchSearch = !term || v.fileName?.toLowerCase().includes(term);
    const matchEstado = estadoFiltro === "TODOS" || v.estado === estadoFiltro;
    return matchSearch && matchEstado;
  });

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bóveda Documental</h1>
          <p className="text-gray-500 mt-1">Archivo general de {filteredVouchers.length} comprobantes ingresados al sistema.</p>
        </div>
        <button onClick={fetchTodosLosVouchers} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Refrescar Bóveda
        </button>
      </div>

      <div className="mb-6 flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm items-center">
        <div className="relative flex-1 w-full">
          <input type="text" placeholder="Buscar por nombre de archivo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none" />
        </div>
        
        <div className="flex gap-2 flex-wrap items-center">
          
          {/* 🚨 RBAC: Botón eliminar exclusivo del ADMIN */}
          {userRole === 'ADMIN' && selectedIds.size > 0 && (
            <button onClick={handleEliminarMasivo} disabled={isDeleting} className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 flex items-center gap-2 transition-colors disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              {isDeleting ? "Borrando..." : `Borrar S3 (${selectedIds.size})`}
            </button>
          )}

          <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto shrink-0">
            <button onClick={() => setEstadoFiltro("TODOS")} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${estadoFiltro === "TODOS" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>Todos</button>
            <button onClick={() => setEstadoFiltro("PENDIENTE_REVISION")} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${estadoFiltro === "PENDIENTE_REVISION" ? "bg-amber-100 text-amber-800 shadow-sm" : "text-gray-500"}`}><span className="w-2 h-2 rounded-full bg-amber-500"></span>En Triaje</button>
            <button onClick={() => setEstadoFiltro("RESUELTO")} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${estadoFiltro === "RESUELTO" ? "bg-green-100 text-green-800 shadow-sm" : "text-gray-500"}`}><span className="w-2 h-2 rounded-full bg-green-500"></span>Resueltos</button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div></div>
      ) : filteredVouchers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xl font-medium text-gray-700">La bóveda está vacía</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredVouchers.map(v => (
            <VoucherCard 
              key={v.PK} 
              voucher={v} 
              isSelected={selectedIds.has(v.PK)} 
              onToggleSelect={toggleSelectOne} 
              onVerVoucher={setSelectedVoucher} 
              userRole={userRole} 
            />
          ))}
        </div>
      )}

      {/* 🚨 NUEVO: MODAL MAESTRO "VER" (Reporte IA + S3) */}
      {selectedVoucher && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={() => setSelectedVoucher(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-inner">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                </div>
                Detalle del Documento
              </h2>
              <button onClick={() => setSelectedVoucher(null)} className="text-gray-400 hover:text-gray-700 text-3xl leading-none transition-colors">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-white custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* PANEL IZQUIERDO: S3 Visual */}
              <div className="flex flex-col h-full border-b md:border-b-0 md:border-r border-gray-100 pb-6 md:pb-0 md:pr-6">
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Comprobante Físico</h3>
                {selectedVoucher.fileName && (
                  <p className="text-xs font-mono text-gray-500 bg-gray-50 border border-gray-200 p-2 rounded truncate shadow-sm mb-3">
                    Origen: {selectedVoucher.fileName}
                  </p>
                )}
                <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden relative min-h-[350px]">
                  <VisorVoucher 
                    s3_key={selectedVoucher.s3_key} 
                    isPdf={selectedVoucher.fileName?.toLowerCase().endsWith('.pdf') || selectedVoucher.s3_key?.toLowerCase().endsWith('.pdf')} 
                  />
                </div>
              </div>

              {/* PANEL DERECHO: Diagnóstico de Inteligencia Artificial */}
              <div className="flex flex-col h-full md:pl-2">
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Diagnóstico Inteligencia Artificial</h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                   {selectedVoucher.conciliacion || selectedVoucher.candidatos_kb ? (
                     <ReporteIAHumano data={selectedVoucher.conciliacion || selectedVoucher.candidatos_kb} />
                   ) : (
                     <div className="bg-amber-50 border border-amber-200 text-amber-800 p-8 rounded-xl h-full flex flex-col justify-center items-center text-center min-h-[300px]">
                       <svg className="w-16 h-16 text-amber-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                       <h3 className="font-bold text-lg mb-2">Sin Reporte de IA</h3>
                       <p className="text-sm font-medium">Este comprobante no ha sido procesado o no cuenta con datos de Inteligencia Artificial.</p>
                     </div>
                   )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}