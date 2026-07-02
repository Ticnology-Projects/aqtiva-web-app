"use client";

import { useState } from "react";
import { X, Save, Plus, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";

interface FacturaManualModalProps {
  rucEmisor: string;
  empresaNombre: string; // Recibe el nombre de la empresa emisora
  onClose: () => void;
  onSuccess: () => void;
}

export default function FacturaManualModal({ rucEmisor, empresaNombre, onClose, onSuccess }: FacturaManualModalProps) {
  const { data: session } = useSession();
  const [isSaving, setIsSaving] = useState(false);
  
  const [facturas, setFacturas] = useState([{
    id: Date.now().toString(),
    numero_documento: "",
    cliente: "",
    ruc_cliente: "",
    monto_total: "", 
    moneda: "SOLES", 
    fecha_emision: "",
    fecha_vencimiento: "",
    tiene_detraccion: false,
    tasa_detraccion: "" 
  }]);

  const handleAddRow = () => {
    setFacturas([...facturas, {
      id: Date.now().toString(), numero_documento: "", cliente: "", ruc_cliente: "",
      monto_total: "", moneda: "SOLES", fecha_emision: "", fecha_vencimiento: "", tiene_detraccion: false, tasa_detraccion: ""
    }]);
  };

  const handleRemoveRow = (id: string) => setFacturas(facturas.filter(f => f.id !== id));

  const handleChange = (id: string, field: string, value: any) => {
    setFacturas(facturas.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) {
      alert("No se pudo identificar tu sesión de usuario. Recarga la página.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/facturas/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            rucEmisor, 
            empresaNombre, // Se inyecta la empresa emisora correctamente
            facturas, 
            emailUsuario: session.user.email 
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else alert(data.error);
    } catch (error) { 
        alert("Error al guardar facturas."); 
    } finally { 
        setIsSaving(false); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">Agregar Facturas Manuales</h2>
          <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {facturas.map((fac) => (
            <div key={fac.id} className="flex flex-col md:flex-row gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200 items-start">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Documento</label>
                  <input type="text" required value={fac.numero_documento} onChange={e => handleChange(fac.id, 'numero_documento', e.target.value.toUpperCase())} placeholder="F001-1234" className="w-full px-3 py-2 border rounded-lg text-sm font-mono uppercase" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Razón Social</label>
                  <input type="text" required value={fac.cliente} onChange={e => handleChange(fac.id, 'cliente', e.target.value)} placeholder="Nombre del Cliente" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">RUC</label>
                  <input type="text" value={fac.ruc_cliente} onChange={e => handleChange(fac.id, 'ruc_cliente', e.target.value)} placeholder="RUC Cliente" className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Monto Total Bruto</label>
                  <input type="number" step="0.01" required value={fac.monto_total} onChange={e => handleChange(fac.id, 'monto_total', e.target.value)} placeholder="0.00" className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Moneda</label>
                  <select value={fac.moneda} onChange={e => handleChange(fac.id, 'moneda', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                    <option value="SOLES">Soles (PEN)</option><option value="DOLARES">Dólares (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">F. Emisión</label>
                  <input type="date" required value={fac.fecha_emision} onChange={e => handleChange(fac.id, 'fecha_emision', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">F. Vencimiento</label>
                  <input type="date" value={fac.fecha_vencimiento} onChange={e => handleChange(fac.id, 'fecha_vencimiento', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              
              <div className="flex gap-2 pt-5 shrink-0 items-center">
                <label className="flex items-center gap-1 text-xs font-bold text-gray-600 bg-white border border-gray-300 px-2 py-2 rounded-lg cursor-pointer h-[38px]">
                  <input type="checkbox" checked={fac.tiene_detraccion} onChange={e => handleChange(fac.id, 'tiene_detraccion', e.target.checked)} className="rounded text-indigo-600" /> Detracción
                </label>
                
                {fac.tiene_detraccion && (
                  <input 
                    type="number" 
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    placeholder="% Tasa" 
                    value={fac.tasa_detraccion} 
                    onChange={e => handleChange(fac.id, 'tasa_detraccion', e.target.value)} 
                    className="w-20 px-2 py-2 border rounded-lg text-sm font-mono h-[38px] bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                )}

                {facturas.length > 1 && (
                  <button type="button" onClick={() => handleRemoveRow(fac.id)} className="p-2 text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 h-[38px]"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          ))}

          <button type="button" onClick={handleAddRow} className="text-indigo-600 text-sm font-bold flex items-center gap-1 hover:text-indigo-800">
            <Plus className="w-4 h-4" /> Añadir otra factura
          </button>

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
            <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-md">
              <Save className="w-4 h-4" /> {isSaving ? "Guardando..." : "Guardar Facturas"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}