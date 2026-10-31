import "./env";
import { spawn } from "node:child_process";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL!);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error("E2E fixture setup is restricted to local PostgreSQL.");
const controlUrl = new URL(url);
controlUrl.pathname = "/postgres";
const control = new pg.Client({ connectionString: controlUrl.toString() });
await control.connect();
if (
  !(
    await control.query(
      "SELECT 1 FROM pg_database WHERE datname='brightloop_e2e'",
    )
  ).rowCount
)
  await control.query("CREATE DATABASE brightloop_e2e");
await control.end();
url.pathname = "/brightloop_e2e";
process.env.DATABASE_URL = url.toString();
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3101";
process.env.APP_BASE_URL = process.env.BETTER_AUTH_URL;
process.env.ALLOW_LOCAL_DEMO = "true";
process.env.BRIGHTLOOP_TEST = "true";
const { pool } = await import("../src/lib/db");
if (new URL(process.env.DATABASE_URL!).pathname !== "/brightloop_e2e")
  throw new Error("Refusing to reset a non-E2E database");
await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
const { migrate } = await import("./migrate");
await migrate();
await import("./seed");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3101",
  ],
  {
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit",
    windowsHide: true,
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.kill();
    process.exit();
  });
server.on("exit", (code) => process.exit(code ?? 0));
