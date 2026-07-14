"use client";

import { useState, useEffect } from "react";
import FacturaDetailsModal from "../modals/FacturaDetailsModal";
import FacturaManualModal from "../modals/FacturaManualModal";
import { useSession } from "next-auth/react";

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
    if (parts[0].length === 4) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
    }
  }
  return new Date(dateStr).getTime() || 0;
};

const displayDate = (dateStr: string) => {
  if (!dateStr) return 'Sin fecha';
  if (dateStr.includes('/')) return dateStr;
  if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const getCurrencySymbol = (monedaStr: string) => {
  if (!monedaStr) return "S/";
  const m = monedaStr.toUpperCase();
  if (m === "USD" || m.includes("DOLAR") || m.includes("DÓLAR")) return "$";
  if (m === "EUR" || m.includes("EURO")) return "€";
  return "S/";
};

export default function CatalogoView() {
  const { data: session } = useSession();
  
  const [facturas, setFacturas] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [empresaFiltro, setEmpresaFiltro] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"TODOS" | "COBRADO" | "PENDIENTE" | "EN REVISIÓN">("TODOS");
  const [filtroOrigen, setFiltroOrigen] = useState<"TODOS" | "AUTO_IA" | "MANUAL">("TODOS");
  
  // 🚨 NUEVO: Estados para el filtro de rango de fechas
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [facturaDetails, setFacturaDetails] = useState<any | null>(null);

  const [isFacturaModalOpen, setIsFacturaModalOpen] = useState(false);

  const tenantId = (session?.user as any)?.tenantId || session?.user?.email;
  const userRole = (session?.user as any)?.rol || 'USER';

  const fetchFacturas = () => {
    if (!tenantId) return;
    setIsLoading(true);
    fetch(`/api/facturas?tenantId=${encodeURIComponent(tenantId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const sortedData = data.data.sort((a: any, b: any) => parseCustomDate(b.fecha_emision) - parseCustomDate(a.fecha_emision));
          setFacturas(sortedData);
          setSelectedIds(new Set());
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/empresas?tenantId=${encodeURIComponent(tenantId)}`)
      .then(res => res.json())
      .then(data => { if (data.success) setEmpresas(data.data); })
      .catch(err => console.error(err));
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchFacturas();
    }
  }, [tenantId]);

  const getEmpresaNombre = (ruc: string) => {
    const emp = empresas.find(e => e.ruc === ruc);
    return emp ? emp.nombreOriginal : "Empresa Desconocida";
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFacturas.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredFacturas.map(f => f.numero_documento)));
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

  const handleExportar = () => {
    const cabeceras = ["Documento", "RUC Cliente", "Cliente", "Monto", "Moneda", "Fecha Emisión", "Vencimiento", "Estado", "Método Resolucion"];
    const filas = filteredFacturas.map(f => [
      f.numero_documento,
      f.ruc_cliente,
      f.cliente,
      f.monto,
      f.moneda || 'SOLES',
      displayDate(f.fecha_emision),
      displayDate(f.fecha_vencimiento),
      f.estado,
      f.metodo_resolucion || "N/A"
    ]);

    const contenidoCSV = [cabeceras.join(";"), ...filas.map(fila => fila.join(";"))].join("\n");
    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Catalogo_Facturas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const userRucs = new Set(empresas.map(e => e.ruc));
  const facturasDelUsuario = facturas.filter(f => userRucs.has(f.empresa_emisora_ruc));
  const facturasPorEmpresa = facturasDelUsuario.filter(f => !empresaFiltro || f.empresa_emisora_ruc === empresaFiltro);

  const filteredFacturas = facturasPorEmpresa.filter((f) => {
    if (filtroOrigen === "AUTO_IA" && f.metodo_resolucion !== "AUTOMATICO_IA") return false;
    if (filtroOrigen === "MANUAL" && f.metodo_resolucion === "AUTOMATICO_IA") return false;
    
    // 🚨 MODIFICADO: Búsqueda combinada (Texto o Monto)
    const term = searchTerm.toLowerCase();
    const montoText = String(f.monto || "");
    const montoNetoText = String(f.monto_neto_pagar || "");

    const matchSearch = !term ||
      f.numero_documento?.toLowerCase().includes(term) ||
      f.cliente?.toLowerCase().includes(term) ||
      f.ruc_cliente?.toLowerCase().includes(term) ||
      montoText.includes(term) ||
      montoNetoText.includes(term);

    const matchEstado = filtroEstado === "TODOS" || f.estado === filtroEstado;
    
    // 🚨 NUEVO: Lógica del Rango de Fechas
    let matchFecha = true;
    if (fechaInicio || fechaFin) {
      const fDate = parseCustomDate(f.fecha_emision);
      if (fDate > 0) {
        // Formateamos las fechas al inicio y fin del día para comparación exacta
        const start = fechaInicio ? new Date(`${fechaInicio}T00:00:00`).getTime() : 0;
        const end = fechaFin ? new Date(`${fechaFin}T23:59:59`).getTime() : Infinity;
        matchFecha = fDate >= start && fDate <= end;
      } else {
        matchFecha = false; // Si buscamos por fecha y no tiene fecha, lo ocultamos
      }
    }

    return matchSearch && matchEstado && matchFecha;
  });

  const cobradoPEN = filteredFacturas.filter(f => f.estado === 'COBRADO' && (f.moneda === 'SOLES' || !f.moneda)).reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
  const cobradoUSD = filteredFacturas.filter(f => f.estado === 'COBRADO' && f.moneda === 'USD').reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
  
  const pendientePEN = filteredFacturas.filter(f => f.estado !== 'COBRADO' && (f.moneda === 'SOLES' || !f.moneda)).reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
  const pendienteUSD = filteredFacturas.filter(f => f.estado !== 'COBRADO' && f.moneda === 'USD').reduce((acc, curr) => acc + Number(curr.monto || 0), 0);

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo de Facturas</h1>
          <p className="text-gray-500 mt-1">Gestiona {filteredFacturas.length} comprobantes de venta.</p>
        </div>
        <div className="flex gap-4 items-end">
          <div className="flex gap-2 text-right">
            <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-200">
              <p className="text-[10px] uppercase font-bold text-green-700 tracking-wider">Cobrado Total</p>
              <p className="text-lg font-black text-green-700">S/ {cobradoPEN.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              {cobradoUSD > 0 && <p className="text-sm font-bold text-green-600 border-t border-green-200/50 mt-1 pt-1">$ {cobradoUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
            </div>
            <div className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
              <p className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Por Cobrar</p>
              <p className="text-lg font-black text-amber-700">S/ {pendientePEN.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              {pendienteUSD > 0 && <p className="text-sm font-bold text-amber-600 border-t border-amber-200/50 mt-1 pt-1">$ {pendienteUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
            </div>
          </div>
          <button 
            onClick={() => { 
              if(!empresaFiltro) alert("Selecciona un emisor (empresa) en el filtro de abajo para asociar las facturas."); 
              else setIsFacturaModalOpen(true); 
            }} 
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap h-[fit-content] pb-3 pt-3"
          >
            + Nueva Factura
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        
        {/* FILA 1: Búsqueda, Rango de Fechas y Empresa */}
        <div className="flex flex-col sm:flex-row gap-3 w-full items-center">
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <input
              type="text"
              placeholder="Buscar por documento, cliente, RUC o Monto (Ej. 150.00)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
            />
          </div>

          {/* 🚨 NUEVO: Rango de Fechas */}
          <div className="flex items-center bg-gray-50 border border-gray-300 rounded-lg px-3 py-2.5 w-full sm:w-auto">
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              title="Fecha Inicial"
              className="bg-transparent text-sm outline-none text-gray-600 w-full sm:w-[130px]"
            />
            <span className="text-gray-400 mx-2">a</span>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              title="Fecha Final"
              className="bg-transparent text-sm outline-none text-gray-600 w-full sm:w-[130px]"
            />
            {(fechaInicio || fechaFin) && (
              <button 
                onClick={() => { setFechaInicio(""); setFechaFin(""); }}
                className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Limpiar fechas"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={empresaFiltro}
            onChange={(e) => setEmpresaFiltro(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-[220px] bg-white font-medium text-gray-700"
          >
            <option value="">Todas las empresas</option>
            {empresas.map(emp => (
              <option key={emp.ruc} value={emp.ruc}>{emp.nombreOriginal}</option>
            ))}
          </select>
        </div>

        {/* FILA 2: Botones de Estado, Origen y Acciones */}
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-between items-center flex-wrap">

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto shrink-0">
              <button onClick={() => setFiltroOrigen("TODOS")} className={`px-3 py-1.5 rounded-md text-xs font-bold flex-1 sm:flex-none ${filtroOrigen === "TODOS" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>Todos</button>
              <button onClick={() => setFiltroOrigen("AUTO_IA")} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1 flex-1 sm:flex-none ${filtroOrigen === "AUTO_IA" ? "bg-indigo-100 text-indigo-700 shadow-sm" : "text-gray-500 hover:text-indigo-600"}`}>🤖 Auto IA</button>
              <button onClick={() => setFiltroOrigen("MANUAL")} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1 flex-1 sm:flex-none ${filtroOrigen === "MANUAL" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>👤 Manual</button>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto shrink-0">
              <button onClick={() => setFiltroEstado("TODOS")} className={`px-4 py-1.5 rounded-md text-sm font-bold flex-1 sm:flex-none ${filtroEstado === "TODOS" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>Todos</button>
              <button onClick={() => setFiltroEstado("PENDIENTE")} className={`px-4 py-1.5 rounded-md text-sm font-bold flex-1 sm:flex-none ${filtroEstado === "PENDIENTE" ? "bg-white shadow-sm text-amber-600" : "text-gray-500 hover:text-amber-600"}`}>Pendientes</button>
              <button onClick={() => setFiltroEstado("COBRADO")} className={`px-4 py-1.5 rounded-md text-sm font-bold flex-1 sm:flex-none ${filtroEstado === "COBRADO" ? "bg-white shadow-sm text-green-600" : "text-gray-500 hover:text-green-600"}`}>Cobrados</button>
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto shrink-0">
            <button onClick={handleExportar} className="flex-1 sm:flex-none bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors shadow-sm flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Exportar CSV
            </button>
            
            {userRole === 'ADMIN' && selectedIds.size > 0 && (
              <button onClick={() => handleDelete(filteredFacturas.filter(f => selectedIds.has(f.numero_documento)))} disabled={isDeleting} className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                {isDeleting ? "Borrando..." : `Borrar (${selectedIds.size})`}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : filteredFacturas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <p className="text-lg font-medium">No hay facturas que coincidan con los filtros.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                {userRole === 'ADMIN' && (
                  <th className="px-4 py-4 w-12 text-center">
                    <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" checked={selectedIds.size > 0 && selectedIds.size === filteredFacturas.length} onChange={toggleSelectAll} />
                  </th>
                )}
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Documento</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Empresa (Cobrador)</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Cliente a Cobrar</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Emisión</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">Monto Total</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-center">Estado</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredFacturas.map((factura) => (
                <tr key={factura.PK} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(factura.numero_documento) ? 'bg-indigo-50/30' : ''}`}>
                  
                  {userRole === 'ADMIN' && (
                    <td className="px-4 py-4 text-center">
                      <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" checked={selectedIds.has(factura.numero_documento)} onChange={() => toggleSelectOne(factura.numero_documento)} />
                    </td>
                  )}
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-700">{factura.numero_documento}</span>
                      {factura.metodo_resolucion === "AUTOMATICO_IA" && (
                        <span className="bg-indigo-50 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-indigo-100" title="Conciliada Automáticamente">
                          🤖 IA
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-1">Vence: {displayDate(factura.fecha_vencimiento)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-800 text-xs truncate max-w-[150px] uppercase" title={getEmpresaNombre(factura.empresa_emisora_ruc)}>{getEmpresaNombre(factura.empresa_emisora_ruc)}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {factura.empresa_emisora_ruc}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900 truncate max-w-[200px]">{factura.cliente}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">RUC: {factura.ruc_cliente}</p>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-600">
                    {displayDate(factura.fecha_emision)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="font-bold text-gray-900">
                      <span className="mr-1 text-gray-500 font-mono">{getCurrencySymbol(factura.moneda)}</span>
                      {Number(factura.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${factura.estado === 'COBRADO' ? 'bg-green-100 text-green-800' : factura.estado === 'EN REVISIÓN' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                      {factura.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {userRole === 'ADMIN' && factura.estado === "PENDIENTE" && (
                        <button onClick={() => handleDelete([factura])} className="text-red-500 hover:text-red-700 font-bold text-xs">
                          Eliminar
                        </button>
                      )}
                      <button onClick={() => setFacturaDetails(factura)} className="text-indigo-600 hover:text-indigo-900 font-bold text-xs bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors">
                        Ver
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {facturaDetails && (
        <FacturaDetailsModal 
          facturaDetails={facturaDetails} 
          onClose={() => setFacturaDetails(null)} 
          onRefresh={fetchFacturas} 
        />
      )}

      {isFacturaModalOpen && (
        <FacturaManualModal 
          rucEmisor={empresaFiltro}
          empresaNombre={getEmpresaNombre(empresaFiltro)}
          onClose={() => setIsFacturaModalOpen(false)} 
          onSuccess={fetchFacturas} 
        />
      )}
    </div>
  );
}