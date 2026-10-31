import "./env";
import { readFileSync, readdirSync } from "node:fs";
import { getMigrations } from "better-auth/db/migration";
import { authOptions } from "../src/lib/auth-config";
import { pool, transaction } from "../src/lib/db";
export async function migrate() {
  const { runMigrations } = await getMigrations(authOptions);
  await runMigrations();
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS user_normalized_email ON "user"(lower(trim(email)))',
  );
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(824741)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    for (const file of readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        (
          await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            file,
          ])
        ).rowCount
      )
        continue;
      await db.query(readFileSync(`migrations/${file}`, "utf8"));
      await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
      console.log(`Applied ${file}`);
    }
  });
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/migrate.ts")) {
  await migrate();
  await pool.end();
}
