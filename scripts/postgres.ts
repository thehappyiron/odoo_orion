import "./env";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL!);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55432" ||
  url.username !== "brightloop"
) {
  console.log("Using configured PostgreSQL; manage that server separately.");
  process.exit(0);
}
const bin =
  process.env.PG_BIN ??
  (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
const command = (name: string, args: string[], optional = false) => {
  const result = spawnSync(bin ? join(bin, name) : name, args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: name === "pg_ctl" && args.includes("start") ? "ignore" : "pipe",
  });
  if (!optional && result.status !== 0)
    throw new Error(
      result.stderr ||
        result.stdout ||
        `Cannot execute ${name}; set PG_BIN to your PostgreSQL bin directory.`,
    );
  return result;
};
const data = resolve(".local/postgres");
mkdirSync(".local", { recursive: true });
if (process.argv[2] === "stop") {
  command("pg_ctl", ["-D", data, "stop", "-m", "fast"]);
} else {
  if (!existsSync(join(data, "PG_VERSION"))) {
    const pw = resolve(".local/.pg-password");
    try {
      writeFileSync(pw, decodeURIComponent(url.password), { mode: 0o600 });
      command("initdb", [
        "-D",
        data,
        "-U",
        "brightloop",
        "-A",
        "scram-sha-256",
        "--pwfile",
        pw,
        "--encoding=UTF8",
        "--locale=C",
      ]);
    } finally {
      if (existsSync(pw)) unlinkSync(pw);
    }
  }
  if (command("pg_ctl", ["-D", data, "status"], true).status !== 0) {
    command("pg_ctl", [
      "-D",
      data,
      "-l",
      resolve(".local/postgres.log"),
      "-o",
      "-p 55432 -h 127.0.0.1",
      "-w",
      "start",
    ]);
  }
  const client = new pg.Client({
    connectionString: url.toString().replace(/\/brightloop$/, "/postgres"),
  });
  await client.connect();
  for (const database of ["brightloop", "brightloop_test"]) {
    const found = await client.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [database],
    );
    if (!found.rowCount) await client.query(`CREATE DATABASE ${database}`);
  }
  await client.end();
  console.log("Local PostgreSQL ready on 127.0.0.1:55432.");
}
