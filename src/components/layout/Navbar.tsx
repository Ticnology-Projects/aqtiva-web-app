"use client";

import { useSession } from "next-auth/react";

interface NavbarProps {
  // NUEVO: Agregamos "empresas" a los tipos permitidos
  activeNav: "dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas";
  setActiveNav: (nav: "dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas") => void;
}

export default function Navbar({ activeNav, setActiveNav }: NavbarProps) {
  const { data: session } = useSession();

  const navItemClass = (nav: string) => 
    `px-4 py-2 rounded-lg transition-colors ${activeNav === nav ? "bg-indigo-50 text-indigo-700 font-bold" : "text-gray-500 hover:bg-gray-100"}`;

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-indigo-700">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">A</div>
          AQTIVA
        </div>
        <nav className="hidden md:flex gap-1 text-sm font-medium">
          <button onClick={() => setActiveNav("dashboard")} className={navItemClass("dashboard")}>Dashboard</button>
          <button onClick={() => setActiveNav("facturas")} className={navItemClass("facturas")}>Catálogo</button>
          <button onClick={() => setActiveNav("carga-masiva")} className={navItemClass("carga-masiva")}>Carga Masiva</button>
          <button onClick={() => setActiveNav("resolucion")} className={navItemClass("resolucion")}>Triaje Vouchers</button>
          <button onClick={() => setActiveNav("auditoria")} className={navItemClass("auditoria")}>Historial Auditoría</button>
          {/* NUEVO: Ahora funciona igual que los demás */}
          <button onClick={() => setActiveNav("empresas")} className={navItemClass("empresas")}>Directorio RUCs</button>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm cursor-pointer">
          {session?.user?.name?.charAt(0) || "U"}
        </div>
      </div>
    </header>
  );
}