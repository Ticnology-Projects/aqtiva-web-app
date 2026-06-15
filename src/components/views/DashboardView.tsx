"use client";

import { useState, useEffect } from "react";

export default function DashboardView() {
  const [facturas, setFacturas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/facturas")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setFacturas(data.data);
      })
      .catch((err) => console.error("Error cargando facturas:", err))
      .finally(() => setIsLoading(false));
  }, []);

  // 1. Cálculos de KPIs
  const totalFacturas = facturas.length;
  const facturasCobradas = facturas.filter(f => f.estado === "COBRADO");
  const facturasPendientes = facturas.filter(f => f.estado === "PENDIENTE");
  const facturasEnRevision = facturas.filter(f => f.estado === "EN REVISIÓN");

  const porcentajeCobrado = totalFacturas > 0 ? Math.round((facturasCobradas.length / totalFacturas) * 100) : 0;

  const dineroRecuperado = facturasCobradas.reduce((acc, f) => acc + Number(f.monto || 0), 0);
  const dineroEnLimbo = [...facturasPendientes, ...facturasEnRevision].reduce((acc, f) => acc + Number(f.monto || 0), 0);

  // 2. Cálculo del Top 5 Deudores
  const deudaPorCliente = [...facturasPendientes, ...facturasEnRevision].reduce((acc: any, f) => {
    acc[f.cliente] = (acc[f.cliente] || 0) + Number(f.monto || 0);
    return acc;
  }, {});

  const topDeudores = Object.entries(deudaPorCliente)
    .map(([cliente, monto]) => ({ cliente, monto: monto as number }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5);

  if (isLoading) {
    return <div className="flex justify-center items-center h-96"><div className="animate-spin rounded-full h-10 w-10 border-b-4 border-indigo-600"></div></div>;
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Financiero</h1>
        <p className="text-gray-500 mt-1">Resumen en tiempo real del estado de conciliación y cartera por cobrar.</p>
      </div>

      {/* TARJETAS DE KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Dinero Pendiente</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">S/ {dineroEnLimbo.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{facturasPendientes.length + facturasEnRevision.length} facturas por cobrar</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Dinero Recuperado</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">S/ {dineroRecuperado.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{facturasCobradas.length} facturas conciliadas</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Tasa de Cobro</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{porcentajeCobrado}%</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Del total de la cartera subida</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* DISTRIBUCIÓN DE ESTADOS (GRÁFICO DE BARRAS CSS) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Distribución de Estados</h2>
          
          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-green-700">Cobradas ({facturasCobradas.length})</span>
                <span className="text-gray-500">{porcentajeCobrado}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${porcentajeCobrado}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-amber-600">En Revisión ({facturasEnRevision.length})</span>
                <span className="text-gray-500">{totalFacturas > 0 ? Math.round((facturasEnRevision.length / totalFacturas) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${totalFacturas > 0 ? (facturasEnRevision.length / totalFacturas) * 100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-red-600">Pendientes ({facturasPendientes.length})</span>
                <span className="text-gray-500">{totalFacturas > 0 ? Math.round((facturasPendientes.length / totalFacturas) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${totalFacturas > 0 ? (facturasPendientes.length / totalFacturas) * 100 : 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* TOP 5 DEUDORES */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-0 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-800">Top 5 Deudores (Requieren Acción)</h2>
          </div>
          
          {topDeudores.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 text-gray-500">
              <p>No hay deudas pendientes registradas.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {topDeudores.map((deudor, idx) => (
                <li key={idx} className="p-4 hover:bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-red-100 text-red-600 font-bold flex items-center justify-center text-xs">
                      {idx + 1}
                    </div>
                    <span className="font-medium text-gray-800 truncate max-w-[200px]">{deudor.cliente}</span>
                  </div>
                  <span className="font-mono font-bold text-gray-700">
                    S/ {deudor.monto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}