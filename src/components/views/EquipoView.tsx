"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, Users, Trash2, Mail, Lock, User } from "lucide-react";

export default function EquipoView() {
    const { data: session } = useSession();

    // Estados para el formulario de creación
    const [nombre, setNombre] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // Estados para la lista de usuarios
    const [equipo, setEquipo] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Cargar la lista real de asistentes desde DynamoDB
    const fetchEquipo = async () => {
        if (!session?.user?.email) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/equipo?tenant_id=${encodeURIComponent(session.user.email)}`);
            const json = await res.json();
            if (json.success) {
                setEquipo(json.data);
            } else {
                console.error(json.error);
            }
        } catch (e) {
            console.error("Error de red al cargar el equipo", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchEquipo();
    }, [session]);

    // Crear un nuevo usuario en la base de datos
    const handleCrearUsuario = async (e: React.FormEvent) => {
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
                    tenant_id: session.user.email,
                    rol: "USER"
                })
            });

            const data = await res.json();

            if (data.success) {
                alert(`Usuario ${nombre} registrado exitosamente.`);
                setNombre("");
                setEmail("");
                setPassword("");
                fetchEquipo(); // Refrescamos la lista al instante
            } else {
                alert(data.error || "Ocurrió un error al crear el usuario.");
            }
        } catch (error) {
            alert("Error de red al intentar conectar con el servidor.");
        } finally {
            setIsCreating(false);
        }
    };

    // Revocar el acceso eliminando al usuario
    const handleEliminarUsuario = async (usuario: any) => {
        if (!window.confirm(`¿Estás seguro de eliminar el acceso de ${usuario.nombre} (${usuario.email})?\nNo podrá volver a entrar a tu sistema.`)) return;

        try {
            const res = await fetch(`/api/equipo?email=${encodeURIComponent(usuario.email)}`, {
                method: "DELETE"
            });
            const data = await res.json();

            if (data.success) {
                // Lo quitamos del estado local al instante para que la UI sea rápida
                setEquipo(equipo.filter(u => u.id !== usuario.id));
            } else {
                alert(data.error || "No se pudo revocar el acceso.");
            }
        } catch (error) {
            alert("Error de red al intentar eliminar al usuario.");
        }
    };

    return (
        <div className="animate-fadeIn">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Gestión de Equipo</h1>
                <p className="text-gray-500 mt-1">Crea cuentas de acceso limitado (USER) para tus asistentes o personal de contabilidad.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">

                {/* COLUMNA 1: FORMULARIO DE CREACIÓN */}
                <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">
                            <UserPlus className="w-3 h-3" />
                        </span>
                        Añadir Nuevo Asistente
                    </h2>

                    <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 lg:p-8">
                        <form onSubmit={handleCrearUsuario} className="space-y-5">

                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6">
                                <p className="text-sm text-indigo-800 font-medium">
                                    Los usuarios creados aquí tendrán el rol <strong>USER</strong>. Podrán iniciar sesión en cualquier momento para ver, buscar y conciliar facturas bajo tus empresas, pero no podrán eliminar registros.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    Nombre Completo
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Ana López" className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-colors" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    Correo Electrónico (Login)
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input type="email" required value={email} onChange={e => setEmail(e.target.value.toLowerCase())} placeholder="asistente@tuempresa.com" className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-colors" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    Contraseña de Acceso
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input type="text" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Asigna una contraseña segura" className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-colors" />
                                </div>
                            </div>

                            <div className="pt-4">
                                <button type="submit" disabled={isCreating || !nombre || !email || !password} className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white px-6 py-3.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50">
                                    {isCreating ? (
                                        <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> Registrando usuario...</>
                                    ) : (
                                        "Registrar y Conceder Acceso"
                                    )}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>

                {/* COLUMNA 2: LISTA DE USUARIOS ACTIVOS */}
                <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">
                            <Users className="w-3 h-3" />
                        </span>
                        Asistentes Activos
                    </h2>

                    <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        {isLoading ? (
                            <div className="flex-1 flex justify-center items-center min-h-[300px]">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                            </div>
                        ) : equipo.length === 0 ? (
                            <div className="flex-1 flex flex-col justify-center items-center p-12 text-center text-gray-500 min-h-[300px]">
                                <Users className="w-12 h-12 text-gray-300 mb-3" />
                                <p className="text-lg font-medium">Aún no tienes asistentes en tu equipo.</p>
                                <p className="text-sm mt-1">Usa el formulario de la izquierda para dar de alta a tu primer colaborador.</p>
                            </div>
                        ) : (
                            <div className="overflow-y-auto custom-scrollbar p-2">
                                <ul className="divide-y divide-gray-100">
                                    {equipo.map((usuario) => (
                                        <li key={usuario.id} className="p-4 hover:bg-gray-50 transition-colors rounded-xl flex items-center justify-between gap-4">

                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200 shrink-0">
                                                    {usuario.nombre.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="truncate">
                                                    <p className="text-sm font-bold text-gray-900 truncate">{usuario.nombre}</p>
                                                    <p className="text-xs text-gray-500 truncate">{usuario.email}</p>
                                                    <div className="flex gap-2 mt-1">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600 border border-gray-200 uppercase tracking-widest">
                                                            {usuario.rol}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-medium pt-0.5">
                                                            Unido: {usuario.fecha_creacion}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleEliminarUsuario(usuario)}
                                                title="Revocar acceso permanentemente"
                                                className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors shrink-0 border border-transparent hover:border-red-100"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>

                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}