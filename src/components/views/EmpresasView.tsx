"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Plus, Edit2, Trash2, Search, Book, Upload } from "lucide-react";
import EmpresaModal from "@/components/modals/EmpresaModal";
import DiccionarioModal from "@/components/modals/DiccionarioModal"; 

export default function EmpresasView() {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [filteredEmpresas, setFilteredEmpresas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<any | null>(null);

  const [isDictModalOpen, setIsDictModalOpen] = useState(false);
  const [selectedDictEmpresa, setSelectedDictEmpresa] = useState<any | null>(null);

  const fetchEmpresas = async () => {
    if (!session?.user?.email) return;
    try {
      const res = await fetch(`/api/empresas?usuarioId=${encodeURIComponent(session.user.email)}`);
      const data = await res.json();
      if (data.success) {
        setEmpresas(data.data);
        setFilteredEmpresas(data.data);
      }
    } catch (error) {
      console.error("Error al cargar empresas:", error);
    }
  };

  useEffect(() => {
    fetchEmpresas();
  }, [session]);

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    const filtered = empresas.filter(emp => 
      emp.nombreOriginal?.toLowerCase().includes(term) ||
      emp.ruc?.toLowerCase().includes(term) ||
      emp.alias?.toLowerCase().includes(term)
    );
    setFilteredEmpresas(filtered);
  }, [searchTerm, empresas]);

  const handleEdit = (empresa: any) => {
    setSelectedEmpresa(empresa);
    setIsModalOpen(true);
  };

  const handleOpenDict = (empresa: any) => {
    setSelectedDictEmpresa(empresa);
    setIsDictModalOpen(true);
  };

  // 🚨 CARGA MASIVA DE EMPRESAS DESDE CSV
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.email) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      // Dividimos por saltos de línea y filtramos líneas vacías
      const rows = text.split('\n').map(r => r.trim()).filter(r => r);
      
      // Asumimos Cabecera: RUC, Razón Social, Alias (opcional)
      const payloadEmpresas = rows.slice(1).map(row => {
        const columns = row.split(',');
        const ruc = columns[0]?.trim() || "";
        const nombreOriginal = columns[1]?.trim() || "";
        const alias = columns[2]?.trim() || "";
        return { ruc, nombreOriginal, alias };
      }).filter(emp => emp.ruc && emp.nombreOriginal);

      if (payloadEmpresas.length === 0) {
        alert("El archivo no tiene el formato correcto o está vacío. Columnas esperadas: RUC, Razón Social, Alias");
        return;
      }

      try {
        const res = await fetch("/api/empresas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            usuarioId: session?.user?.email, 
            empresas: payloadEmpresas 
          })
        });
        const data = await res.json();
        if (data.success) {
          alert(data.message);
          fetchEmpresas();
        } else {
          alert(data.error);
        }
      } catch (error) {
        alert("Error de red al importar las empresas.");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Resetear input
  };

  const handleDelete = async (ruc: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar esta empresa?")) return;
    try {
      const res = await fetch(`/api/empresas?ruc=${ruc}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchEmpresas();
      } else {
        alert(data.error);
      }
    } catch (error) {
      alert("Error al eliminar la empresa.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Empresas</h1>
          <p className="text-gray-500 mt-1">
            Gestiona los RUCs emisores vinculados a tu cuenta.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {/* Input oculto para CSV */}
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-all shadow-sm"
          >
            <Upload className="w-5 h-5" /> Importar CSV
          </button>
          <button 
            onClick={() => { setSelectedEmpresa(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Nueva(s) Empresa(s)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por RUC, nombre o alias..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/50 text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-4">RUC</th>
                <th className="px-6 py-4">Razón Social (SCT)</th>
                <th className="px-6 py-4">Alias Interno</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEmpresas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron empresas registradas.
                  </td>
                </tr>
              ) : (
                filteredEmpresas.map((emp) => (
                  <tr key={emp.ruc} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-gray-900">{emp.ruc}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{emp.nombreOriginal}</td>
                    <td className="px-6 py-4 text-gray-500">{emp.alias || "---"}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleOpenDict(emp)}
                          title="Gestionar Diccionario IA"
                          className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Book className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEdit(emp)}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(emp.ruc)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <EmpresaModal 
          empresa={selectedEmpresa}
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchEmpresas}
        />
      )}

      {isDictModalOpen && selectedDictEmpresa && (
        <DiccionarioModal 
          empresa={selectedDictEmpresa}
          onClose={() => {
            setIsDictModalOpen(false);
            setSelectedDictEmpresa(null);
          }}
        />
      )}
    </div>
  );
}