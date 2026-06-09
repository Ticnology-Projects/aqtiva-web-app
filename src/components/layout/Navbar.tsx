"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;

  return (
    <nav className="bg-white border-b border-gray-200 px-8 py-4 mb-8 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-8">
        <h1 className="text-xl font-bold text-indigo-900">AQTIVA Workspace</h1>
        
        {/* ENLACES DE NAVEGACIÓN */}
        <div className="flex gap-2">
          <Link 
            href="/" 
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              pathname === "/" 
                ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
            }`}
          >
            📊 Conciliación
          </Link>
          <Link 
            href="/chat" 
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              pathname === "/chat" 
                ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
            }`}
          >
            🤖 Agente IA
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-bold text-gray-800">{session.user?.name}</p>
          <p className="text-xs text-gray-500">{(session.user as any)?.rol} • {session.user?.email}</p>
        </div>
        <button 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors border border-transparent hover:border-red-100"
        >
          Cerrar Sesión
        </button>
      </div>
    </nav>
  );
}