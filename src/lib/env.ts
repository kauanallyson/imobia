import { z } from "zod";

// Único ponto da aplicação que lê process.env. Validado ao ser
// importado: next.config.ts e drizzle.config.ts importam este módulo, então
// `next build`, `next dev` e o drizzle-kit falham cedo com env inválida.
// Sem `import "server-only"` porque next.config.ts roda fora do ambiente
// React Server; não importe este módulo em Client Components.
const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
