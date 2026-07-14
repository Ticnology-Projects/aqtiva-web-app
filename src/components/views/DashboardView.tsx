
"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
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
import { AlertCircle, Clock, Wallet, DollarSign, FileText, CheckCircle, AlertTriangle, Download } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const parseFecha = (fechaStr: string) => {
  if (!fechaStr) return new Date();
  const partes = fechaStr.split(/[-/]/);
  if (partes.length === 3) {
    return partes[0].length === 4 
      ? new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2])) 
      : new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0])); 
  }
  return new Date();
};

export default function DashboardView() {
  const { data: session } = useSession();
  const tenantId = (session?.user as any)?.tenantId || session?.user?.email;

  const doughnutRef = useRef<any>(null);
  const barRef = useRef<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  const [listaFacturas, setListaFacturas] = useState<any[]>([]);

  const [deudaPEN, setDeudaPEN] = useState(0);
  const [deudaUSD, setDeudaUSD] = useState(0);
  const [stats, setStats] = useState({ pendientes: 0, cobradas: 0, vencidas: 0 });
  const [agingData, setAgingData] = useState({ porVencer: 0, vencidas1a30: 0, vencidas31a60: 0, vencidasMas60: 0 });
  const [triajePendientes, setTriajePendientes] = useState(0);
  const [topUrgentes, setTopUrgentes] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [facturasRes, vouchersRes] = await Promise.all([
          fetch(`/api/facturas?tenantId=${encodeURIComponent(tenantId)}`),
          fetch(`/api/vouchers`)
        ]);

        const facturasData = await facturasRes.json();
        const vouchersData = await vouchersRes.json();

        if (vouchersData.success) {
          const vouchers = vouchersData.data || [];
          setTriajePendientes(vouchers.filter((v: any) => v.estado === "PENDIENTE_REVISION").length);
        }

        if (facturasData.success) {
          const facturas = facturasData.data || [];
          setListaFacturas(facturas);

          const hoy = new Date();
          hoy.setHours(0, 0, 0, 0);

          let pen = 0, usd = 0;
          let counts = { pendientes: 0, cobradas: 0, vencidas: 0 };
          let buckets = { porVencer: 0, vencidas1a30: 0, vencidas31a60: 0, vencidasMas60: 0 };
          let urgentes: any[] = [];

          facturas.forEach((fac: any) => {
            const fechaVenc = parseFecha(fac.fecha_vencimiento);
            const diffTime = hoy.getTime() - fechaVenc.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            if (fac.estado === "PENDIENTE") {
              counts.pendientes++;
              if (diffDays > 0) counts.vencidas++;

              const monto = parseFloat(fac.monto_neto_pagar || fac.monto || 0);
              const moneda = (fac.moneda || "PEN").toUpperCase();
              
              if (moneda.includes("USD") || moneda.includes("DÓLAR")) usd += monto;
              else pen += monto;

              if (diffDays <= 0) buckets.porVencer += 1;
              else if (diffDays <= 30) buckets.vencidas1a30 += 1;
              else if (diffDays <= 60) buckets.vencidas31a60 += 1;
              else buckets.vencidasMas60 += 1;

              if (diffDays >= -7 && diffDays <= 15) {
                urgentes.push({ ...fac, diffDays, fechaVenc });
              }
            } else if (fac.estado === "COBRADO") {
              counts.cobradas++;
            }
          });

          urgentes.sort((a, b) => parseFloat(b.monto || 0) - parseFloat(a.monto || 0));
          
          setDeudaPEN(pen);
          setDeudaUSD(usd);
          setStats(counts);
          setAgingData(buckets);
          setTopUrgentes(urgentes.slice(0, 5));
        }
      } catch (error) {
        console.error("Error cargando dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [tenantId]);

  const handleExportToExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Reporte Financiero");

      // 1. Cabeceras (Base de Datos a la izquierda, Resumen a la derecha)
      sheet.getCell('A1').value = "NÚMERO DOC";
      sheet.getCell('B1').value = "CLIENTE";
      sheet.getCell('C1').value = "EMISIÓN";
      sheet.getCell('D1').value = "VENCIMIENTO";
      sheet.getCell('E1').value = "MONEDA";
      sheet.getCell('F1').value = "MONTO";
      sheet.getCell('G1').value = "DETRACCIÓN"; // 🚨 NUEVA COLUMNA
      sheet.getCell('H1').value = "ESTADO";

      // Métricas desplazadas a las columnas J y K
      sheet.getCell('J1').value = "MÉTRICAS DEL DASHBOARD";
      sheet.getCell('K1').value = "VALOR";

      // Estilos de cabecera
      ['A1','B1','C1','D1','E1','F1','G1','H1','J1','K1'].forEach(cell => {
        sheet.getCell(cell).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FF4F46E5" } }; 
      });

      // 2. Llenar la Base de Datos Completa (Izquierda)
      listaFacturas.forEach((fac, index) => {
        const rowIndex = index + 2;
        sheet.getCell(`A${rowIndex}`).value = fac.numero_documento || "S/N";
        sheet.getCell(`B${rowIndex}`).value = fac.cliente || "Desconocido";
        sheet.getCell(`C${rowIndex}`).value = fac.fecha_emision || "";
        sheet.getCell(`D${rowIndex}`).value = fac.fecha_vencimiento || "";
        sheet.getCell(`E${rowIndex}`).value = fac.moneda || "PEN";
        
        const montoCell = sheet.getCell(`F${rowIndex}`);
        montoCell.value = parseFloat(fac.monto_neto_pagar || fac.monto || 0);
        montoCell.numFmt = '#,##0.00'; 
        
        // 🚨 CONFIGURACIÓN DE LA DETRACCIÓN
        const tieneDet = String(fac.tiene_detraccion).toLowerCase() === "true" || String(fac.tiene_detraccion).toLowerCase() === "si" || fac.tiene_detraccion === true;
        const tasaStr = fac.tasa_detraccion || "0";
        let tasaNum = tieneDet ? parseFloat(tasaStr) : 0;
        
        const detCell = sheet.getCell(`G${rowIndex}`);
        detCell.value = tasaNum; 
        detCell.numFmt = '0%'; // Formato nativo de porcentaje en Excel
        
        sheet.getCell(`H${rowIndex}`).value = fac.estado || "DESCONOCIDO";
      });

      // 3. Llenar la Tabla de Resumen (Derecha - Columnas J y K)
      const summaryData = [
        ["Deuda Pendiente (PEN)", deudaPEN],
        ["Deuda Pendiente (USD)", deudaUSD],
        ["Facturas Pendientes (Al día)", stats.pendientes - stats.vencidas],
        ["Facturas Vencidas", stats.vencidas],
        ["Facturas Cobradas", stats.cobradas],
        ["Vouchers en Triaje", triajePendientes],
        ["", ""],
        ["ANTIGÜEDAD DE CARTERA", ""],
        ["Por Vencer", agingData.porVencer],
        ["Vencidas 1-30 Días", agingData.vencidas1a30],
        ["Vencidas 31-60 Días", agingData.vencidas31a60],
        ["Vencidas +60 Días", agingData.vencidasMas60]
      ];

      summaryData.forEach((row, index) => {
        const cellJ = sheet.getCell(`J${index + 2}`);
        const cellK = sheet.getCell(`K${index + 2}`);
        
        cellJ.value = row[0];
        cellK.value = row[1];
        
        if (typeof row[1] === 'number' && index < 2) {
           cellK.numFmt = '#,##0.00';
        }
        if (row[0] === "ANTIGÜEDAD DE CARTERA") {
           cellJ.font = { bold: true };
        }
      });

      // 4. Ajustar el ancho de las columnas
      sheet.getColumn('A').width = 15;
      sheet.getColumn('B').width = 40; 
      sheet.getColumn('C').width = 12;
      sheet.getColumn('D').width = 12;
      sheet.getColumn('E').width = 10;
      sheet.getColumn('F').width = 15;
      sheet.getColumn('G').width = 15; // Detracción
      sheet.getColumn('H').width = 15; // Estado
      sheet.getColumn('I').width = 5;  // Separador vacío
      sheet.getColumn('J').width = 32; // Métricas
      sheet.getColumn('K').width = 15; // Valor

      // 5. Descargar Excel
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Reporte_Financiero_${new Date().toISOString().split('T')[0]}.xlsx`);

    } catch (error) {
      console.error("Error exportando a Excel:", error);
      alert("Hubo un error al generar el archivo Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  const barData = {
    labels: ['Por Vencer', '1-30 Días', '31-60 Días', '+60 Días'],
    datasets: [{
      label: 'Facturas',
      data: [agingData.porVencer, agingData.vencidas1a30, agingData.vencidas31a60, agingData.vencidasMas60],
      backgroundColor: ['#10B981', '#FBBF24', '#F97316', '#EF4444'],
      borderRadius: 6,
    }],
  };
  const barOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } };

  const doughnutData = {
    labels: ['Cobradas', 'Pendientes (Al día)', 'Vencidas'],
    datasets: [{
      data: [stats.cobradas, stats.pendientes - stats.vencidas, stats.vencidas],
      backgroundColor: ['#10B981', '#3B82F6', '#EF4444'],
      borderWidth: 0, hoverOffset: 4
    }],
  };
  const doughnutOptions = { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } } } };

  if (isLoading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inteligencia Financiera</h1>
          <p className="text-gray-500 mt-1">Visión general de tus cuentas por cobrar y estado de documentos.</p>
        </div>
        
        <button 
          onClick={handleExportToExcel} 
          disabled={isExporting}
          className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {isExporting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isExporting ? 'Generando Excel...' : 'Exportar a Excel'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl shadow-md p-6 flex flex-col justify-center relative overflow-hidden text-white">
          <div className="absolute -right-4 -top-4 bg-white/10 p-6 rounded-full"><Wallet className="w-12 h-12 text-white/50" /></div>
          <h3 className="text-sm font-medium text-gray-300 mb-1 relative z-10">Deuda Pendiente Total (Soles)</h3>
          <p className="text-4xl font-bold relative z-10">S/ {deudaPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-xl shadow-md p-6 flex flex-col justify-center relative overflow-hidden text-white">
          <div className="absolute -right-4 -top-4 bg-white/10 p-6 rounded-full"><DollarSign className="w-12 h-12 text-white/50" /></div>
          <h3 className="text-sm font-medium text-blue-200 mb-1 relative z-10">Deuda Pendiente Total (Dólares)</h3>
          <p className="text-4xl font-bold relative z-10">$ {deudaUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0"><FileText className="w-6 h-6 text-blue-500" /></div>
          <div>
            <p className="text-sm font-bold text-gray-500">Pendientes</p>
            <p className="text-2xl font-bold text-gray-900">{stats.pendientes}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0"><AlertTriangle className="w-6 h-6 text-red-500" /></div>
          <div>
            <p className="text-sm font-bold text-gray-500">Vencidas</p>
            <p className="text-2xl font-bold text-red-600">{stats.vencidas}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center shrink-0"><CheckCircle className="w-6 h-6 text-green-500" /></div>
          <div>
            <p className="text-sm font-bold text-gray-500">Cobradas</p>
            <p className="text-2xl font-bold text-green-600">{stats.cobradas}</p>
          </div>
        </div>
        <div className={`rounded-xl shadow-sm border p-5 flex items-center gap-4 transition-colors ${triajePendientes > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${triajePendientes > 0 ? 'bg-red-200' : 'bg-gray-100'}`}>
            <AlertCircle className={`w-6 h-6 ${triajePendientes > 0 ? 'text-red-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <p className={`text-sm font-bold ${triajePendientes > 0 ? 'text-red-700' : 'text-gray-500'}`}>En Triaje</p>
            <p className={`text-2xl font-bold ${triajePendientes > 0 ? 'text-red-600' : 'text-gray-900'}`}>{triajePendientes}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-[380px]">
          <h2 className="text-sm font-bold text-gray-800 mb-4 text-center">Salud de la Cartera</h2>
          <div className="relative flex-1 w-full flex justify-center items-center pb-2">
             <Doughnut ref={doughnutRef} data={doughnutData} options={doughnutOptions} />
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-[-20px]">
                <span className="text-3xl font-bold text-gray-800">{stats.cobradas + stats.pendientes}</span>
                <span className="text-xs text-gray-500">Total</span>
             </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-[380px]">
          <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-500" /> Riesgo por Antigüedad</h2>
          <div className="relative flex-1 w-full flex justify-center items-center pb-4">
             <Bar ref={barRef} data={barData} options={barOptions} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[380px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-bold text-gray-800">Facturas Críticas (Top 5)</h2>
          </div>
          {topUrgentes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 text-gray-500 text-sm"><p>No tienes facturas urgentes en riesgo.</p></div>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-y-auto custom-scrollbar">
              {topUrgentes.map((fac, idx) => (
                <li key={idx} className="p-4 hover:bg-gray-50 flex flex-col transition-colors">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-gray-800 text-xs truncate max-w-[180px]">{fac.cliente}</span>
                    <span className="font-bold text-gray-900 text-sm">{fac.moneda === "USD" ? "$" : "S/"} {parseFloat(fac.monto).toLocaleString('en-US')}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[10px] text-gray-500">{fac.numero_documento}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fac.diffDays > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {fac.diffDays > 0 ? `Vencida ${fac.diffDays} d` : `Vence en ${Math.abs(fac.diffDays)} d`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

