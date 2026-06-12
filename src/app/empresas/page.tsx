"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { useRouter } from "next/navigation";

type Empresa = {
  nombreOriginal: string;
  ruc: string;
  fechaCreacion: string;
  estado: string;
};

export default function CatalogEmpresasPage() {
  const router = useRouter();
  
  // Estados para la tabla
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Estados para el Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ nombre: "", ruc: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Cargar lista de empresas al montar el componente
  const fetchEmpresas = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch("/api/empresas");
      const json = await res.json();
      if (json.success) {
        // Ordenamos las empresas por fecha de creación (las más nuevas primero)
        const sorted = json.data.sort((a: any, b: any) => 
          new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
        );
        setEmpresas(sorted);
      }
    } catch (error) {
      console.error("Error al cargar empresas:", error);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchEmpresas();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    if (formData.ruc.length !== 11 || isNaN(Number(formData.ruc))) {
      setStatusMessage({ type: 'error', text: "El RUC debe tener exactamente 11 dígitos numéricos." });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Ocurrió un error al guardar.");

      // Si fue exitoso:
      setFormData({ nombre: "", ruc: "" }); // Limpiamos formulario
      setStatusMessage(null);
      setIsModalOpen(false); // Cerramos Modal
      fetchEmpresas(); // Recargamos la tabla para ver la nueva empresa
      
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-12">
      <Navbar />
      
      <div className="p-8 max-w-5xl mx-auto mt-8">
        
        {/* CABECERA */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Catálogo de Empresas</h1>
            <p className="text-gray-500 mt-2">
              Directorio maestro de RUCs para autocompletado en el análisis de Textract.
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => router.push('/')}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors shadow-sm"
            >
              Volver al Dashboard
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-indigo-600 border border-transparent text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
            >
              <span>+</span> Añadir Empresa
            </button>
          </div>
        </div>

        {/* TABLA DE EMPRESAS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoadingList ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : empresas.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No hay empresas registradas en el catálogo.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Razón Social</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">RUC</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha Registro</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {empresas.map((empresa, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                        {empresa.nombreOriginal}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-mono">
                        {empresa.ruc}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">
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

        {/* MODAL PARA AÑADIR EMPRESA */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-fadeIn">
              
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-xl font-bold text-gray-800">Registrar Empresa</h2>
                <button 
                  onClick={() => { setIsModalOpen(false); setStatusMessage(null); }} 
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold px-2 focus:outline-none"
                >
                  &times;
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="flex flex-col space-y-1">
                  <label htmlFor="nombre" className="text-sm font-bold text-gray-700">
                    Razón Social <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="nombre"
                    type="text"
                    required
                    placeholder="Ej. ENFOQUE VISUAL INVERSIONES S.A.C"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase"
                  />
                  <p className="text-xs text-gray-400">Escribe el nombre tal como aparece en facturas.</p>
                </div>

                <div className="flex flex-col space-y-1">
                  <label htmlFor="ruc" className="text-sm font-bold text-gray-700">
                    Número de RUC <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="ruc"
                    type="text"
                    required
                    maxLength={11}
                    placeholder="Ej. 20554134956"
                    value={formData.ruc}
                    onChange={(e) => setFormData({ ...formData, ruc: e.target.value })}
                    className="border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                  />
                </div>

                {statusMessage && (
                  <div className={`p-3 rounded-lg text-sm font-medium ${statusMessage.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {statusMessage.text}
                  </div>
                )}

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); setStatusMessage(null); }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                    {isSubmitting ? (
                      <><svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Guardando...</>
                    ) : (
                      "Guardar Empresa"
                    )}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}