"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// NUEVO: Importamos el componente reutilizable
import Navbar from "@/components/layout/Navbar";

type Empresa = {
  nombreOriginal: string;
  ruc: string;
  fechaCreacion: string;
  estado: string;
};

export default function DirectorioEmpresasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Estados para la Tabla
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados para el Modal
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
    if (status === "authenticated") {
      fetchEmpresas();
    }
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
      setStatusMessage({ type: 'error', text: "No se pudo identificar tu sesión. Intenta recargar la página." });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          usuarioId: userId
        })
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

  if (status === "loading") return <div className="min-h-screen bg-gray-50"></div>;

  return (
    <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
      
      {/* NUEVO: Implementación limpia del Navbar */}
      <Navbar 
        activeNav={"empresas" as any} 
        setActiveNav={(nav) => {
          // Como estamos en una ruta diferente (/empresas), si hace clic en el Navbar lo mandamos al inicio
          router.push("/");
        }} 
      />

      {/* CONTENIDO */}
      <main className="max-w-5xl mx-auto p-6 md:p-8 animate-fadeIn">
        
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Directorio de Empresas</h1>
            <p className="text-gray-500 mt-2">
              Administra las empresas que emiten facturas. El sistema las usará para etiquetar las facturas pendientes en la Carga Masiva.
            </p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 border border-transparent text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-md flex items-center gap-2"
          >
            <span>+</span> Nueva Empresa
          </button>
        </div>

        {/* TABLA DE EMPRESAS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : empresas.length === 0 ? (
            <div className="text-center py-16 text-gray-500 flex flex-col items-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
              </div>
              <p className="text-lg font-medium text-gray-800">No tienes empresas registradas</p>
              <p className="text-sm mt-1">Añade tu primera empresa para poder subir tu catálogo de facturas.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Razón Social</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">RUC</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha de Creación</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {empresas.map((empresa, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">
                        {empresa.nombreOriginal}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-indigo-600 font-mono font-medium">
                        {empresa.ruc}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full border border-green-200">
                          {empresa.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                        {new Date(empresa.fechaCreacion).toLocaleDateString('es-PE')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL PARA CREAR NUEVA EMPRESA */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-800">Registrar Empresa</h2>
                <button onClick={() => { setIsModalOpen(false); setStatusMessage(null); }} className="text-gray-400 hover:text-gray-600 text-2xl font-bold px-2 focus:outline-none">&times;</button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="flex flex-col space-y-1.5">
                  <label className="text-sm font-bold text-gray-700">Razón Social <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. CONSULTORA AQTIVA S.A.C"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase bg-gray-50 focus:bg-white transition-colors"
                  />
                  <p className="text-xs text-gray-400">Nombre legal o comercial de la empresa.</p>
                </div>

                <div className="flex flex-col space-y-1.5">
                  <label className="text-sm font-bold text-gray-700">Número de RUC <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    placeholder="Ej. 20123456789"
                    value={formData.ruc}
                    onChange={(e) => setFormData({ ...formData, ruc: e.target.value })}
                    className="border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>

                {statusMessage && (
                  <div className={`p-3 rounded-lg text-sm font-medium ${statusMessage.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {statusMessage.text}
                  </div>
                )}

                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
                  <button type="button" onClick={() => { setIsModalOpen(false); setStatusMessage(null); }} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors shadow-md disabled:opacity-50 flex justify-center items-center gap-2">
                    {isSubmitting ? (
                      <><svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Guardando...</>
                    ) : "Crear Empresa"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}