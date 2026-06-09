"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";

interface ChatSession {
  id: string;
  title: string;
  date: string;
}

interface Message {
  rol: "user" | "ia";
  texto: string;
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");

  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Redirección si no está logueado
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Cargar lista de chats del usuario al entrar a la pantalla
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/chat/history")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setChats(data);
        })
        .catch(err => console.error("Error al traer chats de DynamoDB", err));
    }
  }, [status]);

  // Cargar el historial de mensajes cada vez que cambia el chat activo
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    fetch(`/api/chat/history?sessionId=${activeChatId}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(err => console.error("Error al traer mensajes", err));
  }, [activeChatId]);

  // Auto-scroll al final del contenedor cuando llega un nuevo caracter
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAiTyping]);

  if (status === "loading") return <div className="min-h-screen bg-gray-50"></div>;
  if (!session) return null;

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setInputText("");
  };

  const handleRename = async (id: string) => {
    await fetch("/api/chat/rename", {
      method: "POST",
      body: JSON.stringify({ sessionId: id, newTitle: tempTitle })
    });
    setChats(chats.map(c => c.id === id ? { ...c, title: tempTitle } : c));
    setEditingId(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isAiTyping) return;

    const userQuery = inputText.trim();
    setInputText("");

    // Si no hay un chat activo, generamos un identificador temporal único de sesión
    const isNew = !activeChatId;
    const currentSessionId = activeChatId || `session_${Date.now()}`;
    const temporaryTitle = userQuery.substring(0, 30) + "...";

    // Insertar el mensaje del usuario en pantalla inmediatamente
    const updatedMessages: Message[] = [...messages, { rol: "user", texto: userQuery }];
    setMessages(updatedMessages);
    setIsAiTyping(true);

    // Agregamos un marcador vacío para la respuesta de la IA que se irá rellenando
    setMessages(prev => [...prev, { rol: "ia", texto: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
          message: userQuery,
          isNewChat: isNew,
          chatTitle: temporaryTitle
        })
      });

      if (!response.ok) throw new Error("Error en la llamada al agente");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let accumulatedAiText = "";

      // Bucle infinito para decodificar los chunks de bytes que envía el backend
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        accumulatedAiText += textChunk;

        // Actualizamos en tiempo real la última burbuja de texto (la de la IA)
        setMessages(prev => {
          const newArray = [...prev];
          newArray[newArray.length - 1] = { rol: "ia", texto: accumulatedAiText };
          return newArray;
        });
      }

      // Si fue un chat exitoso y era nuevo, cambiamos el ID activo y recargamos el sidebar
      if (isNew) {
        setActiveChatId(currentSessionId);
        setChats(prev => [{ id: currentSessionId, title: temporaryTitle, date: new Date().toISOString() }, ...prev]);
      }

    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev.slice(0, -1),
        { rol: "ia", texto: "❌ Ocurrió un error al conectar con el Agente de Bedrock." }
      ]);
    } finally {
      setIsAiTyping(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <div className="shrink-0"><Navbar /></div>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR LATERAL */}
        <aside className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-4">
            <button
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-semibold py-2.5 px-4 rounded-lg transition-colors shadow-sm text-sm"
            >
              ➕ Nuevo Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
            <p className="px-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-2">Conversaciones</p>

            {chats.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 italic">No hay chats previos.</p>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`flex items-center group rounded-lg min-h-[44px] pr-1 transition-all ${activeChatId === chat.id ? "bg-indigo-100" : "hover:bg-gray-100"
                    }`}
                >
                  {/* MODO EDICIÓN ACTIVADO */}
                  {editingId === chat.id ? (
                    <div className="flex-1 flex items-center px-3 py-1.5 gap-2">
                      <input
                        autoFocus
                        type="text"
                        className="flex-1 bg-white border border-indigo-500 rounded px-2 py-1 text-sm outline-none font-medium text-gray-800 shadow-sm"
                        value={tempTitle}
                        onChange={(e) => setTempTitle(e.target.value)}
                        onBlur={() => handleRename(chat.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(chat.id);
                          if (e.key === "Escape") setEditingId(null); // Cancelar con ESC
                        }}
                      />
                    </div>
                  ) : (
                    // MODO VISTA NORMAL
                    <>
                      <button
                        onClick={() => setActiveChatId(chat.id)}
                        className={`flex-1 text-left px-3 py-2.5 text-sm truncate transition-colors pr-2 ${activeChatId === chat.id ? "text-indigo-900 font-semibold" : "text-gray-700"
                          }`}
                      >
                        💬 {chat.title}
                      </button>

                      {/* Botón para Renombrar */}
                      <button
                        onClick={() => {
                          setEditingId(chat.id);
                          setTempTitle(chat.title);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-md transition-all mr-0.5"
                        aria-label="Renombrar chat"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>

                      {/* Botón para Eliminar */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm("¿Estás seguro de eliminar este chat?")) {
                            try {
                              const res = await fetch("/api/chat/delete", {
                                method: "POST",
                                body: JSON.stringify({ sessionId: chat.id }),
                              });
                              if (res.ok) {
                                setChats(chats.filter((c) => c.id !== chat.id));
                                if (activeChatId === chat.id) startNewChat();
                              }
                            } catch (err) {
                              alert("No se pudo eliminar el chat");
                            }
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-md transition-all"
                        aria-label="Eliminar chat"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* CONTENEDOR CENTRAL DEL CHAT */}
        <main className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Globos del Feed */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <span className="text-5xl mb-3">🤖</span>
                <p className="text-sm font-medium">Asistente AQTIVA Inteligente listo.</p>
                <p className="text-xs">Consulta sobre conciliaciones, estados de S3 y auditorías de facturas.</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.rol === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-3xl rounded-2xl px-5 py-3.5 text-sm md:text-base whitespace-pre-wrap ${msg.rol === "user" ? "bg-indigo-600 text-white rounded-br-none" : "bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200"
                    }`}>
                    {msg.rol === "ia" && <span className="font-bold block text-[10px] uppercase tracking-wider mb-1 text-indigo-600">AQTIVA Agent</span>}
                    <p className="leading-relaxed">{msg.texto}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Textarea Input */}
          <div className="p-4 bg-white border-t border-gray-100 shrink-0">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative flex items-center">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder="Escribe tu consulta al agente contable..."
                disabled={isAiTyping}
                className="w-full resize-none rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pl-4 pr-12 py-3.5 outline-none shadow-sm min-h-[54px] max-h-32 text-sm disabled:bg-gray-50"
                rows={1}
              />
              <button
                type="submit"
                disabled={isAiTyping || !inputText.trim()}
                className="absolute right-2.5 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {isAiTyping ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                )}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}