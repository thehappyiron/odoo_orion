import "./env";
import { pool } from "../src/lib/db";
if (process.env.ALLOW_LOCAL_DEMO !== "true")
  throw new Error("Local outbox CLI is disabled.");
const email = process.argv[2];
if (!email) throw new Error("Usage: npm run outbox -- email@example.com");
const result = await pool.query(
  "SELECT subject,body,created_at FROM outbox WHERE lower(recipient)=lower($1) ORDER BY created_at DESC LIMIT 5",
  [email],
);
console.log(result.rows);
await pool.end();
