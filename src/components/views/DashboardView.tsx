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

// Función auxiliar para determinar si una fecha está vencida respecto a hoy
const verificarSiEstaVencida = (fechaVencStr: string): boolean => {
  if (!fechaVencStr) return false;
  const partes = fechaVencStr.split("/");
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const anio = parseInt(partes[2], 10);
    
    const fechaVencimiento = new Date(anio, mes, dia);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Normalizar horas para comparar solo el calendario
    
    return fechaVencimiento < hoy;
  }
  return false;
};

export default function DashboardView() {
  const { data: session } = useSession();
  
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.email) return;

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

  // Aislamiento Multi-Tenant
  const userRucs = new Set(empresas.map((e: any) => e.ruc));
  const misFacturas = facturas.filter(f => userRucs.has(f.empresa_emisora_ruc));
  const misVouchers = vouchers.filter(v => userRucs.has(v.empresa_emisora_ruc));

  // ==========================================
  // CÁLCULOS DE KPIs EXTENDIDOS
  // ==========================================
  const totalFacturas = misFacturas.length;
  const facturasCobradas = misFacturas.filter(f => f.estado === "COBRADO");
  const facturasPendientes = misFacturas.filter(f => f.estado === "PENDIENTE");
  const vouchersEnTriaje = misVouchers.filter(v => v.estado === "PENDIENTE_REVISION");
  
  // 🚨 NUEVOS CONTADORES: Vencidas y En Cobranza
  const facturasVencidas = misFacturas.filter(f => f.estado !== "COBRADO" && verificarSiEstaVencida(f.fecha_vencimiento));
  const facturasEnCobranza = misFacturas.filter(f => f.estado === "EN COBRANZA");

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

  // Gráficos
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
    plugins: { legend: { position: 'bottom' as const, labels: { usePointStyle: true, padding: 20 } } },
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

      {/* 🚨 REJILLA DE KPIs EXPANDIDA A 6 ELEMENTOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        
        {/* KPI 1: Total Catálogo */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Catálogo</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">{totalFacturas}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${porcentajeCobrado}%` }}></div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{porcentajeCobrado}% cobrado</p>
          </div>
        </div>

        {/* KPI 2: Documentos Cobrados */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cobrados</p>
              <h3 className="text-2xl font-black text-green-600 mt-1">{facturasCobradas.length}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4 truncate font-medium">
             S/ <span className="font-bold text-green-700">{dineroRecuperado.toLocaleString('en-US')}</span>
          </p>
        </div>

        {/* KPI 3: Pendientes de Pago */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pendientes</p>
              <h3 className="text-2xl font-black text-amber-500 mt-1">{facturasPendientes.length}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4 truncate font-medium">
             S/ <span className="font-bold text-amber-600">{dineroPendientePuro.toLocaleString('en-US')}</span>
          </p>
        </div>

        {/* KPI 4: En Triaje (Revisión) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">En Triaje</p>
              <h3 className="text-2xl font-black text-indigo-500 mt-1">{vouchersEnTriaje.length}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"></path></svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4 truncate font-medium">
             ~ S/ <span className="font-bold text-indigo-600">{dineroEnRevisionPuro.toLocaleString('en-US')}</span>
          </p>
        </div>

        {/* 🚨 KPI 5: CONTADOR FACTURAS VENCIDAS */}
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-5 flex flex-col justify-between bg-red-50/20">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Facturas Vencidas</p>
              <h3 className="text-2xl font-black text-red-600 mt-1">{facturasVencidas.length}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
          </div>
          <p className="text-[10px] text-red-500 mt-4 font-bold uppercase tracking-wide">Requiere Gestión Urgente</p>
        </div>

        {/* 🚨 KPI 6: CONTADOR EN COBRANZA */}
        <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-5 flex flex-col justify-between bg-blue-50/20">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">En Cobranza</p>
              <h3 className="text-2xl font-black text-blue-600 mt-1">{facturasEnCobranza.length}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
            </div>
          </div>
          <p className="text-[10px] text-blue-500 mt-4 font-bold uppercase tracking-wide">Seguimiento Activo</p>
        </div>

      </div>

      {/* (Gráficos inferiores se mantienen intactos y estables) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Estado de Documentos</h2>
          <div className="flex-1 relative min-h-[250px]">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-0 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800">Top 5 Deudores (Críticos)</h2>
          </div>
          {topDeudores.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 text-gray-500"><p>No hay deudas pendientes registradas.</p></div>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-y-auto">
              {topDeudores.map((deudor, idx) => (
                <li key={idx} className="p-4 hover:bg-gray-50 flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-red-50 text-red-600 font-bold flex items-center justify-center text-xs border border-red-100 shrink-0">{idx + 1}</div>
                    <span className="font-bold text-gray-800 text-sm truncate max-w-[150px]">{deudor.cliente}</span>
                  </div>
                  <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-1 rounded">S/ {deudor.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}