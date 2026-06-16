"use client";

import { useState, useEffect } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";

// Registramos los componentes de Chart.js
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

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

  // Cálculos de KPIs
  const totalFacturas = facturas.length;
  const facturasCobradas = facturas.filter(f => f.estado === "COBRADO");
  const facturasPendientes = facturas.filter(f => f.estado === "PENDIENTE");
  const facturasEnRevision = facturas.filter(f => f.estado === "EN REVISIÓN");

  const porcentajeCobrado = totalFacturas > 0 ? Math.round((facturasCobradas.length / totalFacturas) * 100) : 0;

  const dineroRecuperado = facturasCobradas.reduce((acc, f) => acc + Number(f.monto || 0), 0);
  const dineroEnLimbo = [...facturasPendientes, ...facturasEnRevision].reduce((acc, f) => acc + Number(f.monto || 0), 0);
  const dineroPendientePuro = facturasPendientes.reduce((acc, f) => acc + Number(f.monto || 0), 0);
  const dineroEnRevisionPuro = facturasEnRevision.reduce((acc, f) => acc + Number(f.monto || 0), 0);

  // Top 5 Deudores
  const deudaPorCliente: Record<string, number> = {};
  [...facturasPendientes, ...facturasEnRevision].forEach(f => {
    if (f.cliente) {
      deudaPorCliente[f.cliente] = (deudaPorCliente[f.cliente] || 0) + Number(f.monto || 0);
    }
  });

  const topDeudores = Object.entries(deudaPorCliente)
    .sort(([, montoA], [, montoB]) => montoB - montoA)
    .slice(0, 5)
    .map(([cliente, monto]) => ({ cliente, monto }));

  // ==========================================
  // CONFIGURACIÓN DE GRÁFICOS (CHART.JS)
  // ==========================================
  
  // Gráfico 1: Dona (Distribución por cantidad de documentos)
  const doughnutData = {
    labels: ['Cobradas', 'Pendientes', 'En Revisión'],
    datasets: [
      {
        data: [facturasCobradas.length, facturasPendientes.length, facturasEnRevision.length],
        backgroundColor: ['#10B981', '#F59E0B', '#6366F1'],
        hoverBackgroundColor: ['#059669', '#D97706', '#4F46E5'],
        borderWidth: 0,
      },
    ],
  };

  const doughnutOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
    },
    cutout: '70%',
  };

  // Gráfico 2: Barras (Distribución de flujo de caja)
  const barData = {
    labels: ['Flujo Recuperado', 'Por Cobrar', 'En Triaje'],
    datasets: [
      {
        label: 'Monto en Soles (S/)',
        data: [dineroRecuperado, dineroPendientePuro, dineroEnRevisionPuro],
        backgroundColor: ['#10B981', '#F59E0B', '#6366F1'],
        borderRadius: 6,
      },
    ],
  };

  // 🚨 CORRECCIÓN: Agregamos ": any" aquí también
  const barOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { borderDash: [4, 4] } },
      x: { grid: { display: false } }
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Resumen Financiero</h1>
        <p className="text-gray-500 mt-1">Métricas de conciliación y cuentas por cobrar en tiempo real.</p>
      </div>

      {/* TARJETAS DE KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Catálogo</p>
              <h3 className="text-3xl font-black text-gray-900 mt-1">{totalFacturas}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${porcentajeCobrado}%` }}></div>
          </div>
          <p className="text-xs text-gray-500 mt-2 font-medium">{porcentajeCobrado}% de avance general</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Documentos Cobrados</p>
              <h3 className="text-3xl font-black text-green-600 mt-1">{facturasCobradas.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-4 font-medium flex items-center gap-1">
             <span className="font-bold text-green-700">S/ {dineroRecuperado.toLocaleString('en-US')}</span> recuperados
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Pendientes de Pago</p>
              <h3 className="text-3xl font-black text-amber-500 mt-1">{facturasPendientes.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-4 font-medium flex items-center gap-1">
             <span className="font-bold text-amber-600">S/ {dineroEnLimbo.toLocaleString('en-US')}</span> por cobrar
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">En Triaje (Revisión)</p>
              <h3 className="text-3xl font-black text-indigo-500 mt-1">{facturasEnRevision.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-4 font-medium flex items-center gap-1">
             Faltan conciliar con IA
          </p>
        </div>
      </div>

      {/* SECCIÓN DE GRÁFICOS Y DEUDORES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRÁFICO 1: Estado de Documentos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Estado de Documentos</h2>
          <div className="flex-1 relative min-h-[250px]">
            {totalFacturas > 0 ? (
              <Doughnut data={doughnutData} options={doughnutOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">Sin datos</div>
            )}
          </div>
          <div className="mt-4 text-center">
            <p className="text-2xl font-black text-gray-900">{totalFacturas}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Facturas Totales</p>
          </div>
        </div>

        {/* GRÁFICO 2: Distribución de Flujo */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Distribución de Flujo (S/)</h2>
          <div className="flex-1 relative min-h-[250px]">
            {totalFacturas > 0 ? (
              <Bar data={barData} options={barOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">Sin datos</div>
            )}
          </div>
        </div>

        {/* TOP 5 DEUDORES */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-0 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800">Top 5 Deudores (Críticos)</h2>
          </div>
          
          {topDeudores.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 text-gray-500">
              <p>No hay deudas pendientes registradas.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {topDeudores.map((deudor, idx) => (
                <li key={idx} className="p-4 hover:bg-gray-50 flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-red-50 text-red-600 font-bold flex items-center justify-center text-xs border border-red-100">
                      {idx + 1}
                    </div>
                    <span className="font-bold text-gray-800 text-sm truncate max-w-[150px]">{deudor.cliente}</span>
                  </div>
                  <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-1 rounded">
                    S/ {deudor.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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