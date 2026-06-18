"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react"; // 🚨 1. Importamos la sesión
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
  const { data: session } = useSession(); // 🚨 2. Obtenemos el usuario activo
  
  const [empresas, setEmpresas] = useState<any[]>([]); // 🚨 3. Declaramos el estado de empresas
  const [facturas, setFacturas] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.email) return;

    // 🚨 4. Cargamos las facturas, vouchers Y EMPRESAS al mismo tiempo
    Promise.all([
      fetch("/api/facturas").then((res) => res.json()),
      fetch("/api/vouchers").then((res) => res.json()),
      fetch(`/api/empresas?usuarioId=${encodeURIComponent(session.user.email)}`).then((res) => res.json())
    ])
      .then(([facturasData, vouchersData, empresasData]) => {
        if (facturasData.success) setFacturas(facturasData.data);
        if (vouchersData.success) setVouchers(vouchersData.data);
        if (empresasData.success) setEmpresas(empresasData.data);
      })
      .catch((err) => console.error("Error cargando datos del Dashboard:", err))
      .finally(() => setIsLoading(false));
  }, [session]);

  // 🚨 5. Le decimos a TypeScript que 'e' es de tipo any
  const userRucs = new Set(empresas.map((e: any) => e.ruc));
  const misFacturas = facturas.filter(f => userRucs.has(f.empresa_emisora_ruc));
  const misVouchers = vouchers.filter(v => userRucs.has(v.empresa_emisora_ruc));

  // ==========================================
  // CÁLCULOS DE KPIs
  // ==========================================
  const totalFacturas = misFacturas.length;
  const facturasCobradas = misFacturas.filter(f => f.estado === "COBRADO");
  const facturasPendientes = misFacturas.filter(f => f.estado === "PENDIENTE");
  const vouchersEnTriaje = misVouchers.filter(v => v.estado === "PENDIENTE_REVISION")

  const porcentajeCobrado = totalFacturas > 0 ? Math.round((facturasCobradas.length / totalFacturas) * 100) : 0;

  const dineroRecuperado = facturasCobradas.reduce((acc, f) => acc + Number(f.monto || 0), 0);
  const dineroPendientePuro = facturasPendientes.reduce((acc, f) => acc + Number(f.monto || 0), 0);
  
  const dineroEnRevisionPuro = vouchersEnTriaje.reduce((acc, v) => {
    const montoSugerido = v.conciliacion?.factura_sugerida?.monto_total || 0;
    return acc + Number(montoSugerido);
  }, 0);

  const deudaPorCliente: Record<string, number> = {};
  facturasPendientes.forEach(f => {
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
  
  const doughnutData = {
    labels: ['Cobradas', 'Pendientes', 'En Triaje'],
    datasets: [
      {
        data: [facturasCobradas.length, facturasPendientes.length, vouchersEnTriaje.length],
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
      legend: { position: 'bottom' as const, labels: { usePointStyle: true, padding: 20 } }
    },
    cutout: '70%',
  };

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
             <span className="font-bold text-green-700">S/ {dineroRecuperado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> recuperados
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
             <span className="font-bold text-amber-600">S/ {dineroPendientePuro.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> por cobrar
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">En Triaje (Revisión)</p>
              <h3 className="text-3xl font-black text-indigo-500 mt-1">{vouchersEnTriaje.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-4 font-medium flex items-center gap-1">
             <span className="font-bold text-indigo-600">~ S/ {dineroEnRevisionPuro.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> sugeridos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Estado de Documentos</h2>
          <div className="flex-1 relative min-h-[250px]">
            {totalFacturas > 0 || vouchersEnTriaje.length > 0 ? (
              <Doughnut data={doughnutData} options={doughnutOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">Sin datos</div>
            )}
          </div>
          <div className="mt-4 text-center">
            <p className="text-2xl font-black text-gray-900">{totalFacturas + vouchersEnTriaje.length}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Documentos Totales en Sistema</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Distribución de Flujo (S/)</h2>
          <div className="flex-1 relative min-h-[250px]">
            {totalFacturas > 0 || vouchersEnTriaje.length > 0 ? (
              <Bar data={barData} options={barOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">Sin datos</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-0 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800">Top 5 Deudores (Críticos)</h2>
          </div>
          
          {topDeudores.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 text-gray-500">
              <p>No hay deudas pendientes registradas.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-y-auto">
              {topDeudores.map((deudor, idx) => (
                <li key={idx} className="p-4 hover:bg-gray-50 flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-red-50 text-red-600 font-bold flex items-center justify-center text-xs border border-red-100 shrink-0">
                      {idx + 1}
                    </div>
                    <span className="font-bold text-gray-800 text-sm truncate max-w-[150px]" title={deudor.cliente}>{deudor.cliente}</span>
                  </div>
                  <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-1 rounded whitespace-nowrap">
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