import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
if (process.env.NODE_ENV === "production")
  throw new Error("Local demo setup is disabled in production.");
mkdirSync(".local", { recursive: true });
if (!existsSync(".env.local")) {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    ".env.local",
    [
      `DATABASE_URL=postgresql://brightloop:${password}@127.0.0.1:55432/brightloop`,
      `BETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}`,
      "BETTER_AUTH_URL=http://localhost:3000",
      "APP_BASE_URL=http://localhost:3000",
      "ALLOW_LOCAL_DEMO=true",
      `BILLING_CRON_SECRET=${randomBytes(32).toString("hex")}`,
      `DEMO_PASSWORD=${randomBytes(10).toString("hex")}Aa!`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
}
for (const script of [
  "scripts/postgres.ts",
  "scripts/migrate.ts",
  "scripts/seed.ts",
]) {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      script,
      ...(script.includes("postgres") ? ["start"] : []),
    ],
    { stdio: "inherit", windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "Ready. Run npm run dev. Local credentials: .local/demo-credentials.txt",
);
