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

        // Buscamos el perfil del usuario por su email
        const response = await dynamoDb.send(new ScanCommand({
          TableName: "AqtivaChatDB",
          FilterExpression: "email = :email AND SK = :sk",
          ExpressionAttributeValues: {
            ":email": credentials.email,
            ":sk": "PROFILE"
          }
        }));

        const user = response.Items?.[0];

        // Si no existe o está inactivo, rechazamos el login
        if (!user || user.estado !== "ACTIVO") return null;

        // Hasheamos la contraseña ingresada y la comparamos con la de la BD
        const inputHash = crypto.createHash("sha256").update(credentials.password).digest("hex");
        
        if (inputHash === user.passwordHash) {
          // Retornamos los datos que se guardarán en la sesión (token JWT)
          return { 
            id: user.userId, 
            name: user.nombre, 
            email: user.email, 
            rol: user.rol // Pasamos el rol personalizado
          };
        }

        return null;
      }
    })
  ],
  pages: {
    signIn: "/login", // Le decimos a NextAuth dónde está nuestra vista personalizada
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    // Inyectamos el ID y el Rol en el Token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.rol = (user as any).rol;
      }
      return token;
    },
    // Pasamos los datos del Token a la Sesión del navegador
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).rol = token.rol;
      }
      return session;
    }
  }
};