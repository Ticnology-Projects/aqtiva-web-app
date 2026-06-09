"use client";

import { useEffect, useState } from "react";
import { InvoiceUploader } from "@/components/InvoiceUploader";
import { Navbar } from "@/components/layout/Navbar";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ExcelUploader } from "@/components/ExcelUploader";

interface InvoiceUploaderProps {
  onUploadSuccess: () => void;
}

type DashboardRow = {
  factura: string;
  cliente: string;
  monto: number;
  estadoCatalogo: string;
  nivelConfianza: string;
  estadoIA: string;
  justificacion: string;
  score: number;
  camposCoincidentes: string[];
  camposDiscrepantes: string[];
  extraccionOriginal: any;
  s3KeyOutput: string | null;
  s3KeyProcessed: string | null;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<DashboardRow | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Estado expandido para controlar el formulario editable (OCR + IA)
  const [editForm, setEditForm] = useState({
    numero_documento: "",
    numero_operacion: "",
    emisor_nombre: "",
    receptor_nombre: "",
    fecha_emision: "",
    importe_total: 0,
    moneda: "",
    factura_sugerida: "",
    nivel_confianza: "",
    estado: ""
  });
  const [isSaving, setIsSaving] = useState(false);

  const refreshDashboardData = () => {
    setLoading(true);
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((responseData) => {
        if (Array.isArray(responseData)) setData(responseData);
        else setData([]);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error recargando dashboard", err);
        setData([]);
        setLoading(false);
      });
  };

  const handleSyncKnowledgeBase = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/bedrock/sync", {
        method: "POST",
      });
      const data = await res.json();
      
      if (res.ok) {
        alert("✅ IA Sincronizada: El agente ya puede leer los últimos documentos subidos.");
      } else {
        throw new Error(data.error || "Error al sincronizar");
      }
    } catch (error: any) {
      alert("❌ Ocurrió un error al intentar sincronizar: " + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      refreshDashboardData();
    }
  }, [status]);

  // 2. Pre-cargar datos del JSON (OCR y Procesado) al abrir el Modal
  useEffect(() => {
    if (selectedRow && selectedRow.extraccionOriginal) {
      const ext = selectedRow.extraccionOriginal;
      setEditForm({
        numero_documento: ext.numero_documento?.valor || "",
        numero_operacion: ext.numero_operacion?.valor || "",
        emisor_nombre: ext.emisor?.nombre?.valor || "",
        receptor_nombre: ext.receptor?.nombre?.valor || "",
        fecha_emision: ext.fecha_emision?.valor || "",
        importe_total: ext.importe_total?.valor || 0,
        moneda: ext.moneda?.valor || "",
        
        // Cargar variables de Bedrock / IA
        factura_sugerida: selectedRow.factura || "",
        nivel_confianza: selectedRow.nivelConfianza || "BAJO",
        estado: selectedRow.estadoIA || "PENDIENTE"
      });
    }
  }, [selectedRow]);

  if (status === "loading") return <div className="min-h-screen bg-gray-50"></div>;
  if (!session) return null;

  // 3. Guardado apuntando al nuevo endpoint de actualización
  const handleSaveOCR = async () => {
    if (!selectedRow?.s3KeyOutput) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/dashboard/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s3KeyOutput: selectedRow.s3KeyOutput,
          s3KeyProcessed: selectedRow.s3KeyProcessed,
          updates: editForm
        })
      });

      if (res.ok) {
        alert("✅ Cambios guardados en S3 exitosamente.");
        setSelectedRow(null);
        refreshDashboardData(); // Recargamos dinámicamente sin parpadear la pantalla
      } else {
        alert("❌ Ocurrió un error al guardar los cambios.");
      }
    } catch (error) {
      console.error("Error guardando:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const getConfidenceBadge = (level: string) => {
    switch (level) {
      case "ALTO": return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">ALTO</span>;
      case "MEDIO": return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded">MEDIO</span>;
      case "BAJO": return <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-bold rounded">BAJO</span>;
      default: return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-bold rounded">SIN MATCH</span>;
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-12">
      <Navbar />
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Panel de Conciliación de Facturas</h1>
          <button
            onClick={handleSyncKnowledgeBase}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {isSyncing ? (
              <svg className="animate-spin h-5 w-5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span>{isSyncing ? "Sincronizando IA..." : "Sincronizar IA"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="h-full">
            <InvoiceUploader onUploadSuccess={refreshDashboardData} />
          </div>

          <div className="h-full">
            <ExcelUploader />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">Documento</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">Cliente</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">Monto</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-600">Catálogo</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-600">Auditoría IA</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-600">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{row.factura}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{row.cliente}</td>
                    {/* Nos aseguramos de que el monto no arroje error si no es un número */}
                    <td className="px-6 py-4 text-gray-700 font-mono">S/ {Number(row.monto || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 text-xs font-bold rounded whitespace-nowrap ${row.estadoCatalogo === 'COBRADO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {row.estadoCatalogo}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {getConfidenceBadge(row.nivelConfianza)}
                        {row.score > 0 && <span className="text-[10px] text-gray-400">Score: {row.score.toFixed(4)}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => setSelectedRow(row)} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded text-xs font-semibold">
                        Ver Detalles
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedRow && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">

              <div className="flex justify-between items-center p-6 border-b shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Auditoría: {selectedRow.factura}</h2>
                  {selectedRow.s3KeyOutput && <span className="text-xs text-gray-500 font-mono mt-1 block">Origen: {selectedRow.s3KeyOutput}</span>}
                </div>
                <button onClick={() => setSelectedRow(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold px-2">&times;</button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto grow">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">🤖 Razonamiento de la IA</h3>
                  <p className="text-sm text-blue-800 leading-relaxed text-justify">{selectedRow.justificacion}</p>
                </div>

                {selectedRow.extraccionOriginal && (
                  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2">
                      ✏️ Corrección Manual de OCR y Conciliación
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-600 mb-1">Número Documento</label>
                        <input type="text" value={editForm.numero_documento} onChange={e => setEditForm({ ...editForm, numero_documento: e.target.value })} className="border rounded p-2 text-sm focus:ring focus:ring-indigo-100 focus:border-indigo-400 outline-none" />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-600 mb-1">Número Operación (Vouchers)</label>
                        <input type="text" value={editForm.numero_operacion} onChange={e => setEditForm({ ...editForm, numero_operacion: e.target.value })} className="border rounded p-2 text-sm focus:ring focus:ring-indigo-100 focus:border-indigo-400 outline-none" />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-600 mb-1">Nombre Emisor (Origen/Ordenante)</label>
                        <input type="text" value={editForm.emisor_nombre} onChange={e => setEditForm({ ...editForm, emisor_nombre: e.target.value })} className="border rounded p-2 text-sm focus:ring focus:ring-indigo-100 focus:border-indigo-400 outline-none" />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-600 mb-1">Nombre Receptor (Destino)</label>
                        <input type="text" value={editForm.receptor_nombre} onChange={e => setEditForm({ ...editForm, receptor_nombre: e.target.value })} className="border rounded p-2 text-sm focus:ring focus:ring-indigo-100 focus:border-indigo-400 outline-none" />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-600 mb-1">Fecha Emisión (DD/MM/AAAA)</label>
                        <input type="text" value={editForm.fecha_emision} onChange={e => setEditForm({ ...editForm, fecha_emision: e.target.value })} className="border rounded p-2 text-sm focus:ring focus:ring-indigo-100 focus:border-indigo-400 outline-none" />
                      </div>

                      <div className="flex gap-4">
                        <div className="flex flex-col w-1/3">
                          <label className="text-xs font-semibold text-gray-600 mb-1">Moneda</label>
                          <input type="text" value={editForm.moneda} onChange={e => setEditForm({ ...editForm, moneda: e.target.value })} className="border rounded p-2 text-sm focus:ring focus:ring-indigo-100 focus:border-indigo-400 outline-none uppercase" />
                        </div>
                        <div className="flex flex-col w-2/3">
                          <label className="text-xs font-semibold text-gray-600 mb-1">Monto Total</label>
                          <input type="number" step="0.01" value={editForm.importe_total} onChange={e => setEditForm({ ...editForm, importe_total: parseFloat(e.target.value) })} className="border rounded p-2 text-sm focus:ring focus:ring-indigo-100 focus:border-indigo-400 outline-none" />
                        </div>
                      </div>

                      {/* 4. SECCIÓN AÑADIDA PARA EDITAR LOS CAMPOS DE LA IA */}
                      <div className="col-span-1 md:col-span-2 mt-4 pt-4 border-t border-gray-100">
                        <h4 className="text-xs font-bold text-indigo-700 mb-3 uppercase tracking-wide">Ajustes de IA (Bedrock Processed)</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                          <div className="flex flex-col">
                            <label className="text-xs font-semibold text-indigo-900 mb-1">Factura Sugerida</label>
                            <input 
                              type="text" 
                              value={editForm.factura_sugerida} 
                              onChange={e => setEditForm({ ...editForm, factura_sugerida: e.target.value })} 
                              className="border border-indigo-200 rounded p-2 text-sm focus:ring focus:ring-indigo-300 focus:border-indigo-500 outline-none uppercase bg-white" 
                            />
                          </div>
                          <div className="flex flex-col">
                            <label className="text-xs font-semibold text-indigo-900 mb-1">Nivel Confianza</label>
                            <select 
                              value={editForm.nivel_confianza} 
                              onChange={e => setEditForm({ ...editForm, nivel_confianza: e.target.value })} 
                              className="border border-indigo-200 rounded p-2 text-sm focus:ring focus:ring-indigo-300 focus:border-indigo-500 outline-none bg-white"
                            >
                              <option value="ALTO">ALTO</option>
                              <option value="MEDIO">MEDIO</option>
                              <option value="BAJO">BAJO</option>
                              <option value="SIN_MATCH">SIN_MATCH</option>
                            </select>
                          </div>
                          <div className="flex flex-col">
                            <label className="text-xs font-semibold text-indigo-900 mb-1">Estado Final</label>
                            <select 
                              value={editForm.estado} 
                              onChange={e => setEditForm({ ...editForm, estado: e.target.value })} 
                              className="border border-indigo-200 rounded p-2 text-sm focus:ring focus:ring-indigo-300 focus:border-indigo-500 outline-none bg-white"
                            >
                              <option value="COBRADO">COBRADO</option>
                              <option value="EN REVISIÓN">EN REVISIÓN</option>
                              <option value="EN COBRANZA">EN COBRANZA</option>
                              <option value="PENDIENTE">PENDIENTE</option>
                            </select>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t bg-gray-50 rounded-b-xl flex justify-between shrink-0">
                <button onClick={() => setSelectedRow(null)} className="text-gray-600 hover:text-gray-900 px-4 py-2 font-medium">
                  Cancelar
                </button>
                <button
                  onClick={handleSaveOCR}
                  disabled={isSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium shadow-md transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Guardando en S3..." : "Guardar Cambios"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}