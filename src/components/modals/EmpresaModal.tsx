"use client";

import { useState } from "react";
import { X, Save, Plus, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";

interface EmpresaModalProps {
  empresa?: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EmpresaModal({ empresa, onClose, onSuccess }: EmpresaModalProps) {
  const { data: session } = useSession();
  const isEditing = !!empresa;
  const [isSaving, setIsSaving] = useState(false);
  
  // Si estamos editando, inicializamos con una fila. Si es nuevo, con una vacía.
  const [empresasForm, setEmpresasForm] = useState(
    isEditing 
      ? [{ id: "1", ruc: empresa.ruc, nombreOriginal: empresa.nombreOriginal, alias: empresa.alias || "" }]
      : [{ id: Date.now().toString(), ruc: "", nombreOriginal: "", alias: "" }]
  );

  const handleAddRow = () => {
    setEmpresasForm([...empresasForm, { id: Date.now().toString(), ruc: "", nombreOriginal: "", alias: "" }]);
  };

  const handleRemoveRow = (id: string) => {
    setEmpresasForm(empresasForm.filter(e => e.id !== id));
  };

  const handleChange = (id: string, field: string, value: string) => {
    setEmpresasForm(empresasForm.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;
    
    setIsSaving(true);
    try {
      const payload = {
        usuarioId: session.user.email,
        empresas: empresasForm.map(e => ({ ruc: e.ruc, nombreOriginal: e.nombreOriginal, alias: e.alias }))
      };

      const res = await fetch("/api/empresas", {
        method: isEditing ? "PUT" : "POST", 
        headers: { "Content-Type": "application/json" },
        // En PUT (edición) solo se procesa el primer elemento
        body: JSON.stringify(isEditing ? { ...payload.empresas[0], usuarioId: payload.usuarioId } : payload)
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        alert(data.error || "Error al guardar la empresa.");
      }
    } catch (error) {
      alert("Error de red al guardar la empresa.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">
            {isEditing ? "Editar Empresa" : "Agregar Empresa(s) Manualmente"}
          </h2>
          <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {empresasForm.map((emp) => (
            <div key={emp.id} className="flex flex-col md:flex-row gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200 relative">
              <div className="w-full md:w-1/3">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">RUC Emisor</label>
                <input type="text" required disabled={isEditing} maxLength={11} value={emp.ruc} onChange={e => handleChange(emp.id, 'ruc', e.target.value.replace(/\D/g, ''))} placeholder="Ej: 20123456789" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none disabled:bg-gray-200 font-mono" />
              </div>
              <div className="w-full md:w-1/3">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Razón Social Oficial</label>
                <input type="text" required value={emp.nombreOriginal} onChange={e => handleChange(emp.id, 'nombreOriginal', e.target.value)} placeholder="Ej: Empresa S.A.C." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
              </div>
              <div className="w-full md:w-1/3 relative">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Alias Comercial (Opcional)</label>
                <div className="flex gap-2">
                  <input type="text" value={emp.alias} onChange={e => handleChange(emp.id, 'alias', e.target.value)} placeholder="Ej: DemoCorp" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                  {!isEditing && empresasForm.length > 1 && (
                    <button type="button" onClick={() => handleRemoveRow(emp.id)} className="p-2 text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!isEditing && (
            <button type="button" onClick={handleAddRow} className="text-indigo-600 text-sm font-bold flex items-center gap-1 hover:text-indigo-800 mt-2">
              <Plus className="w-4 h-4" /> Añadir otra empresa
            </button>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
            <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 shadow-sm">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving || empresasForm.some(e => !e.ruc || !e.nombreOriginal)} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-md disabled:opacity-50">
              <Save className="w-4 h-4" /> {isSaving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}