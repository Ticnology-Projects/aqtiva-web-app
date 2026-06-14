"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { ExcelUploader } from "@/components/ExcelUploader";
import { InvoiceUploader } from "@/components/InvoiceUploader";

export default function ApplicationLayout() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeNav, setActiveNav] = useState<"dashboard" | "facturas" | "carga-masiva" | "resolucion">("carga-masiva");

  const [activeTab, setActiveTab] = useState<"pendientes" | "resueltos">("pendientes");
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);

  // NUEVO: Estados para manejar el catálogo de facturas
  const [facturas, setFacturas] = useState<any[]>([]);
  const [isLoadingFacturas, setIsLoadingFacturas] = useState(false);

  const [isResolving, setIsResolving] = useState(false);

  // NUEVO: Efecto para cargar las facturas cuando se abre la pestaña
  useEffect(() => {
    if (activeNav === "facturas") {
      setIsLoadingFacturas(true);
      fetch("/api/facturas")
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            // Ordenar por fecha de emisión descendente
            const sorted = data.data.sort((a: any, b: any) => {
              if (!a.fecha_emision) return 1;
              if (!b.fecha_emision) return -1;
              return new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime();
            });
            setFacturas(sorted);
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setIsLoadingFacturas(false));
    }
  }, [activeNav]);

  const handleConfirmarResolucion = async () => {
    // Si no hay voucher seleccionado o no tiene factura sugerida, salimos
    if (!selectedVoucher || !selectedVoucher.conciliacion?.factura_sugerida) return;

    setIsResolving(true);
    const numeroDoc = selectedVoucher.conciliacion.factura_sugerida.numero_documento;

    try {
      const res = await fetch("/api/facturas/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_documento: numeroDoc,
          s3_key_voucher: selectedVoucher.s3_key
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert(data.message);
        setSelectedVoucher(null); // Cierra el modal

        // Opcional: Podrías hacer un fetch("/api/facturas") aquí para recargar el catálogo
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error("Error al resolver:", error);
      alert("Ocurrió un error de red.");
    } finally {
      setIsResolving(false);
    }
  };

  if (status === "loading") return <div className="min-h-screen bg-gray-50"></div>;

  return (
    <div className="bg-gray-50 min-h-screen font-sans text-gray-800">

      {/* NAVEGACIÓN PRINCIPAL */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-indigo-700">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">A</div>
            AQTIVA
          </div>

          <nav className="hidden md:flex gap-1 text-sm font-medium">
            <button onClick={() => setActiveNav("dashboard")} className={`px-4 py-2 rounded-lg transition-colors ${activeNav === "dashboard" ? "bg-indigo-50 text-indigo-700 font-bold" : "text-gray-500 hover:bg-gray-100"}`}>Dashboard</button>
            <button onClick={() => setActiveNav("facturas")} className={`px-4 py-2 rounded-lg transition-colors ${activeNav === "facturas" ? "bg-indigo-50 text-indigo-700 font-bold" : "text-gray-500 hover:bg-gray-100"}`}>Catálogo de Facturas</button>
            <button onClick={() => setActiveNav("carga-masiva")} className={`px-4 py-2 rounded-lg transition-colors ${activeNav === "carga-masiva" ? "bg-indigo-50 text-indigo-700 font-bold" : "text-gray-500 hover:bg-gray-100"}`}>Carga Masiva</button>
            <button onClick={() => setActiveNav("resolucion")} className={`px-4 py-2 rounded-lg transition-colors ${activeNav === "resolucion" ? "bg-indigo-50 text-indigo-700 font-bold" : "text-gray-500 hover:bg-gray-100"}`}>Centro Resolución</button>
            <button onClick={() => router.push('/empresas')} className="px-4 py-2 rounded-lg transition-colors text-gray-500 hover:bg-gray-100">Directorio RUCs</button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm cursor-pointer">
            {session?.user?.name?.charAt(0) || "U"}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8">

        {/* VISTA: CARGA MASIVA */}
        {activeNav === "carga-masiva" && (
          <div className="animate-fadeIn">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Centro de Importación</h1>
              <p className="text-gray-500 mt-1">Sube tu catálogo de facturas pendientes y los comprobantes a analizar.</p>
            </div>

            {/* CORRECCIÓN: Se usa items-stretch para igualar columnas y min-h para dejar crecer el contenido */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
              {/* Columna Izquierda: Facturas (CSV) */}
              <div className="flex flex-col">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                  Base de Datos (Facturas)
                </h2>
                <div className="flex-1 min-h-[500px]">
                  <ExcelUploader />
                </div>
              </div>

              {/* Columna Derecha: Vouchers (Imágenes/PDFs) */}
              <div className="flex flex-col">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                  Documentos (Vouchers)
                </h2>
                <div className="flex-1 min-h-[500px]">
                  <InvoiceUploader onUploadSuccess={(resultados) => {
                    console.log("Vouchers subidos. Resultados:", resultados);
                  }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            NUEVA VISTA: CATÁLOGO DE FACTURAS (Excel en DynamoDB)
        ================================================================= */}
        {activeNav === "facturas" && (
          <div className="animate-fadeIn">
            <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Catálogo de Facturas</h1>
                <p className="text-gray-500 mt-1">Todas las facturas pendientes y cobradas importadas a la base de datos.</p>
              </div>
              <button
                onClick={() => {
                  setIsLoadingFacturas(true);
                  fetch("/api/facturas").then(res => res.json()).then(data => {
                    if (data.success) setFacturas(data.data);
                  }).finally(() => setIsLoadingFacturas(false));
                }}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Refrescar Datos
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {isLoadingFacturas ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : facturas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                  <p className="text-lg font-medium">No hay facturas registradas</p>
                  <p className="text-sm mt-1">Ve a "Carga Masiva" para importar tu archivo Excel o CSV.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-4 text-left font-semibold text-gray-500">Documento</th>
                        {/* NUEVA COLUMNA */}
                        <th className="px-6 py-4 text-left font-semibold text-gray-500">Empresa (Cobrador)</th>
                        <th className="px-6 py-4 text-left font-semibold text-gray-500">Cliente a cobrar</th>
                        <th className="px-6 py-4 text-right font-semibold text-gray-500">Monto</th>
                        <th className="px-6 py-4 text-center font-semibold text-gray-500">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {facturas.map((factura, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900">{factura.numero_documento}</td>
                          {/* NUEVA CELDA: EMPRESA COBRADORA */}
                          <td className="px-6 py-4">
                            <p className="text-indigo-700 font-bold text-sm truncate max-w-[200px]" title={factura.empresa_emisora_nombre}>
                              {factura.empresa_emisora_nombre || 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {factura.empresa_emisora_ruc || 'N/A'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-gray-900 font-medium truncate max-w-[200px]" title={factura.cliente}>{factura.cliente}</p>
                            <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {factura.ruc_cliente || 'N/A'}</p>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-gray-700">
                            {factura.moneda === 'USD' ? '$' : 'S/'} {Number(factura.monto || 0).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${factura.estado === 'COBRADO' ? 'bg-green-100 text-green-800' :
                              factura.estado === 'EN REVISIÓN' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800 border border-gray-200'
                              }`}>
                              {factura.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISTA: CENTRO DE RESOLUCIÓN (Mantiene su código previo) */}
        {activeNav === "resolucion" && (
          <div className="animate-fadeIn">
            {/* ... [El bloque existente del centro de resolución con embudos y la tabla] ... */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Triaje de Vouchers</h1>
              <p className="text-gray-500 mt-1">Lote actual procesado: <span className="font-medium text-gray-700">Diciembre 2025</span></p>
            </div>

            {/* Tarjetas Embudos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-5 relative overflow-hidden group hover:border-green-300 transition-colors cursor-pointer">
                <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Autoconciliados</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-900">42</span>
                    <span className="text-sm text-green-600 font-medium">Confianza ALTA</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-5 relative overflow-hidden group hover:border-amber-300 transition-colors cursor-pointer">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Ambigüedades</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-900">3</span>
                    <span className="text-sm text-amber-600 font-medium">Revisar Match</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-5 relative overflow-hidden group hover:border-red-300 transition-colors cursor-pointer">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sin Match / Manual</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-900">5</span>
                    <span className="text-sm text-red-600 font-medium">Asignar a mano</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="flex border-b border-gray-200 px-6 pt-2 bg-gray-50/50">
                <button onClick={() => setActiveTab("pendientes")} className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${activeTab === "pendientes" ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>Tareas Pendientes (8)</button>
                <button onClick={() => setActiveTab("resueltos")} className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${activeTab === "resueltos" ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>Resueltos / Historial</button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left font-semibold text-gray-500">Voucher Analizado</th>
                      <th className="px-6 py-4 text-left font-semibold text-gray-500">Emisor Detectado (OCR)</th>
                      <th className="px-6 py-4 text-left font-semibold text-gray-500">Monto</th>
                      <th className="px-6 py-4 text-center font-semibold text-gray-500">Sugerencia IA</th>
                      <th className="px-6 py-4 text-right font-semibold text-gray-500">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">VOUCHER_BCP_01.jpg</p>
                            <p className="text-xs text-gray-500">Procesado hace 10 min</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900 font-medium">ENFOQUE VISUAL INV...</p>
                        <p className="text-xs text-gray-500 font-mono">20554134956</p>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-gray-700">S/ 177.00</td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                          AMBIGUO (2 Match)
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedVoucher({ type: "ambiguo", fileName: "VOUCHER_BCP_01.jpg" })}
                          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                        >
                          Resolver
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VISTA: DASHBOARD (Placeholder) */}
        {activeNav === "dashboard" && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 animate-fadeIn">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            <p className="text-lg font-medium">Dashboard de métricas en construcción</p>
          </div>
        )}

      </main>

      {/* MODAL PANTALLA DIVIDIDA */}
      {selectedVoucher && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                  Resolución de Ambigüedad
                </h2>
                <p className="text-sm text-gray-500 mt-1">Archivo: <span className="font-mono text-indigo-600">{selectedVoucher.fileName}</span></p>
              </div>
              <button onClick={() => setSelectedVoucher(null)} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
              <div className="w-full lg:w-[45%] bg-gray-50 border-r border-gray-200 p-6 overflow-y-auto">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6">Datos Extraídos (Voucher)</h3>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-gray-500 mb-1">Razón Social</label>
                      <input type="text" defaultValue="ENFOQUE VISUAL INV..." className="bg-white border border-gray-300 rounded-md px-3 py-2 text-sm font-medium outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-gray-500 mb-1">RUC Emisor</label>
                      <input type="text" defaultValue="20554134956" className="bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-md px-3 py-2 text-sm font-mono font-medium outline-none" />
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-center shadow-sm">
                    <span className="text-sm font-bold text-gray-600">Monto Pagado:</span>
                    <span className="text-xl font-bold text-indigo-700 font-mono">S/ 177.00</span>
                  </div>
                </div>
              </div>

              <div className="w-full lg:w-[55%] bg-white p-6 overflow-y-auto">
                <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-6">Match Inteligente</h3>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 rounded-lg mb-6 flex gap-3">
                  <span className="text-lg">⚠️</span>
                  <p><strong>Ambigüedad detectada:</strong> El monto (S/ 177.00) coincide con más de una factura pendiente.</p>
                </div>
                <div className="border-2 border-indigo-500 bg-indigo-50/30 rounded-xl p-5 mb-4 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-bold text-lg text-gray-900">Factura F001-153</h4>
                      <p className="text-sm text-gray-600">Cliente: Enfoque Visual</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold font-mono text-gray-900">S/ 177.00</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button onClick={() => setSelectedVoucher(null)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">Cancelar</button>
              <button
                onClick={handleConfirmarResolucion}
                disabled={isResolving}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                {isResolving ? "Guardando..." : "Confirmar y Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}