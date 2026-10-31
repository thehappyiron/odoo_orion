import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Database integer exceeds safe range");
  return n;
});
types.setTypeParser(1082, (value) => value); // Billing dates never pass through browser/server timezone conversion.
const globalDb = globalThis as unknown as { brightloopPool?: Pool };
export const pool =
  globalDb.brightloopPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
    statement_timeout: 15000,
  });
if (process.env.NODE_ENV !== "production") globalDb.brightloopPool = pool;
export type Db = Pick<PoolClient, "query">;
export async function rows<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
export async function one<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T | undefined> {
  return (await rows<T>(sql, params, db))[0];
}
export async function transaction<T>(
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
