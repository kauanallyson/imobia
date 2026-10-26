import { beforeEach } from 'bun:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { db } from '#/db'
import { env } from '#/env'

// Bun lets a DATABASE_URL already exported in the shell override .env.test,
// and the truncate below would wipe whatever database that points at.
if (!new URL(env.DATABASE_URL).pathname.endsWith('_test')) {
  throw new Error('Os testes só podem rodar contra um banco *_test.')
}

const quiet = postgres(env.DATABASE_URL, { onnotice: () => {} })
await migrate(drizzle(quiet), { migrationsFolder: './drizzle' })
await quiet.end()

beforeEach(async () => {
  await db.execute(sql`truncate table "user", session, account, verification`)
})
