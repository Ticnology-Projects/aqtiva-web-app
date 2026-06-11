import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { s3KeyOutput } = await req.json();
    const apiUrl = process.env.API_BASE_URL;

    if (!apiUrl) {
      return NextResponse.json({ error: "Falta la variable de entorno API_BASE_URL" }, { status: 500 });
    }

    // Llamamos al motor de Python para que vuelva a cruzar el archivo modificado
    const res = await fetch(`${apiUrl}/match-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3_key: s3KeyOutput })
    });

    if (!res.ok) {
      throw new Error(`Error del motor de IA: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error al re-ejecutar el match:", error);
    return NextResponse.json({ error: error.message || "Fallo en la conexión" }, { status: 500 });
  }
}