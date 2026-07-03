"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

interface NavbarProps {
  activeNav: "dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas" | "boveda" | "equipo";
  setActiveNav: (nav: "dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas" | "boveda" | "equipo") => void;
}

export default function Navbar({ activeNav, setActiveNav }: NavbarProps) {
  const { data: session } = useSession();
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const profileRef = useRef<HTMLDivElement>(null);

  // 🚨 REGLAS RBAC: Extraemos el rol del usuario
  const userRole = (session?.user as any)?.rol || 'USER';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavClick = (nav: "dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas" | "boveda" | "equipo") => {
    setActiveNav(nav);
    setIsMobileMenuOpen(false); 
  };

  const navItemClass = (item: string) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeNav === item ? "bg-indigo-700 text-white" : "text-indigo-100 hover:bg-indigo-500 hover:text-white"}`;

  return (
    <nav className="bg-indigo-600 shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center gap-2 cursor-pointer" onClick={() => handleNavClick("dashboard")}>
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <span className="text-indigo-600 font-bold text-xl leading-none">A</span>
              </div>
              <span className="text-white font-bold text-xl tracking-tight hidden sm:block">Aqtiva<span className="text-indigo-200">IA</span></span>
            </div>
            
            {/* Menú Desktop */}
            <div className="hidden lg:block ml-10">
              <div className="flex items-baseline space-x-2">
                <button onClick={() => handleNavClick("dashboard")} className={navItemClass("dashboard")}>Dashboard</button>
                <button onClick={() => handleNavClick("carga-masiva")} className={navItemClass("carga-masiva")}>Carga Masiva</button>
                <button onClick={() => handleNavClick("boveda")} className={navItemClass("boveda")}>Bóveda</button>
                <button onClick={() => handleNavClick("resolucion")} className={navItemClass("resolucion")}>Triaje IA</button>
                <button onClick={() => handleNavClick("facturas")} className={navItemClass("facturas")}>Catálogo</button>
                <button onClick={() => handleNavClick("auditoria")} className={navItemClass("auditoria")}>Auditoría</button>
                
                {/* 🚨 RBAC: Solo el ADMIN puede ver estas pestañas */}
                {userRole === 'ADMIN' && (
                  <>
                    <button onClick={() => handleNavClick("empresas")} className={navItemClass("empresas")}>Mis Empresas</button>
                    <button onClick={() => handleNavClick("equipo")} className={navItemClass("equipo")}>Mi Equipo</button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:block">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></span>
                <span className="text-indigo-100 text-xs font-medium">IA Activa</span>
              </div>
            </div>
            
            <div className="ml-3 relative" ref={profileRef}>
              <div>
                <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="max-w-xs bg-indigo-600 rounded-full flex items-center text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-indigo-600 focus:ring-white transition-all hover:ring-2">
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-indigo-200">
                    {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : session?.user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                </button>
              </div>
              
              {isProfileOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-xl shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none transform transition-all duration-200 ease-out z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name || 'Usuario'}</p>
                    <p className="text-xs font-medium text-gray-500 truncate">{session?.user?.email}</p>
                    {/* 🚨 RBAC: Badge dinámico según el rol */}
                    <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${userRole === 'ADMIN' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                      {userRole === 'ADMIN' ? 'Administrador' : 'Asistente'}
                    </span>
                  </div>
                  <button onClick={() => signOut({ callbackUrl: "/" })} className="block w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium">
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>

            {/* Botón menú móvil */}
            <div className="lg:hidden flex items-center">
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="inline-flex items-center justify-center p-2 rounded-md text-indigo-200 hover:text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white">
                <span className="sr-only">Abrir menú principal</span>
                {isMobileMenuOpen ? (
                  <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                  <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Menú Desplegable Móvil */}
      <div className={`lg:hidden transition-all duration-300 ease-in-out overflow-hidden bg-gray-50 border-b border-gray-200 shadow-inner ${isMobileMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 pt-2 pb-4 space-y-2">
          <button onClick={() => handleNavClick("dashboard")} className={navItemClass("dashboard")}>Dashboard</button>
          <button onClick={() => handleNavClick("carga-masiva")} className={navItemClass("carga-masiva")}>Carga Masiva</button>
          <button onClick={() => handleNavClick("boveda")} className={navItemClass("boveda")}>Bóveda de Documentos</button>
          <button onClick={() => handleNavClick("resolucion")} className={navItemClass("resolucion")}>Triaje IA</button>
          <button onClick={() => handleNavClick("facturas")} className={navItemClass("facturas")}>Catálogo de Facturas</button>
          <button onClick={() => handleNavClick("auditoria")} className={navItemClass("auditoria")}>Auditoría</button>
          
          {/* 🚨 RBAC Móvil: Solo ADMIN */}
          {userRole === 'ADMIN' && (
            <>
              <button onClick={() => handleNavClick("empresas")} className={navItemClass("empresas")}>Mis Empresas</button>
              <button onClick={() => handleNavClick("equipo")} className={navItemClass("equipo")}>Mi Equipo</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}