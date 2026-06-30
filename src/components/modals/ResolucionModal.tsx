"use client";

import { useState, useEffect } from "react";
import { Search, Plus } from "lucide-react";

// Parser Seguro (Normaliza llaves a minúsculas para evitar colisiones)
const parseEsquemaKB = (txt: string) => {
  if (!txt) return {};
  const cleanTxt = txt.replace(/\*/g, "");
  const camposMaestros = [
    { key: "número documento", labels: ["número documento", "numero documento", "documento"] },
    { key: "cliente", labels: ["cliente", "razón social", "razon social"] },
    { key: "ruc cliente", labels: ["ruc cliente", "ruc"] },
    { key: "monto total bruto", labels: ["monto total bruto", "monto total", "monto bruto"] },
    { key: "moneda", labels: ["moneda", "divisa"] },
    { key: "fecha emisión", labels: ["fecha emisión", "fecha emision"] },
    { key: "fecha vencimiento", labels: ["fecha vencimiento"] },
    { key: "sujeto a detracción", labels: ["sujeto a detracción", "sujeto a detraccion"] },
    { key: "tasa detracción", labels: ["tasa detracción", "tasa detraccion"] },
    { key: "monto detracción", labels: ["monto detracción", "monto detraccion"] },
    { key: "monto neto a pagar", labels: ["monto neto a pagar"] },
    { key: "estado", labels: ["estado"] }
  ];

  const info: Record<string, string> = {};
  const coincidenciaPosiciones: Array<{ key: string; index: number; length: number }> = [];

  camposMaestros.forEach(({ key, labels }) => {
    labels.forEach(label => {
      const regex = new RegExp(label + "\\s*:", "gi");
      let match;
      while ((match = regex.exec(cleanTxt)) !== null) {
        coincidenciaPosiciones.push({ key, index: match.index, length: match[0].length });
      }
    });
  });

  coincidenciaPosiciones.sort((a, b) => {
    if (a.index === b.index) return b.length - a.length;
    return a.index - b.index;
  });

  const validPosiciones: Array<{ key: string; index: number; length: number }> = [];
  for (const pos of coincidenciaPosiciones) {
    const prev = validPosiciones[validPosiciones.length - 1];
    if (!prev || pos.index >= prev.index + prev.length) {
      validPosiciones.push(pos);
    }
  }

  for (let i = 0; i < validPosiciones.length; i++) {
    const actual = validPosiciones[i];
    const inicioValor = actual.index + actual.length;
    const finValor = (i + 1 < validPosiciones.length) ? validPosiciones[i + 1].index : cleanTxt.length;
    const valorExtraido = cleanTxt.substring(inicioValor, finValor).trim();
    if (!info[actual.key]) info[actual.key] = valorExtraido;
  }

  return info;
};

const getMontoSeguro = (conciliacion: any) => {
  if (!conciliacion) return 0;
  let monto = Number(conciliacion.importe_pagado);
  if (monto && !isNaN(monto) && monto > 0) return monto;
  monto = Number(conciliacion.factura_sugerida?.monto_neto_aplicado);
  if (monto && !isNaN(monto) && monto > 0) return monto;
  monto = Number(conciliacion.facturas_sugeridas?.[0]?.monto_neto_aplicado);
  if (monto && !isNaN(monto) && monto > 0) return monto;
  return 0;
};

function getModalCurrencySymbol(monedaStr: string) {
  if (!monedaStr) return "S/";
  const m = monedaStr.toUpperCase();
  if (m === "USD" || m.includes("DOLAR") || m.includes("DÓLAR")) return "$";
  if (m === "EUR" || m.includes("EURO")) return "€";
  return "S/";
}

interface ResolucionModalProps {
  voucher: any;
  onClose: () => void;
  onConfirm: (payload: any) => void;
  isResolving: boolean;
  empresas: any[];
}

export default function ResolucionModal({ voucher, onClose, onConfirm, isResolving, empresas }: ResolucionModalProps) {
  const [voucherImageUrl, setVoucherImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // Estados para el control manual (Checkboxes)
  const [facturasDisponibles, setFacturasDisponibles] = useState<any[]>([]);
  const [selectedFacturas, setSelectedFacturas] = useState<Set<string>>(new Set());

  // Estados para Búsqueda Manual
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Inicializar la vista cuando se abre un voucher
  useEffect(() => {
    if (!voucher) {
      setVoucherImageUrl(null);
      return;
    }

    // 1. Cargar imagen de S3
    setIsLoadingImage(true);
    fetch("/api/vouchers/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3_key_json: voucher.s3_key })
    })
      .then(res => res.json())
      .then(data => { if (data.success) setVoucherImageUrl(data.url); })
      .finally(() => setIsLoadingImage(false));

    // 2. Procesar y cargar las facturas candidatas de la IA
    const candidatasProcesadas = (voucher.candidatos_kb || []).map((cand: any) => {
      const info = parseEsquemaKB(cand.contenido);
      const numDoc = info["número documento"] || info["documento"];
      if (!numDoc) return null;

      const tieneDetraccion = info["sujeto a detracción"] === "SI" || info["sujeto a detraccion"] === "SI";
      return {
        PK: `INVOICE#${voucher.empresa_emisora_ruc}#${numDoc}`,
        numero_documento: numDoc,
        cliente: info["cliente"] || "Desconocido",
        ruc_cliente: info["ruc cliente"] || "",
        moneda: info["moneda"] || "PEN",
        fecha_vencimiento: info["fecha vencimiento"] || "---",
        monto_total: Number(info["monto total bruto"] || info["monto total"] || "0"),
        monto_neto: Number(info["monto neto a pagar"] || "0"),
        tiene_detraccion: tieneDetraccion,
        tasa_detraccion: info["tasa detracción"] || info["tasa detraccion"] || "0%",
        is_ia_suggestion: true
      };
    }).filter(Boolean);

    setFacturasDisponibles(candidatasProcesadas);

    // 3. Pre-seleccionar (marcar Checkbox) a las facturas que la IA sugirió en Lote o 1:1
    const sugeridasPorIA = new Set<string>();
    if (voucher.conciliacion?.tipo_conciliacion === "LOTE") {
      voucher.conciliacion.facturas_sugeridas?.forEach((f: any) => sugeridasPorIA.add(f.numero_documento));
    } else if (voucher.conciliacion?.factura_sugerida) {
      sugeridasPorIA.add(voucher.conciliacion.factura_sugerida.numero_documento);
    } else if (voucher.conciliacion?.facturas_sugeridas?.[0]) {
      sugeridasPorIA.add(voucher.conciliacion.facturas_sugeridas[0].numero_documento);
    }
    setSelectedFacturas(sugeridasPorIA);

  }, [voucher]);

  // Funciones de Búsqueda Manual de Facturas
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 3) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(() => {
      setIsSearching(true);
      fetch(`/api/facturas/buscar?rucEmisor=${voucher.empresa_emisora_ruc}&q=${encodeURIComponent(searchTerm)}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setSearchResults(data.data);
        })
        .finally(() => setIsSearching(false));
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm, voucher]);

  const handleAgregarFacturaBuscada = (facturaDb: any) => {
    if (facturasDisponibles.some(f => f.numero_documento === facturaDb.numero_documento)) {
      alert("Esta factura ya está en la lista.");
      return;
    }

    const nuevaFactura = {
      PK: facturaDb.PK,
      numero_documento: facturaDb.numero_documento,
      cliente: facturaDb.cliente || "Desconocido",
      ruc_cliente: facturaDb.ruc_cliente || "",
      moneda: facturaDb.moneda || "PEN",
      fecha_vencimiento: facturaDb.fecha_vencimiento || "---",
      monto_total: Number(facturaDb.monto || "0"),
      monto_neto: Number(facturaDb.monto_neto_pagar || facturaDb.monto || "0"), 
      tiene_detraccion: facturaDb.tiene_detraccion === 'true' || facturaDb.tiene_detraccion === true,
      tasa_detraccion: facturaDb.tasa_detraccion || "0%",
      is_ia_suggestion: false 
    };

    setFacturasDisponibles([nuevaFactura, ...facturasDisponibles]);
    toggleFacturaSelection(nuevaFactura.numero_documento);
    setSearchTerm("");
    setSearchResults([]);
  };

  const toggleFacturaSelection = (numDoc: string) => {
    const newSelected = new Set(selectedFacturas);
    if (newSelected.has(numDoc)) newSelected.delete(numDoc);
    else newSelected.add(numDoc);
    setSelectedFacturas(newSelected);
  };

  if (!voucher) return null;

  const montoDetectado = getMontoSeguro(voucher.conciliacion);
  const monedaSimbolo = getModalCurrencySymbol(voucher.conciliacion?.moneda);
  const confianza = voucher.conciliacion?.nivel_confianza || "BAJO";

  const sumaNetosSeleccionados = facturasDisponibles
    .filter(f => selectedFacturas.has(f.numero_documento))
    .reduce((acc, f) => acc + f.monto_neto, 0);

  const diferencia = montoDetectado - sumaNetosSeleccionados;

  const handleConfirmarPersonalizado = () => {
    if (selectedFacturas.size === 0) {
      alert("Debes seleccionar al menos una factura para conciliar.");
      return;
    }
    if (Math.abs(diferencia) > 1.0) {
      const ok = window.confirm(`Cuidado: Hay una diferencia de ${monedaSimbolo}${diferencia.toFixed(2)} entre el voucher y las facturas elegidas. ¿Deseas forzar la conciliación?`);
      if (!ok) return;
    }

    const payloadFacturas = facturasDisponibles
      .filter(f => selectedFacturas.has(f.numero_documento))
      .map(f => ({ PK: f.PK, numero_documento: f.numero_documento }));

    onConfirm({ facturas: payloadFacturas });
  };

  const facturasOrdenadas = [...facturasDisponibles].sort((a, b) => {
    const aSelected = selectedFacturas.has(a.numero_documento);
    const bSelected = selectedFacturas.has(b.numero_documento);

    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return 0;
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>

        {/* Cabecera */}
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Resolución de Conciliación</h2>
            <p className="text-xs text-indigo-600 font-mono mt-0.5">Archivo: {voucher.fileName}</p>
          </div>
          <button onClick={onClose} disabled={isResolving} className="text-gray-400 hover:text-gray-600 text-3xl leading-none transition-colors">&times;</button>
        </div>

        {/* BARRA INFERIOR: CALCULADORA Y APROBACIÓN */}
        <div className="p-5 border-t border-gray-200 bg-white shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] relative z-20">
          <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
             
             {/* BALANCE FINANCIERO */}
             <div className="flex bg-gray-50 rounded-xl border border-gray-200 divide-x divide-gray-200 text-center w-full xl:w-auto shadow-inner overflow-hidden">
                <div className="px-5 py-3 bg-white">
                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Monto Voucher</span>
                   <span className="text-lg font-black text-gray-800 font-mono">
                     {monedaSimbolo} {montoDetectado.toFixed(2)}
                   </span>
                </div>
                
                <div className="px-5 py-3 bg-indigo-50/50">
                   <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block mb-1">
                     Total Seleccionado ({selectedFacturas.size})
                   </span>
                   <span className="text-lg font-black text-indigo-700 font-mono">
                     - {monedaSimbolo} {sumaNetosSeleccionados.toFixed(2)}
                   </span>
                </div>
                
                <div className={`px-5 py-3 ${Math.abs(diferencia) <= 1.0 ? 'bg-green-50' : 'bg-red-50'}`}>
                   <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${Math.abs(diferencia) <= 1.0 ? 'text-green-500' : 'text-red-500'}`}>
                     Diferencia
                   </span>
                   <span className={`text-lg font-black font-mono ${Math.abs(diferencia) <= 1.0 ? 'text-green-600' : 'text-red-600'}`}>
                     {diferencia >= 0 ? '+' : ''} {monedaSimbolo} {diferencia.toFixed(2)}
                   </span>
                </div>
             </div>

             {/* BOTÓN DE APROBACIÓN */}
             <button 
               onClick={handleConfirmarPersonalizado} 
               disabled={isResolving || selectedFacturas.size === 0}
               className="w-full xl:w-auto px-8 py-4 bg-indigo-600 border border-transparent text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
             >
               {isResolving ? (
                 <><div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> Procesando...</>
               ) : (
                 `Aprobar Cobranza (${selectedFacturas.size} facturas)`
               )}
             </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto custom-scrollbar flex-1">

          {/* PANEL IZQUIERDO: DETALLES DEL VOUCHER */}
          <div className="lg:col-span-4 p-6 border-r border-gray-200 bg-white space-y-6">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Monto Depositado</span>
              <h2 className="text-3xl font-black text-gray-900 mt-1">
                <span className="text-indigo-600 font-mono text-xl mr-1">{monedaSimbolo}</span>
                {Number(montoDetectado).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </h2>
            </div>

            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block">Diagnóstico IA</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${confianza === 'ALTO' ? 'bg-green-100 text-green-800' : ['AMBIGUO', 'MEDIO'].includes(confianza) ? 'bg-amber-200 text-amber-900' : 'bg-red-100 text-red-800'}`}>
                  {confianza === 'MEDIO' ? 'AMBIGUO' : confianza}
                </span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed font-medium">{voucher.conciliacion?.justificacion}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Comprobante Físico</span>
              {isLoadingImage ? (
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded-xl border border-dashed"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div></div>
              ) : voucherImageUrl ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-100 p-2 flex justify-center max-h-80 shadow-inner">
                  <img src={voucherImageUrl} alt="Voucher escaneado" className="max-h-full object-contain rounded" />
                </div>
              ) : (
                <div className="h-32 bg-gray-50 rounded-xl border border-dashed flex items-center justify-center text-xs text-gray-400">Sin imagen</div>
              )}
            </div>
          </div>

          {/* PANEL DERECHO: CONSTRUCTOR DE LOTES Y BÚSQUEDA */}
          <div className="lg:col-span-8 bg-gray-50 flex flex-col h-full relative">

            {/* BUSCADOR SALVAVIDAS */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                {/* 🚨 TEXTO DEL PLACEHOLDER ACTUALIZADO */}
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="¿Falta una factura? Busca por cliente, documento o monto..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {isSearching && <div className="absolute inset-y-0 right-0 pr-3 flex items-center"><div className="animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full"></div></div>}
              </div>

              {/* Dropdown de Resultados de Búsqueda */}
               {searchResults.length > 0 && (
                 <div className="absolute z-30 mt-1 w-[calc(100%-2rem)] mx-4 bg-white shadow-xl rounded-xl border border-gray-200 max-h-60 overflow-y-auto">
                   <ul className="divide-y divide-gray-100">
                     {searchResults.map((resDb, i) => (
                       <li key={i} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-colors" onClick={() => handleAgregarFacturaBuscada(resDb)}>
                         <div className="space-y-0.5">
                           <p className="text-sm font-bold text-gray-900">{resDb.cliente || "Desconocido"}</p>
                           <p className="text-xs text-indigo-600 font-mono font-medium">Doc: {resDb.numero_documento} <span className="text-gray-400 font-normal">| RUC: {resDb.ruc_cliente}</span></p>
                           <p className="text-[11px] text-gray-400 font-medium">Emisión: {resDb.fecha_emision || "---"} | Vence: {resDb.fecha_vencimiento || "---"}</p>
                         </div>
                         <div className="flex items-center gap-3">
                           <span className="text-sm font-black text-gray-900">
                             {getModalCurrencySymbol(resDb.moneda)} {Number(resDb.monto || 0).toFixed(2)}
                           </span>
                           <span className="bg-indigo-100 text-indigo-700 p-1 rounded-full"><Plus className="w-4 h-4" /></span>
                         </div>
                       </li>
                     ))}
                   </ul>
                 </div>
               )}
            </div>

            {/* LISTA INTERACTIVA DE FACTURAS */}
            <div className="px-6 py-4 space-y-3 flex-1 overflow-y-auto custom-scrollbar relative">
              {facturasOrdenadas.length === 0 ? (
                <div className="text-center text-gray-500 py-10 text-sm font-medium">Usa el buscador para agregar facturas a cobrar.</div>
              ) : (
                facturasOrdenadas.map((f) => {
                  const isChecked = selectedFacturas.has(f.numero_documento);
                  const monedaCand = getModalCurrencySymbol(f.moneda);

                  return (
                    <div key={f.numero_documento} onClick={() => toggleFacturaSelection(f.numero_documento)} className={`bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-all hover:border-indigo-300 ${isChecked ? 'border-indigo-400 ring-2 ring-indigo-400/20 bg-indigo-50/10' : 'border-gray-200 opacity-80'}`}>
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          <input type="checkbox" checked={isChecked} onChange={() => { }} className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer pointer-events-none" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-sm">{f.cliente}</span>
                            {f.is_ia_suggestion && <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-sm font-bold tracking-wider uppercase">Encontrado por IA</span>}
                            {!f.is_ia_suggestion && <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.5 rounded-sm font-bold tracking-wider uppercase">Agregado Manual</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span><span className="font-medium text-gray-400">Doc:</span> <span className="font-mono text-indigo-600 font-semibold">{f.numero_documento}</span></span>
                            <span><span className="font-medium text-gray-400">RUC:</span> {f.ruc_cliente}</span>
                            <span><span className="font-medium text-gray-400">Vence:</span> {f.fecha_vencimiento}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right min-w-[120px]">
                        {f.tiene_detraccion ? (
                          <>
                            <span className="text-[10px] text-gray-400 line-through block">Bruto: {monedaCand} {f.monto_total.toFixed(2)}</span>
                            <span className="text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded text-[9px] inline-block my-0.5">Detración ({f.tasa_detraccion})</span>
                            <span className="font-black text-gray-900 text-sm block">Neto: {monedaCand} {f.monto_neto.toFixed(2)}</span>
                          </>
                        ) : (
                          <span className="font-black text-gray-900 text-sm block">Total: {monedaCand} {f.monto_total.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}