"use client";

import { useState, useEffect } from "react";
import FacturaDetailsModal from "../modals/FacturaDetailsModal";

const parseCustomDate = (dateStr: string): number => {
  if (!dateStr) return 0;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day).getTime();
  }
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 4) return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
  }
  return new Date(dateStr).getTime() || 0;
};

const displayDate = (dateStr: string) => {
  if (!dateStr) return 'Sin fecha';
  if (dateStr.includes('/')) return dateStr;
  if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  return dateStr;
};

export default function CatalogoView() {
  const [facturas, setFacturas] = useState<any[]>([]);
  const [isLoadingFacturas, setIsLoadingFacturas] = useState(false);
  const [facturaDetails, setFacturaDetails] = useState<any | null>(null);

  // Estados para Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState("");

  // ESTADO PARA SELECCIÓN MULTIPLE
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchFacturas = () => {
    setIsLoadingFacturas(true);
    fetch("/api/facturas")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const sorted = data.data.sort((a: any, b: any) => parseCustomDate(b.fecha_emision) - parseCustomDate(a.fecha_emision));
          setFacturas(sorted);
          setSelectedIds(new Set()); // Limpiar selección al refrescar
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoadingFacturas(false));
  };

  useEffect(() => { fetchFacturas(); }, []);

  const handleExportarBackup = () => {
    const cabeceras = ["Documento", "Empresa Emisora", "RUC Emisor", "Cliente", "RUC Cliente", "Monto", "Moneda", "Estado", "Fecha Emision", "Voucher Vinculado"];
    const dataAExportar = (searchTerm || fechaInicio || fechaFin || montoMin || montoMax) ? filteredFacturas : facturas;

    const filas = dataAExportar.map(f => [
      f.numero_documento, f.empresa_emisora_nombre || "N/A", f.empresa_emisora_ruc || "N/A", f.cliente, f.ruc_cliente || "N/A",
      Number(f.monto || 0).toFixed(2), f.moneda || "PEN", f.estado, displayDate(f.fecha_emision),
      f.voucher_conciliado ? f.voucher_conciliado.split('/').pop() : "Ninguno"
    ]);

    const contenidoCSV = [cabeceras.join(";"), ...filas.map(fila => fila.join(";"))].join("\n");
    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Backup_Catalogo_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredFacturas = facturas.filter((factura) => {
    const term = searchTerm.toLowerCase();
    const matchSearch = !term || factura.numero_documento?.toLowerCase().includes(term) || factura.cliente?.toLowerCase().includes(term) || factura.estado?.toLowerCase().includes(term);
    const fMonto = Number(factura.monto || 0);
    const matchMonto = fMonto >= (montoMin ? Number(montoMin) : 0) && fMonto <= (montoMax ? Number(montoMax) : Infinity);
    
    // NUEVO FILTRO POR EMPRESA
    const matchEmpresa = !empresaFiltro || factura.empresa_emisora_nombre === empresaFiltro;

    let matchFecha = true;
    if (fechaInicio || fechaFin) {
      if (!factura.fecha_emision) matchFecha = false; 
      else {
        const fDate = parseCustomDate(factura.fecha_emision);
        const start = fechaInicio ? parseCustomDate(fechaInicio) : 0;
        const end = fechaFin ? parseCustomDate(fechaFin) + 86399999 : Infinity; 
        matchFecha = fDate >= start && fDate <= end;
      }
    }
    return matchSearch && matchMonto && matchFecha && matchEmpresa; // <- Añadido matchEmpresa
  });

  const clearFilters = () => { setSearchTerm(""); setFechaInicio(""); setFechaFin(""); setMontoMin(""); setMontoMax(""); };

  // ==========================================
  // LÓGICA DE SELECCIÓN Y ELIMINACIÓN
  // ==========================================
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFacturas.length) {
      setSelectedIds(new Set()); // Deseleccionar todos
    } else {
      setSelectedIds(new Set(filteredFacturas.map(f => f.numero_documento))); // Seleccionar todos
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleDelete = async (facturasAEliminar: any[]) => {
    const confirmDelete = window.confirm(`¿Estás seguro de que deseas eliminar ${facturasAEliminar.length} factura(s) de la base de datos?\n\nNota: Los comprobantes adjuntos en S3 no serán eliminados.`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      // 🚨 CORRECCIÓN AQUÍ: Ahora enviamos f.PK al backend
      const payload = facturasAEliminar.map(f => ({ 
        PK: f.PK, 
        numero_documento: f.numero_documento 
      }));

      const res = await fetch("/api/facturas/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facturas: payload })
      });

      const data = await res.json();
      if (data.success) {
        setFacturas(prev => prev.filter(f => !payload.some(p => p.numero_documento === f.numero_documento)));
        setSelectedIds(new Set());
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Error de red al intentar eliminar.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo de Facturas</h1>
          <p className="text-gray-500 mt-1">Total: {filteredFacturas.length} registros mostrados.</p>
        </div>
      </div>

      <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <input type="text" placeholder="Buscar por documento, cliente o estado..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg leading-5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 sm:text-sm" />
          </div>

          <div className="flex gap-2 w-full sm:w-auto shrink-0 flex-wrap">
            
            {/* BOTÓN ELIMINAR SELECCIONADOS */}
            {selectedIds.size > 0 && (
              <button 
                onClick={() => handleDelete(filteredFacturas.filter(f => selectedIds.has(f.numero_documento)))}
                disabled={isDeleting}
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-red-100 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                {isDeleting ? "Borrando..." : `Eliminar (${selectedIds.size})`}
              </button>
            )}

            <button onClick={() => setShowFilters(!showFilters)} className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 border transition-colors ${showFilters ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Filtros</button>
            <button onClick={handleExportarBackup} className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-100 flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg></button>
            <button onClick={fetchFacturas} className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
          </div>
        </div>

        {/* ... (Filtros Avanzados intactos) ... */}
        {showFilters && (
          <div className="pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Periodo de Emisión</p>
              <div className="flex items-center gap-2">
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-700 outline-none focus:border-indigo-500" />
                <span className="text-gray-400">-</span>
                <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-700 outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Rango de Monto (S/)</p>
              <div className="flex items-center gap-2">
                <input type="number" placeholder="Min" value={montoMin} onChange={(e) => setMontoMin(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-700 outline-none focus:border-indigo-500" />
                <span className="text-gray-400">-</span>
                <input type="number" placeholder="Max" value={montoMax} onChange={(e) => setMontoMax(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-700 outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Empresa (Cobrador)</p>
              <select 
                value={empresaFiltro} 
                onChange={(e) => setEmpresaFiltro(e.target.value)} 
                className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-700 outline-none focus:border-indigo-500 bg-white"
              >
                <option value="">Todas las empresas</option>
                {/* Extraemos las empresas únicas que existen en la tabla */}
                {Array.from(new Set(facturas.map(f => f.empresa_emisora_nombre).filter(Boolean))).map((empresa: any) => (
                  <option key={empresa} value={empresa}>{empresa}</option>
                ))}
              </select>
            </div>
            {(fechaInicio || fechaFin || montoMin || montoMax || searchTerm) && (
              <div className="md:col-span-2 flex justify-end"><button onClick={clearFilters} className="text-sm font-semibold text-red-600 hover:text-red-800">Limpiar todos los filtros</button></div>
            )}
          </div>
        )}
      </div>

      {/* TABLA DE DATOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoadingFacturas ? (
          <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : filteredFacturas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg font-medium">No se encontraron resultados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredFacturas.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Documento / Fecha</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Empresa (Cobrador)</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Cliente a cobrar</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-500">Monto</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-500">Estado</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredFacturas.map((factura, idx) => (
                  <tr key={idx} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(factura.numero_documento) ? 'bg-indigo-50/30' : ''}`}>
                    <td className="px-4 py-4 text-center">
                      <input 
                        type="checkbox" 
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                        checked={selectedIds.has(factura.numero_documento)}
                        onChange={() => toggleSelectOne(factura.numero_documento)}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{factura.numero_documento}</p>
                      <p className="text-xs text-gray-500 mt-0.5 font-medium">{displayDate(factura.fecha_emision)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-indigo-700 font-bold text-sm truncate max-w-[200px]">{factura.empresa_emisora_nombre || 'N/A'}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {factura.empresa_emisora_ruc || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-gray-900 font-medium truncate max-w-[200px]">{factura.cliente}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {factura.ruc_cliente || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-gray-700">
                      {factura.moneda === 'USD' ? '$' : 'S/'} {Number(factura.monto || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${factura.estado === 'COBRADO' ? 'bg-green-100 text-green-800' : factura.estado === 'EN REVISIÓN' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                        {factura.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleDelete([factura])} className="text-red-600 hover:text-red-900 font-semibold text-xs border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-colors">
                          Borrar
                        </button>
                        <button onClick={() => setFacturaDetails(factura)} className="text-indigo-600 hover:text-indigo-900 font-semibold text-xs border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors">
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FacturaDetailsModal facturaDetails={facturaDetails} onClose={() => setFacturaDetails(null)} onRefresh={fetchFacturas} />
    </div>
  );
}