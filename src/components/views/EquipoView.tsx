"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, Users, Mail, User, CheckCircle2 } from "lucide-react";
import Switch from "@/components/ui/Switch";

export default function EquipoView() {
    const { data: session } = useSession();

    const [nombre, setNombre] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const [equipo, setEquipo] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // 🚨 ESTADO PARA BLOQUEAR EL SWITCH MIENTRAS CARGA LA DB
    const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);

    const fetchEquipo = async () => {
        if (!session?.user?.email) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/equipo?tenant_id=${encodeURIComponent(session.user.email)}`);
            const json = await res.json();
            if (json.success) setEquipo(json.data);
        } catch (e) {
            console.error("Error al cargar equipo", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchEquipo();
    }, [session]);

    // 🚨 FUNCIÓN PARA CREAR USUARIO (Mantenida de tu archivo original)
    const handleCrearMiembro = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session?.user?.email) return;

        setIsCreating(true);
        try {
            const res = await fetch("/api/equipo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nombre,
                    email,
                    password,
                    rol: "USER",
                    adminEmail: session.user.email
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setNombre(""); setEmail(""); setPassword("");
                fetchEquipo();
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert("Ocurrió un error inesperado al intentar crear el miembro.");
        } finally {
            setIsCreating(false);
        }
    };

    // 🚨 NUEVA FUNCIÓN: ACTUALIZAR ESTADO ACTIVO/INACTIVO
    const handleToggleEstado = async (usuario: any) => {
        const nuevoEstado = usuario.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
        setUpdatingEmail(usuario.email); // Bloqueamos el switch temporalmente
        
        try {
            const res = await fetch("/api/equipo", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: usuario.email, estado: nuevoEstado })
            });
            const data = await res.json();
            
            if (data.success) {
                // Actualizamos visualmente el estado sin recargar la página entera
                setEquipo(prev => prev.map(u => 
                    u.email === usuario.email ? { ...u, estado: nuevoEstado } : u
                ));
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert("Error de red al intentar actualizar el estado.");
        } finally {
            setUpdatingEmail(null);
        }
    };

    return (
        <div className="p-6 animate-fadeIn">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Equipo de Trabajo</h1>
                <p className="text-gray-500">Gestión de agentes, accesos y métricas de desempeño.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* LISTA DE USUARIOS */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-600" />
                                Miembros del Equipo
                            </h2>
                        </div>

                        {isLoading ? (
                            <div className="p-12 text-center text-gray-500">Cargando equipo...</div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {equipo.map((usuario, idx) => {
                                    const isActivo = usuario.estado === "ACTIVO";
                                    return (
                                        <li key={idx} className={`p-6 flex items-center justify-between transition-colors ${isActivo ? 'hover:bg-gray-50' : 'bg-gray-50/50'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-inner ${isActivo ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-400'}`}>
                                                    {usuario.nombre ? usuario.nombre.charAt(0) : "U"}
                                                </div>
                                                <div>
                                                    <p className={`font-bold ${isActivo ? 'text-gray-900' : 'text-gray-500 line-through'}`}>{usuario.nombre}</p>
                                                    <p className="text-sm text-gray-500 flex items-center gap-1">
                                                        <Mail className="w-3 h-3" /> {usuario.email}
                                                    </p>
                                                    <p className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full inline-block mt-1">
                                                        {usuario.rol}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* CONTADOR DE CONCILIACIONES */}
                                            <div className="flex flex-col items-center px-6">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Conciliados</span>
                                                <div className={`flex items-center gap-1 font-black text-xl ${isActivo ? 'text-green-600' : 'text-gray-400'}`}>
                                                    <CheckCircle2 className="w-5 h-5" />
                                                    {usuario.conteo_conciliaciones || 0}
                                                </div>
                                            </div>

                                            {/* 🚨 SWITCH DE ACTIVACIÓN INTEGRADO */}
                                            <div className="flex flex-col items-end gap-1">
                                                <Switch 
                                                    isActive={isActivo} 
                                                    onChange={() => handleToggleEstado(usuario)}
                                                    disabled={updatingEmail === usuario.email}
                                                />
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${isActivo ? 'text-indigo-600' : 'text-red-500'}`}>
                                                    {isActivo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {/* FORMULARIO DE CREACIÓN */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-6">
                        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
                                <UserPlus className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h2 className="font-bold text-gray-800 text-lg">Invitar Asistente</h2>
                        </div>

                        <form onSubmit={handleCrearMiembro} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre Completo</label>
                                <input
                                    type="text" required
                                    value={nombre} onChange={(e) => setNombre(e.target.value)}
                                    placeholder="Ej. Juan Pérez"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-gray-50 focus:bg-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Correo Electrónico</label>
                                <input
                                    type="email" required
                                    value={email} onChange={(e) => setEmail(e.target.value)}
                                    placeholder="juan@empresa.com"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-gray-50 focus:bg-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Contraseña Temporal</label>
                                <input
                                    type="password" required
                                    value={password} onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-gray-50 focus:bg-white text-sm"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isCreating}
                                className="w-full bg-indigo-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                            >
                                {isCreating ? "Creando..." : "Crear Acceso"}
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
}