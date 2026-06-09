import { NextResponse } from "next/server";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Inicializamos el cliente de Bedrock Runtime con tus variables de entorno
const bedrockClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  // 1. Validar autenticación del usuario
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { sessionId, message, isNewChat, chatTitle } = await req.json();

    if (!sessionId || !message) {
      return NextResponse.json({ error: "Faltan parámetros obligatorios" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const tableName = process.env.DYNAMODB_TABLE_NAME!;

    // 2. Si es un chat nuevo, creamos la metadata de la conversación vinculada al usuario
    if (isNewChat) {
      await dynamoDb.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: `USER#${(session.user as any).id}`,
          SK: `CONV#${sessionId}`,
          titulo: chatTitle || message.substring(0, 35) + "...",
          fechaCreacion: timestamp,
        },
      }));
    }

    // 3. Guardar el mensaje del usuario en DynamoDB
    await dynamoDb.send(new PutCommand({
      TableName: tableName,
      Item: {
        PK: `CONV#${sessionId}`,
        SK: `MSG#${timestamp}-USER`,
        rol: "user",
        texto: message,
      },
    }));

    // 4. Invocar el Agente de Amazon Bedrock
    const command = new InvokeAgentCommand({
      agentId: process.env.BEDROCK_AGENT_ID!,
      agentAliasId: process.env.BEDROCK_AGENT_ALIAS_ID!,
      sessionId: sessionId,
      inputText: message,
    });

    const bedrockResponse = await bedrockClient.send(command);
    const completionStream = bedrockResponse.completion;

    if (!completionStream) {
      throw new Error("No se recibió un flujo de respuesta (completion stream) de Bedrock.");
    }

    // 5. Configurar un canal de Streaming de texto hacia el Navegador
    const encoder = new TextEncoder();
    let completeAiResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completionStream) {
            // Evaluamos si el chunk contiene una porción de bytes de texto del agente
            if (chunk.chunk && chunk.chunk.bytes) {
              const textChunk = new TextDecoder("utf-8").decode(chunk.chunk.bytes);
              completeAiResponse += textChunk;
              controller.enqueue(encoder.encode(textChunk));
            }
          }

          // 6. Una vez cerrado el stream de Bedrock, persistimos la respuesta de la IA en DynamoDB
          const aiTimestamp = new Date().toISOString();
          await dynamoDb.send(new PutCommand({
            TableName: tableName,
            Item: {
              PK: `CONV#${sessionId}`,
              SK: `MSG#${aiTimestamp}-IA`,
              rol: "ia",
              texto: completeAiResponse,
            },
          }));

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error: any) {
    console.error("Error en el flujo del Chatbot:", error);
    return NextResponse.json({ error: error.message || "Error interno de ejecución" }, { status: 500 });
  }
}