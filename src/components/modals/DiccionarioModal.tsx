"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Save } from "lucide-react";

interface DiccionarioModalProps {
  empresa: any;
  onClose: () => void;
}

interface ClientEntry {
  id: string; // Usaremos el RUC del cliente como ID interno de la tabla
  rucCliente: string;
  nombreLegal: string;
  aliasString: string;
}

export default function DiccionarioModal({ empresa, onClose }: DiccionarioModalProps) {
  const [entries, setEntries] = useState<ClientEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!empresa?.ruc) return;
    
    setIsLoading(true);
    fetch(`/api/empresas/diccionario?ruc=${empresa.ruc}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          // Transformar el objeto de S3 a un arreglo manejable en React
          const dictData = data.data;
          const initialEntries: ClientEntry[] = Object.keys(dictData).map(clienteRuc => ({
            id: clienteRuc,
            rucCliente: clienteRuc,
            nombreLegal: dictData[clienteRuc].nombre_legal || "",
            aliasString: (dictData[clienteRuc].alias || []).join(", ")
          }));
          setEntries(initialEntries);
        }
      })
      .catch(err => console.error("Error cargando diccionario:", err))
      .finally(() => setIsLoading(false));
  }, [empresa]);

  const handleAddEntry = () => {
    const newId = `temp_${Date.now()}`;
    setEntries([{ id: newId, rucCliente: "", nombreLegal: "", aliasString: "" }, ...entries]);
  };

  const handleRemoveEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  const handleChange = (id: string, field: keyof ClientEntry, value: string) => {
    setEntries(entries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSave = async () => {
    // Validaciones básicas
    const invalid = entries.some(e => !e.rucCliente.trim() || !e.nombreLegal.trim());
    if (invalid) {
      alert("Todos los clientes deben tener RUC y Nombre Legal definidos.");
      return;
    }

    setIsSaving(true);

    // Transformar el arreglo de React al objeto JSON esperado por Bedrock
    const diccionarioFinal: Record<string, any> = {};
    entries.forEach(e => {
      const aliasArray = e.aliasString
        .split(",")
        .map(a => a.trim())
        .filter(a => a.length > 0);

      diccionarioFinal[e.rucCliente.trim()] = {
        nombre_legal: e.nombreLegal.trim(),
        alias: aliasArray
      };
    });

    try {
      const res = await fetch("/api/empresas/diccionario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruc: empresa.ruc, diccionario: diccionarioFinal })
      });
      const data = await res.json();
      
      if (data.success) {
        alert("Diccionario sincronizado exitosamente.");
        onClose();
      } else {
        alert(data.error || "Error al guardar el diccionario.");
      }
    } catch (err) {
      alert("Error de red al guardar el diccionario.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Diccionario de Clientes (IA)</h2>
            <p className="text-sm text-gray-500 mt-1">Tenant: <span className="font-bold">{empresa?.nombreOriginal}</span> ({empresa?.ruc})</p>
          </div>
          <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 bg-amber-50/50 border-b border-amber-100 text-sm text-amber-900">
          <strong>¿Para qué sirve esto?</strong> Si el OCR lee nombres extraños o cortados en los vouchers (ej: "MEDIO AMBIENTE SALUD"), agrégalos en la columna <strong>Alias</strong> separados por comas. La IA traducirá esos alias al RUC y Nombre Legal correctos antes de conciliar.
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-xl">
                  No hay clientes en el diccionario. Haz clic en "Agregar Cliente" para comenzar.
                </div>
              ) : (
                entries.map((entry) => (
                  <div key={entry.id} className="flex flex-col md:flex-row gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200 relative">
                    <div className="w-full md:w-1/4">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">RUC Cliente</label>
                      <input type="text" value={entry.rucCliente} onChange={e => handleChange(entry.id, 'rucCliente', e.target.value)} placeholder="Ej: 20100097746" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none font-mono" />
                    </div>
                    <div className="w-full md:w-1/4">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nombre Legal Oficial</label>
                      <input type="text" value={entry.nombreLegal} onChange={e => handleChange(entry.id, 'nombreLegal', e.target.value)} placeholder="Razón social correcta" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none" />
                    </div>
                    <div className="w-full md:w-2/4">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Alias (Separados por comas)</label>
                      <div className="flex gap-2">
                        <input type="text" value={entry.aliasString} onChange={e => handleChange(entry.id, 'aliasString', e.target.value)} placeholder="Ej: SANTIAGO QUEIROLO, S QUEIROLO" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none" />
                        <button onClick={() => handleRemoveEntry(entry.id)} className="bg-red-50 text-red-600 border border-red-200 p-2 rounded-lg hover:bg-red-100 transition-colors shrink-0">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
          <button onClick={handleAddEntry} disabled={isLoading || isSaving} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Agregar Cliente
          </button>
          
          <div className="flex gap-3">
            <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={isSaving || isLoading} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50">
              <Save className="w-4 h-4" /> {isSaving ? "Guardando..." : "Guardar Diccionario"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}