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

export default function ApplicationLayout() {
  const { status } = useSession();
  // Agregamos "empresas" al estado inicial
  const [activeNav, setActiveNav] = useState<"dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas">("carga-masiva");

  if (status === "loading") return <div className="min-h-screen bg-gray-50"></div>;

  return (
    <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
      <Navbar activeNav={activeNav} setActiveNav={setActiveNav} />

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        {activeNav === "dashboard" && <DashboardView />}
        {activeNav === "carga-masiva" && <CargaMasivaView onGoToTriaje={() => setActiveNav("resolucion")} />}
        {activeNav === "facturas" && <CatalogoView />}
        {activeNav === "resolucion" && <TriajeView />}
        {activeNav === "auditoria" && <AuditoriaView />}
        {activeNav === "empresas" && <EmpresasView />}
      </main>
    </div>
  );
}