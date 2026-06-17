"use client";
import { useState, useEffect } from "react";

// ==========================================
// COMPONENTE INTERNO: REPORTE LEGIBLE DE IA
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

// ==========================================
// MODAL PRINCIPAL
// ==========================================
export default function ResolucionModal({ voucher, onClose, onConfirm, isResolving, empresas = [] }: any) {
  const [manualSelection, setManualSelection] = useState<any | null>(null);
  const [voucherImageUrl, setVoucherImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"VISOR" | "ANALISIS">("VISOR");

  const [isSearchingManual, setIsSearchingManual] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allFacturas, setAllFacturas] = useState<any[]>([]);
  const [isLoadingFacturas, setIsLoadingFacturas] = useState(false);

  useEffect(() => {
    if (voucher?.s3_key) {
      setIsLoadingImage(true);
      fetch("/api/vouchers/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key_json: voucher.s3_key })
      })
        .then(res => res.json())
        .then(data => { if (data.success) setVoucherImageUrl(data.url); })
        .finally(() => setIsLoadingImage(false));
    }
  }, [voucher]);

  if (!voucher) return null;

  const isPdf = voucher.fileName?.toLowerCase().endsWith('.pdf') || voucherImageUrl?.toLowerCase().includes('.pdf');
  const nombreEmpresaVoucher = empresas.find((e: any) => e.ruc === voucher.empresa_emisora_ruc)?.nombreOriginal || voucher.empresa_emisora_ruc || "Empresa Desconocida";

  // 🚨 NUEVO: Ahora extraemos la Fecha de Emisión del string de la Knowledge Base
  const parseCandidato = (contenido: string) => {
    const docMatch = contenido.match(/Documento:\s*(.+?)(?=\s*Cliente:|$)/);
    const clienteMatch = contenido.match(/Cliente:\s*(.+?)(?=\s*RUC Cliente:|$)/);
    const montoMatch = contenido.match(/Monto Total:\s*(.+?)(?=\s*Moneda:|$)/);
    const fechaMatch = contenido.match(/Fecha Emisión:\s*(\S+)/); // Captura el DD/MM/AAAA al final
    
    const numDoc = docMatch ? docMatch[1].trim() : "Desconocido";

    return {
      PK: `INVOICE#${voucher.empresa_emisora_ruc}#${numDoc}`,
      numero_documento: numDoc,
      cliente: clienteMatch ? clienteMatch[1].trim() : "---",
      monto_total: montoMatch ? montoMatch[1].trim() : "0.00",
      fecha_emision: fechaMatch ? fechaMatch[1].trim() : "---" // <- FECHA EXTRAÍDA
    };
  };

  const handleConfirmClick = () => {
    let facturaFinal = manualSelection;
    if (!facturaFinal && voucher.conciliacion?.factura_sugerida) {
      facturaFinal = {
        ...voucher.conciliacion.factura_sugerida,
        PK: `INVOICE#${voucher.empresa_emisora_ruc}#${voucher.conciliacion.factura_sugerida.numero_documento}`
      };
    }
    if (facturaFinal) onConfirm(facturaFinal);
  };

  const handleOpenSearch = () => {
    setIsSearchingManual(true);
    if (allFacturas.length === 0) {
      setIsLoadingFacturas(true);
      fetch("/api/facturas")
        .then(res => res.json())
        .then(data => { if (data.success) setAllFacturas(data.data.filter((f: any) => f.estado !== "COBRADO")); })
        .finally(() => setIsLoadingFacturas(false));
    }
  };

  const searchResults = searchQuery.trim() === "" ? [] : allFacturas.filter((f) => {
    const term = searchQuery.toLowerCase();
    return f.numero_documento?.toLowerCase().includes(term) || f.cliente?.toLowerCase().includes(term) || f.empresa_emisora_nombre?.toLowerCase().includes(term) || String(f.monto || "").includes(term);
  }).slice(0, 8);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[90vw] h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${voucher.conciliacion?.nivel_confianza === "ALTO" ? "bg-green-500" : voucher.conciliacion?.nivel_confianza === "AMBIGUO" ? "bg-amber-500" : "bg-red-500"}`}></span>
              Resolución Asistida
            </h2>
            <p className="text-sm text-gray-500 mt-1 font-mono">{voucher.fileName} <span className="text-indigo-600 font-bold ml-2 px-2 py-0.5 bg-indigo-50 rounded">🏢 {nombreEmpresaVoucher}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* ================= COLUMNA IZQUIERDA (Pestañas Dinámicas) ================= */}
          <div className="w-full lg:w-[45%] bg-gray-100 border-r border-gray-200 flex flex-col relative overflow-hidden">
            
            <div className="flex bg-gray-200/50 p-2 shrink-0 gap-2 border-b border-gray-300">
              <button 
                onClick={() => setActiveTab("VISOR")} 
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all shadow-sm ${activeTab === "VISOR" ? "bg-white text-indigo-700 ring-1 ring-gray-300" : "text-gray-500 hover:bg-gray-200"}`}
              >
                Comprobante Físico
              </button>
              <button 
                onClick={() => setActiveTab("ANALISIS")} 
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all shadow-sm flex items-center justify-center gap-1 ${activeTab === "ANALISIS" ? "bg-indigo-600 text-white ring-1 ring-indigo-700" : "bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Ver Análisis IA
              </button>
            </div>

            <div className="flex-1 p-4 overflow-hidden relative">
              {activeTab === "VISOR" ? (
                <div className="w-full h-full bg-white rounded-xl border border-gray-300 overflow-hidden flex items-center justify-center relative shadow-inner">
                  {isLoadingImage ? (
                    <div className="flex flex-col items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                      <span className="text-sm text-indigo-500 font-medium">Desencriptando S3...</span>
                    </div>
                  ) : voucherImageUrl ? (
                    isPdf ? (
                      <div className="flex flex-col items-center justify-center text-center p-8 w-full h-full bg-gray-50">
                        <div className="w-20 h-20 mb-4 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center shadow-sm">
                          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                        </div>
                        <h4 className="text-lg font-bold text-gray-800 mb-1">Documento PDF</h4>
                        <p className="text-sm text-gray-500 mb-6">El archivo contiene múltiples páginas o no puede previsualizarse.</p>
                        <a href={voucherImageUrl} target="_blank" rel="noreferrer" className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md">
                          Haz click para ver archivo completo
                        </a>
                      </div>
                    ) : (
                      <a href={voucherImageUrl} target="_blank" rel="noreferrer" title="Haz click para ver en HD" className="w-full h-full flex items-center justify-center cursor-zoom-in p-2">
                        <img src={voucherImageUrl} alt="Voucher" className="max-w-full max-h-full object-contain" />
                      </a>
                    )
                  ) : (
                    <p className="text-red-500 text-sm font-medium">No se pudo cargar el documento.</p>
                  )}
                </div>
              ) : (
                <div className="w-full h-full bg-gray-50/50 rounded-xl overflow-hidden p-2">
                  <ReporteIAHumano data={voucher.conciliacion} />
                </div>
              )}
            </div>
          </div>

          {/* ================= COLUMNA DERECHA (Asignación) ================= */}
          <div className="w-full lg:w-[55%] flex flex-col flex-1 overflow-hidden bg-white">
            <div className="p-6 bg-gray-50 border-b border-gray-200 shrink-0">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4">Sugerencia del Algoritmo</h3>
              {voucher.conciliacion?.factura_sugerida ? (
                <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Documento Seleccionado</span>
                    <span className="text-2xl font-bold text-indigo-700 font-mono">{voucher.conciliacion.factura_sugerida.numero_documento}</span>
                    {/* 🚨 NUEVO: Muestra fecha de emisión en la sugerencia */}
                    <p className="text-[10px] text-indigo-600 font-bold uppercase mt-1">
                      🏢 {nombreEmpresaVoucher} <span className="text-gray-300 mx-1">|</span> 📅 Emisión: {voucher.conciliacion.factura_sugerida.fecha_emision || "N/A"}
                    </p>
                    <p className="text-sm font-medium text-gray-800 mt-1">{voucher.conciliacion.factura_sugerida.cliente}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Monto Detectado</span>
                    <span className="text-xl font-bold text-gray-900">S/ {voucher.conciliacion.factura_sugerida.monto_total}</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">
                  Sin sugerencia segura. Por favor, selecciona un candidato abajo o realiza una búsqueda manual.
                </div>
              )}
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Candidatos en Base de Datos</h3>
              
              {(!voucher.candidatos_kb || voucher.candidatos_kb.length === 0) ? (
                 <p className="text-gray-500 text-sm">No se encontraron facturas similares.</p>
              ) : (
                <div className="space-y-3">
                  {voucher.candidatos_kb.map((c: any, i: number) => {
                    const parsed = parseCandidato(c.contenido);
                    const isManual = manualSelection?.PK === parsed.PK;
                    const isSuggested = voucher.conciliacion?.factura_sugerida?.numero_documento === parsed.numero_documento;
                    
                    return (
                      <div key={i} onClick={() => setManualSelection(parsed)} className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${isManual ? "border-green-500 bg-green-50" : isSuggested ? "border-indigo-400 bg-indigo-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className={`font-bold text-lg ${isManual ? "text-green-900" : isSuggested ? "text-indigo-900" : "text-gray-900"}`}>{parsed.numero_documento}</h4>
                              {isSuggested && !isManual && <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Sugerido</span>}
                              {isManual && <span className="bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Seleccionado</span>}
                            </div>
                            {/* 🚨 NUEVO: Muestra fecha de emisión en la lista de candidatos KB */}
                            <p className="text-[10px] text-indigo-600 font-bold uppercase mt-1">
                              🏢 {nombreEmpresaVoucher} <span className="text-gray-300 mx-1">|</span> 📅 Emisión: {parsed.fecha_emision}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">{parsed.cliente}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">S/ {parsed.monto_total}</p>
                            <p className="text-xs text-gray-500 mt-1">Score IA: {c.score}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 border-t border-gray-200 pt-5">
                {!isSearchingManual ? (
                  <button onClick={handleOpenSearch} className="text-indigo-600 hover:text-indigo-800 text-sm font-bold flex items-center gap-2 transition-colors bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-lg w-full justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    ¿No está en la lista? Buscar factura manualmente
                  </button>
                ) : (
                  <div className="animate-fadeIn bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-inner">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Búsqueda Global</h4>
                      <button onClick={() => { setIsSearchingManual(false); setSearchQuery(""); }} className="text-gray-400 hover:text-gray-700 text-xs font-bold">Cerrar</button>
                    </div>
                    
                    <input type="text" placeholder="Escribe el nro de documento, cliente o EMPRESA..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white mb-4 shadow-sm" autoFocus />

                    {isLoadingFacturas ? (
                      <div className="text-center text-xs text-gray-500 py-4 font-medium flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div> Cargando catálogo...</div>
                    ) : searchResults.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {searchResults.map((f, i) => {
                          const isSelected = manualSelection?.PK === f.PK;
                          return (
                            <div key={i} onClick={() => setManualSelection({ PK: f.PK, numero_documento: f.numero_documento, cliente: f.cliente, monto_total: f.monto, ruc: f.ruc_cliente })} className={`border rounded-lg p-3 cursor-pointer transition-colors ${isSelected ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-indigo-300 bg-white shadow-sm"}`}>
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h5 className={`font-bold text-sm ${isSelected ? "text-green-900" : "text-gray-800"}`}>{f.numero_documento}</h5>
                                    {isSelected && <span className="bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Seleccionado</span>}
                                  </div>
                                  {/* 🚨 NUEVO: Muestra fecha de emisión en la Búsqueda Manual */}
                                  <p className="text-[10px] text-indigo-600 font-bold uppercase mt-1">
                                    🏢 {f.empresa_emisora_nombre} <span className="text-gray-300 mx-1">|</span> 📅 Emisión: {f.fecha_emision || "N/A"}
                                  </p>
                                  <p className="text-xs text-gray-600 mt-1 truncate max-w-[200px]">{f.cliente}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-sm text-gray-900">S/ {f.monto}</p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : searchQuery.trim() !== "" ? (
                       <div className="text-center text-xs text-gray-500 py-4 font-medium">No hay coincidencias para "{searchQuery}"</div>
                    ) : (
                      <div className="text-center text-xs text-gray-400 py-4">Empieza a escribir para buscar...</div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between shrink-0">
          <button onClick={onClose} className="text-gray-600 font-medium hover:text-gray-900 px-4 py-2">Cancelar</button>
          <button onClick={handleConfirmClick} disabled={isResolving || (!voucher.conciliacion?.factura_sugerida && !manualSelection)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-lg font-bold shadow-md disabled:opacity-50 disabled:bg-gray-400 transition-colors">
            {isResolving ? "Guardando..." : "Confirmar Conciliación"}
          </button>
        </div>
      </div>
    </div>
  );
}