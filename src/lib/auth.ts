import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "@/lib/dynamodb";
import crypto from "crypto";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@aqtiva.io" },
        password: { label: "Contraseña", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const response = await dynamoDb.send(new ScanCommand({
          TableName: "AqtivaChatDB",
          FilterExpression: "email = :email AND SK = :sk",
          ExpressionAttributeValues: {
            ":email": credentials.email,
            ":sk": "PROFILE"
          }
        }));

        const user = response.Items?.[0];

        if (!user || user.estado !== "ACTIVO") return null;

        const inputHash = crypto.createHash("sha256").update(credentials.password).digest("hex");
        
        if (inputHash === user.passwordHash) {
          // 🚨 MAGIA MULTI-TENANT: Definimos el paraguas de datos
          const tenantId = user.rol === "ADMIN" ? user.email : user.usuario_propietario;

          return { 
            id: user.userId || user.PK, 
            name: user.nombre, 
            email: user.email, 
            rol: user.rol,
            tenantId: tenantId // Inyectamos la variable
          } as any;
        }

        return null;
      }
    })
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.rol = (user as any).rol;
        token.tenantId = (user as any).tenantId; // Lo guardamos en el token
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).rol = token.rol;
        (session.user as any).tenantId = token.tenantId; // Lo exponemos al frontend
      }
      return session;
    }
  }
};