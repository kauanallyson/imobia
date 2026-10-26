import { beforeEach } from 'bun:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { db } from '#/db'
import { env } from '#/env'

const quiet = postgres(env.DATABASE_URL, { onnotice: () => {} })
await migrate(drizzle(quiet), { migrationsFolder: './drizzle' })
await quiet.end()

beforeEach(async () => {
  await db.execute(sql`truncate table "user", session, account, verification`)
})
