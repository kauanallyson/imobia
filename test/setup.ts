import { afterAll } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { ensureContainer, testDb, waitForDatabase } from "./database";

await ensureContainer();
await waitForDatabase();
await migrate(testDb, { migrationsFolder: "./drizzle" });

afterAll(async () => {
  await testDb.$client.end();
});
