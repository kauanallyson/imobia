import { z } from "zod";

// Único ponto da aplicação que lê process.env. Validado ao ser
// importado: next.config.ts e drizzle.config.ts importam este módulo, então
// `next build`, `next dev` e o drizzle-kit falham cedo com env inválida.
// Sem `import "server-only"` porque next.config.ts roda fora do ambiente
// React Server; não importe este módulo em Client Components.
const envSchema = z
  .object({
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
    // Cloudflare R2 via S3Client do Bun (src/lib/storage.ts). Informe o
    // endpoint completo ou só o id da conta.
    R2_ENDPOINT: z.url().optional(),
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
  })
  .refine((e) => e.R2_ENDPOINT || e.R2_ACCOUNT_ID, {
    message: "Informe R2_ENDPOINT ou R2_ACCOUNT_ID",
    path: ["R2_ENDPOINT"],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
