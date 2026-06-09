"use client";

import { useEffect, useState } from "react";
import { InvoiceUploader } from "@/components/InvoiceUploader";
import { Navbar } from "@/components/layout/Navbar";
import { uploadAndMatchInvoice } from "@/lib/api";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ExcelUploader } from "@/components/ExcelUploader";

interface InvoiceUploaderProps {
  onUploadSuccess: () => void;
}

// (Las interfaces se mantienen igual)
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

  // Estado para controlar el formulario editable
  const [editForm, setEditForm] = useState({
    numero_documento: "",
    numero_operacion: "",
    emisor_nombre: "",
    receptor_nombre: "",
    fecha_emision: "",
    importe_total: 0,
    moneda: ""
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
        moneda: ext.moneda?.valor || ""
      });
    }
  }, [selectedRow]);

  if (status === "loading") return <div className="min-h-screen bg-gray-50"></div>;
  if (!session) return null;

  const handleSaveOCR = async () => {
    if (!selectedRow?.s3KeyOutput) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/update-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s3KeyOutput: selectedRow.s3KeyOutput,
          s3KeyProcessed: selectedRow.s3KeyProcessed, // Enviamos el segundo archivo
          updates: editForm
        })
      });

      if (res.ok) {
        alert("Cambios guardados en S3 exitosamente.");
        setSelectedRow(null);
        window.location.reload(); // Recarga para ver el badge "ALTO" de inmediato
      } else {
        alert("Ocurrió un error al guardar los cambios.");
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Columna 1: El uploader de PDFs original */}
          <div className="h-full">
            <InvoiceUploader onUploadSuccess={refreshDashboardData} />
          </div>

          {/* Columna 2: El nuevo procesador de Excel a S3 */}
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
            {/* TABLA PRINCIPAL */}
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
                    <td className="px-6 py-4 text-gray-700 font-mono">S/ {row.monto.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 text-xs font-bold rounded ${row.estadoCatalogo === 'COBRADO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
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

        {/* MODAL DE DETALLES Y EDICIÓN */}
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
                {/* Bloque de IA (Solo lectura) */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">🤖 Razonamiento de la IA</h3>
                  <p className="text-sm text-blue-800 leading-relaxed text-justify">{selectedRow.justificacion}</p>
                </div>

                {/* FORMULARIO EDITABLE DEL OCR */}
                {selectedRow.extraccionOriginal && (
                  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2">
                      ✏️ Corrección Manual de OCR
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