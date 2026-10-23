import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";

// Sem route handler /api/auth: login e logout chamam auth.api nas Server
// Actions, então não existe endpoint público de cadastro. Usuários são
// criados pela DAL (src/data/users.ts).
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      role: { type: "string", input: false },
      imobiliariaId: { type: "string", required: false, input: false },
      ativo: { type: "boolean", input: false },
    },
  },
  advanced: { database: { generateId: "uuid" } },
  databaseHooks: {
    session: {
      create: {
        // Corretor desativado não entra.
        before: async (session) => {
          const [user] = await db
            .select({ ativo: schema.users.ativo })
            .from(schema.users)
            .where(eq(schema.users.id, session.userId));
          if (!user?.ativo) {
            throw new APIError("FORBIDDEN", { message: "Conta desativada" });
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
