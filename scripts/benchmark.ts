import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { cpus, totalmem, platform } from "node:os";
import pg from "pg";
const source = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(source.hostname))
  throw new Error("The benchmark is restricted to local PostgreSQL.");
const maintenance = new URL(source);
maintenance.pathname = "/postgres";
const control = new pg.Client({ connectionString: maintenance.toString() });
await control.connect();
if (
  !(
    await control.query(
      "SELECT 1 FROM pg_database WHERE datname='brightloop_benchmark'",
    )
  ).rowCount
)
  await control.query("CREATE DATABASE brightloop_benchmark");
await control.end();
source.pathname = "/brightloop_benchmark";
process.env.DATABASE_URL = source.toString();
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3100";
process.env.APP_BASE_URL = process.env.BETTER_AUTH_URL;
const { pool, one } = await import("../src/lib/db");
if (new URL(process.env.DATABASE_URL!).pathname !== "/brightloop_benchmark")
  throw new Error("Refusing to reset a non-benchmark database.");
await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
const { migrate } = await import("./migrate");
await migrate();
const { auth } = await import("../src/lib/auth");
const password = randomBytes(20).toString("hex") + "Aa!";
const user = (
  await auth.api.signUpEmail({
    body: {
      name: "Benchmark admin",
      email: "benchmark@example.invalid",
      password,
    },
  })
).user;
await pool.query("UPDATE \"user\" SET role='ADMIN' WHERE id=$1", [user.id]);
const product = (await one<{ id: string }>(
  "INSERT INTO products(sku,name,type,sales_amount,cost_amount) VALUES('BENCH','Benchmark product','Software',100000,40000) RETURNING id",
))!.id;
const plan = (await one<{ id: string }>(
  "INSERT INTO plans(code,name,product_id,amount,frequency,available_from) VALUES('BENCH','Benchmark plan',$1,100000,'MONTHLY','2020-01-01') RETURNING id",
  [product],
))!.id;
const lines = JSON.stringify([
  {
    productId: product,
    name: "Benchmark product",
    kind: "BASE",
    quantity: 1,
    baseAmount: 100000,
    variantAmount: 0,
    unitAmount: 100000,
    taxBps: 1800,
    gross: 100000,
    discount: 0,
    tax: 18000,
    total: 118000,
  },
]);
console.log(
  "Seeding isolated benchmark database: 10,000 subscriptions and 60,000 invoices.",
);
await pool.query(
  "INSERT INTO customers(company,contact,email) SELECT 'Benchmark customer '||n,'Contact '||n,'bench'||n||'@example.invalid' FROM generate_series(1,1000)n",
);
await pool.query(
  "WITH ids AS(SELECT array_agg(id ORDER BY email) customers FROM customers WHERE email LIKE 'bench%@example.invalid') INSERT INTO subscriptions(customer_id,plan_id,status,start_on,next_billing_on,anchor_day,anchor_month,payment_days,lines,accepted) SELECT customers[(n%1000)+1],$1,CASE WHEN n%10=0 THEN 'PAUSED' WHEN n%10=1 THEN 'CLOSED' ELSE 'ACTIVE' END,(now() AT TIME ZONE 'Asia/Kolkata')::date-interval '1 year',(now() AT TIME ZONE 'Asia/Kolkata')::date+1,1,1,7,$2,$2 FROM generate_series(1,10000)n CROSS JOIN ids",
  [plan, lines],
);
await pool.query(
  "INSERT INTO invoices(subscription_id,customer_id,status,period_start,period_end,billing_date,due_on,issued_at,subtotal,discount,tax,total,paid,lines,customer_snapshot) SELECT s.id,s.customer_id,CASE WHEN n%3=0 THEN 'PAID' ELSE 'CONFIRMED' END,(date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')-n*interval '1 month')::date,(date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')-(n-1)*interval '1 month')::date,(date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')-n*interval '1 month')::date,(date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')-n*interval '1 month')::date+7,now(),100000,0,18000,118000,CASE WHEN n%3=0 THEN 118000 ELSE 0 END,$1,jsonb_build_object('company',c.company,'email',c.email,'address','Demo') FROM subscriptions s JOIN customers c ON c.id=s.customer_id CROSS JOIN generate_series(1,6)n",
  [lines],
);
await pool.query(
  "INSERT INTO payments(invoice_id,amount,method,paid_on,note,created_by) SELECT id,total,'BANK',billing_date+3,'Synthetic benchmark receipt',$1 FROM invoices WHERE status='PAID'",
  [user.id],
);
await pool.query("ANALYZE");
const version = await one<{ version: string }>("SELECT version()");
await pool.end();
let logs = "";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { env: { ...process.env, NODE_ENV: "production" }, windowsHide: true },
);
server.stdout.on("data", (chunk) => {
  logs += String(chunk);
});
server.stderr.on("data", (chunk) => {
  logs += String(chunk);
});
const base = "http://127.0.0.1:3100";
try {
  let ready = false;
  for (let n = 0; n < 40; n++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready)
    throw new Error(
      `Production benchmark server failed to start: ${logs.slice(-1500)}`,
    );
  const login = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: "benchmark@example.invalid", password }),
  });
  if (!login.ok) throw new Error("Benchmark login failed");
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const endpoints = [
    "/api/v1/subscriptions",
    "/api/v1/subscriptions?page=100",
    "/api/v1/invoices?status=OVERDUE",
    "/api/v1/payments",
    "/api/v1/dashboard",
    "/subscriptions",
    "/invoices",
    "/",
  ];
  const results = [];
  for (const endpoint of endpoints) {
    const timings = [];
    for (let n = 0; n < 33; n++) {
      const start = performance.now();
      const res = await fetch(base + endpoint, { headers: { cookie } });
      await res.arrayBuffer();
      if (!res.ok) throw new Error(`${endpoint}: ${res.status}`);
      if (n >= 3) timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    const entry = {
      endpoint,
      samples: timings.length,
      p50: Math.round(timings[14] * 100) / 100,
      p95: Math.round(timings[28] * 100) / 100,
      max: Math.round(timings.at(-1)! * 100) / 100,
    };
    results.push(entry);
    console.log(`${endpoint}: p50 ${entry.p50} ms / p95 ${entry.p95} ms`);
  }
  const report = {
    at: new Date().toISOString(),
    environment: {
      os: platform(),
      cpu: cpus()[0].model,
      memoryGb: Math.round(totalmem() / 1024 ** 3),
      node: process.version,
      postgres: version!.version,
    },
    dataset: {
      customers: 1001,
      subscriptions: 10000,
      invoices: 60000,
      payments: 20000,
    },
    measurement:
      "Warm production HTTP response including complete body, 3 warmups + 30 sequential requests, loopback network. HTML timings measure server response, not browser rendering or user-perceived navigation. No concurrency/load test.",
    results,
  };
  mkdirSync(".local", { recursive: true });
  writeFileSync(".local/performance.json", JSON.stringify(report, null, 2));
  writeFileSync(
    "docs/PERFORMANCE.md",
    `# Local performance evidence\n\nMeasured ${report.at}.\n\n${report.measurement}\n\nDataset: 10,000 subscriptions, 60,000 invoices, 20,000 payments, 1,001 customer profiles in isolated PostgreSQL database brightloop_benchmark.\n\nEnvironment: ${report.environment.os}, ${report.environment.cpu}, ${report.environment.memoryGb} GB RAM, Node ${report.environment.node}, ${report.environment.postgres}.\n\n| Endpoint | p50 ms | p95 ms | max ms |\n|---|---:|---:|---:|\n${results.map((r) => `| ${r.endpoint} | ${r.p50} | ${r.p95} | ${r.max} |`).join("\n")}\n\nReproduce: npm run build, then npm run test:perf. Requires free port 3100 and local PostgreSQL. The script resets ONLY brightloop_benchmark. It does not modify the demo database. This is local response-time evidence, not a production SLA or a browser-navigation benchmark.\n`,
  );
  if (results.some((r) => r.p95 >= 2000)) process.exitCode = 1;
} finally {
  server.kill();
}
