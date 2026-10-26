import { defineConfig } from 'drizzle-kit'
import { z } from 'zod'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: z.url().parse(process.env.DATABASE_URL) },
})
