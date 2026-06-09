import { NextResponse } from "next/server";
import { BedrockAgentClient, StartIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";

// Nota: Usamos BedrockAgentClient (gestión), no Runtime
const bedrockClient = new BedrockAgentClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST() {
  try {
    // 1. Iniciar sincronización de la Base de Conocimientos 1
    await bedrockClient.send(new StartIngestionJobCommand({
      knowledgeBaseId: process.env.KB_AQTIVA_ID!,
      dataSourceId: process.env.DS_AQTIVA_ID!,
    }));

    // 2. Iniciar sincronización de la Base de Conocimientos 2
    await bedrockClient.send(new StartIngestionJobCommand({
      knowledgeBaseId: process.env.KB_ANALYZED_ID!,
      dataSourceId: process.env.DS_ANALYZED_ID!,
    }));

    return NextResponse.json({ success: true, message: "Sincronización de IA iniciada correctamente." });
  } catch (error: any) {
    console.error("Error sincronizando Bedrock:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}