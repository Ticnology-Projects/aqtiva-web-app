"use client";

import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { useSession } from "next-auth/react";

interface EmpresaModalProps {
  empresa?: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EmpresaModal({ empresa, onClose, onSuccess }: EmpresaModalProps) {
  const { data: session } = useSession();
  
  const isEditing = !!empresa;
  const [ruc, setRuc] = useState(empresa?.ruc || "");
  const [nombreOriginal, setNombreOriginal] = useState(empresa?.nombreOriginal || "");
  const [alias, setAlias] = useState(empresa?.alias || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;
    
    setIsSaving(true);
    try {
      const payload = {
        usuarioId: session.user.email,
        ruc,
        nombreOriginal,
        alias
      };

      const res = await fetch("/api/empresas", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">
            {isEditing ? "Editar Empresa" : "Nueva Empresa"}
          </h2>
          <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              RUC Emisor (Requerido)
            </label>
            <input 
              type="text" 
              required
              disabled={isEditing}
              maxLength={11}
              value={ruc} 
              onChange={e => setRuc(e.target.value.replace(/\D/g, ''))} 
              placeholder="Ej: 20123456789" 
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
            />
            {isEditing && <p className="text-[10px] text-gray-400 mt-1">El RUC no se puede modificar una vez creado.</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Razón Social Oficial (Requerido)
            </label>
            <input 
              type="text" 
              required
              value={nombreOriginal} 
              onChange={e => setNombreOriginal(e.target.value)} 
              placeholder="Ej: EMPRESA DEMO S.A.C." 
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Alias Comercial (Opcional)
            </label>
            <input 
              type="text" 
              value={alias} 
              onChange={e => setAlias(e.target.value)} 
              placeholder="Ej: DemoCorp" 
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isSaving}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isSaving || !ruc || !nombreOriginal}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> 
              {isSaving ? "Guardando..." : "Guardar Empresa"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}