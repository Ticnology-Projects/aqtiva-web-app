"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

// ==========================================
// COMPONENTE: VISOR DE IMAGEN DEL VOUCHER
// ==========================================
const VisorVoucher = ({ s3_key }: { s3_key: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  if (loading) return <div className="h-full min-h-[300px] flex items-center justify-center bg-gray-50 rounded-xl border border-dashed"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  if (!url) return <div className="h-full min-h-[300px] bg-gray-50 rounded-xl border border-dashed flex items-center justify-center text-sm text-gray-400 font-medium">No se pudo cargar la imagen</div>;
  
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-100 p-2 flex justify-center items-center shadow-inner h-full max-h-[70vh]">
      <img src={url} alt="Voucher físico" className="max-h-full max-w-full object-contain rounded shadow-sm" />
    </div>
  );
};

// ==========================================
// COMPONENTE: REPORTE LEGIBLE DE IA
// ==========================================
const ReporteIAHumano = ({ data }: { data: any }) => {
  let d = data;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) {} }

  if (!d || !d.nivel_confianza) {
    return <div className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs overflow-auto font-mono"><pre>{JSON.stringify(d, null, 2)}</pre></div>;
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
  const coincidentes = getArray(d.campos_coincidentes);
  const discrepantes = getArray(d.campos_discrepantes);

  return (
    <div className="space-y-5 text-gray-800 animate-fadeIn h-full overflow-y-auto pr-2 pb-8">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center shadow-sm">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Confianza IA</span>
          <span className={`text-xl font-black ${nivel === 'ALTO' ? 'text-green-600' : nivel === 'AMBIGUO' ? 'text-amber-500' : 'text-red-500'}`}>{nivel}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center shadow-sm">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Score BD</span>
          <span className="text-xl font-black text-indigo-600 font-mono">{Number(score || 0).toFixed(4)}</span>
        </div>
      </div>
      <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 shadow-sm">
        <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-widest mb-2 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Razonamiento del Algoritmo
        </h4>
        <p className="text-sm text-indigo-900 leading-relaxed font-medium">{justificacion}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 pt-2">
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            Campos Coincidentes
          </h4>
          <div className="flex flex-wrap gap-2">
            {coincidentes.length > 0 ? coincidentes.map((c: string, i: number) => (
              <span key={i} className="bg-green-50 border border-green-200 text-green-700 px-2.5 py-1 rounded text-[10px] font-bold uppercase">{c.replace(/_/g, ' ')}</span>
            )) : <span className="text-xs text-gray-400">Ninguno detectado</span>}
          </div>
        </div>
        <div className="mt-2">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            Campos Discrepantes
          </h4>
          <div className="flex flex-wrap gap-2">
            {discrepantes.length > 0 ? discrepantes.map((c: string, i: number) => (
              <span key={i} className="bg-red-50 border border-red-200 text-red-700 px-2.5 py-1 rounded text-[10px] font-bold uppercase">{c.replace(/_/g, ' ')}</span>
            )) : <span className="text-xs text-gray-400">Ninguno detectado</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function AuditoriaView() {
  const { data: session } = useSession();
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [auditorias, setAuditorias] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [isLoadingAuditoria, setIsLoadingAuditoria] = useState(false);
  
  const [auditParaVerIA, setAuditParaVerIA] = useState<any | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState<"TODOS" | "AUTO_IA" | "MANUAL">("TODOS");

  const fetchAuditoria = () => {
    setIsLoadingAuditoria(true);
    Promise.all([
      fetch("/api/auditoria").then(res => res.json()),
      fetch("/api/vouchers/all").then(res => res.json())
    ])
      .then(([dataAud, dataVou]) => {
        if (dataAud.success) setAuditorias(dataAud.data);
        if (dataVou.success) setVouchers(dataVou.data);
      })
      .catch((err) => console.error("Error cargando auditoría:", err))
      .finally(() => setIsLoadingAuditoria(false));
  };

  useEffect(() => {
    if (!session?.user?.email) return;

    fetch(`/api/empresas?usuarioId=${encodeURIComponent(session.user.email)}`)
      .then(res => res.json())
      .then(dataEmp => {
        if (dataEmp.success) {
          setEmpresas(dataEmp.data);
          fetchAuditoria(); 
        }
      })
      .catch(err => console.error("Error cargando empresas:", err));
  }, [session]);

  const handleReversar = async (audit: any) => {
    const msg = audit.tipo_accion === "ADJUNTO_MANUAL"
      ? `¿Reversar el adjunto de la factura ${audit.numero_documento}?\n\nLa factura seguirá "COBRADA", solo se le eliminará el comprobante visual.`
      : `¿Reversar la conciliación de la factura ${audit.numero_documento}?\n\nLa factura volverá a estar "PENDIENTE" y el voucher regresará a tu bandeja de Triaje.`;

    if (!window.confirm(msg)) return;

    try {
      const res = await fetch("/api/facturas/reversar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          PK: audit.PK,
          numero_documento: audit.numero_documento,
          factura_vinculada_pk: audit.factura_vinculada_pk,
          voucher_vinculado: audit.voucher_vinculado,
          tipo_accion: audit.tipo_accion || "CONCILIACION"
        })
      });

      const data = await res.json();
      if (data.success) {
        alert("Conciliación reversada correctamente.");
        fetchAuditoria(); 
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error al intentar reversar la conciliación.");
    }
  };

  const handleEliminarAuditoria = async (audit: any) => {
    if (!window.confirm(`ADVERTENCIA: ¿Deseas eliminar permanentemente el ticket de auditoría de ${audit.numero_documento} del sistema? Esta acción no se puede deshacer.`)) return;

    try {
      const res = await fetch("/api/auditoria/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_pk: audit.PK })
      });
      const data = await res.json();
      if (data.success) {
        setAuditorias(prev => prev.filter(a => a.PK !== audit.PK));
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Error al intentar eliminar el registro de auditoría.");
    }
  };

  const handleExportarBackup = () => {
    const cabeceras = ["Fecha y Hora", "ID Ticket", "Documento", "Voucher", "Estado", "Acción"];
    
    const userRucs = new Set(empresas.map((e: any) => e.ruc));
    const auditoriasDelUsuario = auditorias.filter(audit => {
      const rucTicket = audit.empresa_emisora_ruc || (audit.factura_vinculada_pk ? audit.factura_vinculada_pk.split('#')[1] : null);
      return rucTicket && userRucs.has(rucTicket);
    });

    const filas = auditoriasDelUsuario.map(audit => [
      new Date(audit.fecha_registro).toLocaleString('es-PE'),
      audit.PK.replace("AUDIT#", ""),
      audit.numero_documento,
      audit.voucher_vinculado ? audit.voucher_vinculado.split('/').pop() : "Manual",
      audit.estado,
      audit.tipo_accion || "CONCILIACION"
    ]);

    const contenidoCSV = [cabeceras.join(";"), ...filas.map(fila => fila.join(";"))].join("\n");
    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Backup_Auditoria_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🚨 FUNCIÓN MEJORADA: Decide dinámicamente si mostrar la imagen
  const handleVerDetalle = (audit: any) => {
    if (!audit.voucher_vinculado) {
      alert("Esta conciliación fue estrictamente manual sin voucher asociado.");
      return;
    }

    const esFacturaReal = audit.numero_documento !== "VOUCHER";
    const voucherEncontrado = vouchers.find(v => v.s3_key === audit.voucher_vinculado);

    if (voucherEncontrado && voucherEncontrado.conciliacion) {
      setAuditParaVerIA({
        ...voucherEncontrado.conciliacion,
        _fileName: voucherEncontrado.fileName,
        _s3_key: audit.voucher_vinculado,
        _showImage: esFacturaReal
      });
    } else {
      // Si fue manual (sin IA) pero sí hay una factura vinculada, mostramos la imagen
      if (esFacturaReal) {
        setAuditParaVerIA({
          nivel_confianza: null,
          _fileName: audit.voucher_vinculado.split('/').pop(),
          _s3_key: audit.voucher_vinculado,
          _showImage: true
        });
      } else {
        alert("Este registro no cuenta con un análisis de Inteligencia Artificial disponible.");
      }
    }
  };

  const userRucs = new Set(empresas.map((e: any) => e.ruc));

  const filteredAuditorias = auditorias.filter(audit => {
    const rucTicket = audit.empresa_emisora_ruc || (audit.factura_vinculada_pk ? audit.factura_vinculada_pk.split('#')[1] : null);
    if (!rucTicket || !userRucs.has(rucTicket)) return false;

    if (filtroOrigen === "AUTO_IA" && audit.tipo_accion !== "AUTO_CONCILIACION") return false;
    if (filtroOrigen === "MANUAL" && (audit.tipo_accion === "AUTO_CONCILIACION" || audit.tipo_accion === "REVERSION")) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const idStr = audit.PK.replace("AUDIT#", "").toLowerCase();
    const docStr = audit.numero_documento?.toLowerCase() || "";
    const voucherStr = audit.voucher_vinculado ? audit.voucher_vinculado.split('/').pop()?.toLowerCase() : "manual";
    const accionStr = (audit.tipo_accion || "CONCILIACION").toLowerCase();
    
    return idStr.includes(term) || docStr.includes(term) || voucherStr.includes(term) || accionStr.includes(term);
  });

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial de Conciliaciones</h1>
          <p className="text-gray-500 mt-1">Registro inmutable de todas las facturas procesadas y pagadas.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAuditoria} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2">
            Refrescar Historial
          </button>
          <button onClick={handleExportarBackup} className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors shadow-sm flex items-center gap-2">
            Exportar Backup (CSV)
          </button>
        </div>
      </div>

      <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        
        <div className="relative w-full md:flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input 
            type="text" 
            placeholder="Buscar por ID de ticket, documento, comprobante o acción..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg leading-5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-sm outline-none transition-all" 
          />
        </div>

        <div className="flex bg-gray-100 p-1 rounded-lg w-full md:w-auto shrink-0">
          <button onClick={() => setFiltroOrigen("TODOS")} className={`px-4 py-1.5 rounded-md text-sm font-bold flex-1 md:flex-none ${filtroOrigen === "TODOS" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>Todos</button>
          <button onClick={() => setFiltroOrigen("AUTO_IA")} className={`px-4 py-1.5 rounded-md text-sm font-bold flex items-center justify-center gap-1 flex-1 md:flex-none ${filtroOrigen === "AUTO_IA" ? "bg-indigo-100 text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            🤖 Auto IA
          </button>
          <button onClick={() => setFiltroOrigen("MANUAL")} className={`px-4 py-1.5 rounded-md text-sm font-bold flex items-center justify-center gap-1 flex-1 md:flex-none ${filtroOrigen === "MANUAL" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
            👤 Manual
          </button>
        </div>

      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoadingAuditoria ? (
          <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : filteredAuditorias.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg font-medium">No hay registros que coincidan con tu búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Fecha y Hora</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Ticket de Auditoría (ID)</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Factura Afectada</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Voucher Comprobante</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-500">Estado de Cierre</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAuditorias.map((audit, idx) => {
                  const fechaFormat = new Date(audit.fecha_registro).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
                  const voucherName = audit.voucher_vinculado ? audit.voucher_vinculado.split('/').pop() : "Manual";

                  return (
                    <tr key={idx} className={`hover:bg-gray-50 transition-colors ${audit.estado === "ANULADO" ? "opacity-60" : ""}`}>
                      <td className="px-6 py-4 font-medium text-gray-600">{fechaFormat}</td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200">
                          {audit.PK.replace("AUDIT#", "").substring(0, 20)}...
                        </span>
                      </td>
                      <td className={`px-6 py-4 font-bold ${audit.estado === "ANULADO" ? "text-gray-500 line-through" : "text-indigo-700"}`}>
                        <button 
                          onClick={() => handleVerDetalle(audit)}
                          className="focus:outline-none text-left hover:underline hover:text-indigo-900 transition-colors"
                          title="Ver detalles de la conciliación"
                        >
                          {audit.numero_documento}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                          <span className="text-gray-700 font-medium text-xs truncate max-w-[150px]" title={voucherName}>{voucherName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${audit.estado === 'ANULADO' ? 'bg-red-100 text-red-800 border-red-200' :
                          audit.estado === 'AUDITADO' ? 'bg-green-100 text-green-800 border-green-200' :
                            'bg-gray-100 text-gray-800 border-gray-200'
                          }`}>
                          {audit.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {audit.estado === "AUDITADO" && audit.tipo_accion !== "REVERSION" && (
                            <button onClick={() => handleReversar(audit)} className="text-red-600 hover:text-red-900 font-semibold text-xs border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-colors">
                              Reversar
                            </button>
                          )}
                          <button onClick={() => handleEliminarAuditoria(audit)} className="text-gray-500 hover:text-gray-800 font-semibold text-xs border border-gray-200 hover:border-gray-400 bg-white hover:bg-gray-100 px-3 py-1.5 rounded transition-colors" title="Borrar registro permanentemente">
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🚨 MODAL DEL REPORTE IA (Se activa al dar clic en el nombre de la factura) */}
      {auditParaVerIA && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={() => setAuditParaVerIA(null)}>
          <div className={`bg-white rounded-2xl shadow-2xl w-full ${auditParaVerIA._showImage ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh] flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                {auditParaVerIA._showImage ? '📸 Detalle de la Conciliación' : '🤖 Detalles del Análisis IA'}
              </h2>
              <button onClick={() => setAuditParaVerIA(null)} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">&times;</button>
            </div>
            
            <div className={`p-6 overflow-y-auto flex-1 bg-white custom-scrollbar ${auditParaVerIA._showImage ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : ''}`}>
              
              {/* 🚨 LADO IZQUIERDO: LA IMAGEN DEL VOUCHER */}
              {auditParaVerIA._showImage && (
                <div className="flex flex-col space-y-3 h-full">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Comprobante Físico</h3>
                  {auditParaVerIA._fileName && (
                    <p className="text-xs font-mono text-gray-500 bg-gray-50 border border-gray-200 p-2 rounded truncate shadow-sm">
                      Origen: {auditParaVerIA._fileName}
                    </p>
                  )}
                  <div className="flex-1">
                    <VisorVoucher s3_key={auditParaVerIA._s3_key} />
                  </div>
                </div>
              )}
              
              {/* 🚨 LADO DERECHO: EL REPORTE DE IA O MENSAJE MANUAL */}
              <div className="flex flex-col h-full">
                  {!auditParaVerIA._showImage && auditParaVerIA._fileName && (
                    <p className="text-sm font-mono text-gray-500 mb-4 bg-gray-100 p-2 rounded truncate">Comprobante de origen: {auditParaVerIA._fileName}</p>
                  )}
                  
                  {auditParaVerIA.nivel_confianza ? (
                    <ReporteIAHumano data={auditParaVerIA} />
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-8 rounded-xl h-full flex flex-col justify-center items-center text-center min-h-[300px]">
                       <svg className="w-16 h-16 text-amber-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                       <h3 className="font-bold text-xl mb-2">Conciliación Manual</h3>
                       <p className="text-sm font-medium">Esta factura fue vinculada al voucher de manera manual por el auditor o usando el buscador avanzado. No existe un diagnóstico de la Inteligencia Artificial para esta transacción específica.</p>
                    </div>
                  )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}