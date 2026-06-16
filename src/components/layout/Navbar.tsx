"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

interface NavbarProps {
  activeNav: "dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas" | "boveda";
  setActiveNav: (nav: "dashboard" | "facturas" | "carga-masiva" | "resolucion" | "auditoria" | "empresas" | "boveda") => void;
}

export default function Navbar({ activeNav, setActiveNav }: NavbarProps) {
  const { data: session } = useSession();
  
  // Estados para los menús
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // NUEVO: Estado menú móvil
  const profileRef = useRef<HTMLDivElement>(null);

  // Cerrar el menú de perfil si se hace clic afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Función para manejar la navegación (cierra el menú móvil al hacer clic)
  const handleNavClick = (navName: typeof activeNav) => {
    setActiveNav(navName);
    setIsMobileMenuOpen(false);
  };

  const navItemClass = (navName: string) =>
    `px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ease-in-out flex items-center gap-2 w-full lg:w-auto ${
      activeNav === navName 
        ? "bg-indigo-600 text-white shadow-md lg:transform lg:scale-105" 
        : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
    }`;

  const handleSignOut = () => {
    signOut({ callbackUrl: '/auth/login' }); 
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* SECCIÓN IZQUIERDA: Logo */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              </div>
              <span className="font-black text-xl text-gray-900 tracking-tight">Aqtiva<span className="text-indigo-600">Pay</span></span>
            </div>
          </div>

          {/* SECCIÓN CENTRAL: Enlaces (Ocultos en móviles) */}
          <div className="hidden lg:flex space-x-1 flex-1 justify-center px-4">
            <button onClick={() => handleNavClick("dashboard")} className={navItemClass("dashboard")}>Dashboard</button>
            <button onClick={() => handleNavClick("carga-masiva")} className={navItemClass("carga-masiva")}>Carga Masiva</button>
            <button onClick={() => handleNavClick("boveda")} className={navItemClass("boveda")}>Bóveda</button>
            <button onClick={() => handleNavClick("resolucion")} className={navItemClass("resolucion")}>Triaje IA</button>
            <button onClick={() => handleNavClick("facturas")} className={navItemClass("facturas")}>Catálogo</button>
            <button onClick={() => handleNavClick("auditoria")} className={navItemClass("auditoria")}>Historial</button>
            <button onClick={() => handleNavClick("empresas")} className={navItemClass("empresas")}>Empresas</button>
          </div>

          {/* SECCIÓN DERECHA: Perfil + Botón Menú Móvil */}
          <div className="flex items-center gap-3">
            
            {/* Perfil (Visible siempre) */}
            <div className="relative" ref={profileRef}>
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)} 
                className="flex items-center gap-3 focus:outline-none p-1 rounded-full hover:bg-gray-50 transition-colors"
              >
                <div className="hidden md:block text-right">
                  <p className="text-sm font-bold text-gray-800 leading-tight">{session?.user?.name || "Usuario"}</p>
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">{session?.user?.email}</p>
                </div>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center text-indigo-700 font-bold overflow-hidden shadow-sm">
                  {session?.user?.image ? (
                    <img src={session.user.image} alt="Perfil" className="w-full h-full object-cover" />
                  ) : (
                    <span>{session?.user?.name?.charAt(0).toUpperCase() || "U"}</span>
                  )}
                </div>
              </button>

              {/* DROPDOWN PERFIL */}
              {isProfileOpen && (
                <div className="absolute right-0 top-12 sm:top-14 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-800 truncate">{session?.user?.name || "Administrador"}</p>
                    <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
                    <span className="inline-block mt-2 bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {(session as any)?.user?.rol || "Rol Estándar"}
                    </span>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-3 py-2.5 text-sm text-red-600 font-bold hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                      Cerrar Sesión
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* NUEVO: Botón Menú Hamburguesa (Solo visible en pantallas medianas/pequeñas) */}
            <div className="flex lg:hidden items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
              >
                <span className="sr-only">Abrir menú principal</span>
                {isMobileMenuOpen ? (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* NUEVO: Menú Desplegable Móvil */}
      <div className={`lg:hidden transition-all duration-300 ease-in-out overflow-hidden bg-gray-50 border-b border-gray-200 shadow-inner ${isMobileMenuOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 pt-2 pb-4 space-y-2">
          <button onClick={() => handleNavClick("dashboard")} className={navItemClass("dashboard")}>Dashboard</button>
          <button onClick={() => handleNavClick("carga-masiva")} className={navItemClass("carga-masiva")}>Carga Masiva</button>
          <button onClick={() => handleNavClick("boveda")} className={navItemClass("boveda")}>Bóveda de Documentos</button>
          <button onClick={() => handleNavClick("resolucion")} className={navItemClass("resolucion")}>Triaje IA</button>
          <button onClick={() => handleNavClick("facturas")} className={navItemClass("facturas")}>Catálogo de Facturas</button>
          <button onClick={() => handleNavClick("auditoria")} className={navItemClass("auditoria")}>Historial de Auditoría</button>
          <button onClick={() => handleNavClick("empresas")} className={navItemClass("empresas")}>Directorio de Empresas</button>
        </div>
      </div>
    </nav>
  );
}