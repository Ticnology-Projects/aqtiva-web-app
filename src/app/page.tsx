"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import Navbar from "@/components/layout/Navbar";
import CargaMasivaView from "@/components/views/CargaMasivaView";
import CatalogoView from "@/components/views/CatalogoView";
import TriajeView from "@/components/views/TriajeView";
import AuditoriaView from "@/components/views/AuditoriaView";
import EmpresasView from "@/components/views/EmpresasView";
import DashboardView from "@/components/views/DashboardView";
import BovedaView from "@/components/views/BovedaView";
import EquipoView from "@/components/views/EquipoView";

export default function ApplicationLayout() {
  const { data: session, status } = useSession();
  const [activeNav, setActiveNav] = useState<"dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas" | "boveda" | "equipo">("carga-masiva");

  // 🚨 REGLAS RBAC
  const userRole = (session?.user as any)?.rol || 'USER';

  if (status === "loading") return <div className="min-h-screen bg-gray-50"></div>;

  return (
    <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
      <Navbar activeNav={activeNav} setActiveNav={setActiveNav} />

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Vistas Públicas (Disponibles para ADMIN y USER) */}
        {activeNav === "dashboard" && <DashboardView />}
        {activeNav === "carga-masiva" && <CargaMasivaView onGoToTriaje={() => setActiveNav("resolucion")} />}
        {activeNav === "facturas" && <CatalogoView />}
        {activeNav === "resolucion" && <TriajeView />}
        {activeNav === "auditoria" && <AuditoriaView />}
        {activeNav === "boveda" && <BovedaView />}
        
        {/* 🚨 Vistas Protegidas (Exclusivas para ADMIN) */}
        {activeNav === "empresas" && userRole === "ADMIN" && <EmpresasView />}
        {activeNav === "equipo" && userRole === "ADMIN" && <EquipoView />}
      </main>
    </div>
  );
}