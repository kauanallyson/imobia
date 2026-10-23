import { z } from "zod";

// Único ponto da aplicação que lê process.env. Validado ao ser
// importado: next.config.ts e drizzle.config.ts importam este módulo, então
// `next build`, `next dev` e o drizzle-kit falham cedo com env inválida.
// Sem `import "server-only"` porque next.config.ts roda fora do ambiente
// React Server; não importe este módulo em Client Components.
const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  // URL pública do app (webhooks da Evolution apontam para cá).
  APP_URL: z.url(),
  // Evolution API auto-hospedada (ADR-0004).
  EVOLUTION_API_URL: z.url(),
  EVOLUTION_API_KEY: z.string().min(1),
  // Segredo que a Evolution envia no header x-webhook-secret.
  EVOLUTION_WEBHOOK_SECRET: z.string().min(16),
  // OpenAI (embeddings da base de conhecimento; assistente e transcrição nos
  // tickets 09 e 19).
  OPENAI_API_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
