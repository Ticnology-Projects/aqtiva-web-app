"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

type Empresa = {
  nombreOriginal: string;
  ruc: string;
  fechaCreacion: string;
  estado: string;
};

export default function EmpresasView() {
  const { data: session, status } = useSession();

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ nombre: "", ruc: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const getUserIdentifier = () => {
    if (!session?.user) return null;
    return session.user.email || session.user.name || "usuario_local";
  };

  const fetchEmpresas = async () => {
    const userId = getUserIdentifier();
    if (status === "loading" || !userId) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/empresas?usuarioId=${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (json.success) {
        const sorted = json.data.sort((a: any, b: any) => 
          new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
        );
        setEmpresas(sorted);
      }
    } catch (error) {
      console.error("Error al cargar empresas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") fetchEmpresas();
  }, [status, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    if (formData.ruc.length !== 11 || isNaN(Number(formData.ruc))) {
      setStatusMessage({ type: 'error', text: "El RUC debe tener exactamente 11 dígitos numéricos." });
      setIsSubmitting(false);
      return;
    }

    const userId = getUserIdentifier();
    if (!userId) {
      setStatusMessage({ type: 'error', text: "No se pudo identificar tu sesión." });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, usuarioId: userId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ocurrió un error al guardar.");

      setFormData({ nombre: "", ruc: "" });
      setIsModalOpen(false);
      fetchEmpresas(); 
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Directorio de Empresas</h1>
          <p className="text-gray-500 mt-1">
            Administra las empresas que emiten facturas. El sistema las usará para etiquetar las facturas pendientes.
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 border border-transparent text-white px-5 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2 text-sm"
        >
          <span>+</span> Nueva Empresa
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : empresas.length === 0 ? (
          <div className="text-center py-16 text-gray-500 flex flex-col items-center">
            <p className="text-lg font-medium text-gray-800">No tienes empresas registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Razón Social</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">RUC</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {empresas.map((empresa, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors text-sm">
                    <td className="px-6 py-4 font-bold text-gray-900">{empresa.nombreOriginal}</td>
                    <td className="px-6 py-4 text-indigo-600 font-mono font-medium">{empresa.ruc}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full border border-green-200">{empresa.estado}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500">{new Date(empresa.fechaCreacion).toLocaleDateString('es-PE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fadeIn" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">Registrar Empresa</h2>
              <button onClick={() => { setIsModalOpen(false); setStatusMessage(null); }} className="text-gray-400 hover:text-gray-600 text-2xl font-bold px-2">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="flex flex-col space-y-1.5">
                <label className="text-sm font-bold text-gray-700">Razón Social <span className="text-red-500">*</span></label>
                <input type="text" required placeholder="Ej. CONSULTORA AQTIVA S.A.C" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} className="border border-gray-300 rounded-lg p-3 text-sm focus:ring-indigo-500 outline-none uppercase bg-gray-50" />
              </div>
              <div className="flex flex-col space-y-1.5">
                <label className="text-sm font-bold text-gray-700">Número de RUC <span className="text-red-500">*</span></label>
                <input type="text" required maxLength={11} placeholder="Ej. 20123456789" value={formData.ruc} onChange={(e) => setFormData({ ...formData, ruc: e.target.value })} className="border border-gray-300 rounded-lg p-3 text-sm focus:ring-indigo-500 outline-none font-mono bg-gray-50" />
              </div>
              {statusMessage && (
                <div className={`p-3 rounded-lg text-sm font-medium ${statusMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{statusMessage.text}</div>
              )}
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
                <button type="button" onClick={() => { setIsModalOpen(false); setStatusMessage(null); }} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md disabled:opacity-50">
                  {isSubmitting ? "Guardando..." : "Crear Empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}