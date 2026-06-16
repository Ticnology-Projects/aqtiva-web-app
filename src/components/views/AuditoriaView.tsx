"use client";

import { useState, useEffect } from "react";

export default function AuditoriaView() {
  const [auditorias, setAuditorias] = useState<any[]>([]);
  const [isLoadingAuditoria, setIsLoadingAuditoria] = useState(false);

  const fetchAuditoria = () => {
    setIsLoadingAuditoria(true);
    fetch("/api/auditoria")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAuditorias(data.data);
      })
      .catch((err) => console.error("Error cargando auditoría:", err))
      .finally(() => setIsLoadingAuditoria(false));
  };

  useEffect(() => {
    fetchAuditoria();
  }, []);

  const handleReversar = async (audit: any) => {
    // NUEVO: Mensaje dinámico dependiendo del tipo de auditoría
    const msg = audit.tipo_accion === "ADJUNTO_MANUAL"
      ? `¿Reversar el adjunto de la factura ${audit.numero_documento}?\n\nLa factura seguirá "COBRADA", solo se le eliminará el comprobante visual.`
      : `¿Reversar la conciliación de la factura ${audit.numero_documento}?\n\nLa factura volverá a estar "PENDIENTE" y el voucher regresará a tu bandeja de Triaje.`;

    if (!window.confirm(msg)) return;

    try {
      const res = await fetch("/api/facturas/reversar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_documento: audit.numero_documento,
          s3_key_voucher: audit.voucher_vinculado,
          audit_pk: audit.PK,
          tipo_accion: audit.tipo_accion || "CONCILIACION" // NUEVO: Pasamos la acción
        })
      });

      const data = await res.json();
      if (data.success) {
        alert("Conciliación reversada correctamente.");
        fetchAuditoria(); // Recarga la tabla de auditoría tras reversar
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error al intentar reversar la conciliación.");
    }
  };

  const handleEliminarAuditoria = async (audit: any) => {
    if (!window.confirm(`ADVERTENCIA: ¿Deseas eliminar permanentemente el ticket de auditoría de ${audit.numero_documento} del sistema? Esta acción no se puede deshacer.`)) return;

    try {
      const res = await fetch("/api/auditoria/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_pk: audit.PK })
      });
      const data = await res.json();
      if (data.success) {
        // Refrescar la tabla
        setAuditorias(prev => prev.filter(a => a.PK !== audit.PK));
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Error al intentar eliminar el registro de auditoría.");
    }
  };

  const handleExportarBackup = () => {
    // 1. Preparamos las cabeceras del CSV
    const cabeceras = ["Fecha y Hora", "ID Ticket", "Documento", "Voucher", "Estado", "Acción"];

    // 2. Mapeamos la data de auditoría
    const filas = auditorias.map(audit => [
      new Date(audit.fecha_registro).toLocaleString('es-PE'),
      audit.PK.replace("AUDIT#", ""),
      audit.numero_documento,
      audit.voucher_vinculado ? audit.voucher_vinculado.split('/').pop() : "Manual",
      audit.estado,
      audit.tipo_accion || "CONCILIACION"
    ]);

    // 3. Unimos todo con punto y coma (para que Excel lo lea bien)
    const contenidoCSV = [
      cabeceras.join(";"),
      ...filas.map(fila => fila.join(";"))
    ].join("\n");

    // 4. Forzamos la descarga nativa en el navegador
    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Backup_Auditoria_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial de Conciliaciones</h1>
          <p className="text-gray-500 mt-1">Registro inmutable de todas las facturas procesadas y pagadas.</p>
        </div>
        <button
          onClick={fetchAuditoria}
          className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Refrescar Historial
        </button>
        <button
          onClick={handleExportarBackup}
          className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          Exportar Backup (CSV)
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoadingAuditoria ? (
          <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : auditorias.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg font-medium">No hay registros de auditoría todavía.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Fecha y Hora</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Ticket de Auditoría (ID)</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Factura Afectada</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-500">Voucher Comprobante</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-500">Estado de Cierre</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {auditorias.map((audit, idx) => {
                  const fechaFormat = new Date(audit.fecha_registro).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
                  const voucherName = audit.voucher_vinculado ? audit.voucher_vinculado.split('/').pop().replace(".json", "") : "Asignación Manual";

                  return (
                    <tr key={idx} className={`hover:bg-gray-50 transition-colors ${audit.estado === "REVERSADO" ? "opacity-60" : ""}`}>
                      <td className="px-6 py-4 font-medium text-gray-600">{fechaFormat}</td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200">
                          {audit.PK.replace("AUDIT#", "").substring(0, 20)}...
                        </span>
                      </td>
                      <td className={`px-6 py-4 font-bold ${audit.estado === "REVERSADO" ? "text-gray-500 line-through" : "text-indigo-700"}`}>
                        {audit.numero_documento}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                          <span className="text-gray-700 font-medium text-xs truncate max-w-[150px]" title={voucherName}>{voucherName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {audit.tipo_accion === "REVERSION" ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">ACCIÓN REVERSA</span>
                        ) : audit.tipo_accion === "ADJUNTO_MANUAL" && audit.estado !== "REVERSADO" ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            ADJUNTO MANUAL
                          </span>
                        ) : audit.estado === "REVERSADO" ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">ANULADO</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">CERRADO</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {/* El botón de reversar existente */}
                          {audit.estado === "AUDITADO" && audit.tipo_accion !== "REVERSION" && (
                            <button onClick={() => handleReversar(audit)} className="text-red-600 hover:text-red-900 font-semibold text-xs border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-colors">
                              Reversar
                            </button>
                          )}
                          {/* EL NUEVO BOTÓN DE ELIMINAR */}
                          <button onClick={() => handleEliminarAuditoria(audit)} className="text-gray-500 hover:text-gray-800 font-semibold text-xs border border-gray-200 hover:border-gray-400 bg-white hover:bg-gray-100 px-3 py-1.5 rounded transition-colors" title="Borrar registro permanentemente">
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}