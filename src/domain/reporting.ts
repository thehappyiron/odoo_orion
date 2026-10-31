import { one, rows, type Db, pool } from "@/lib/db";
import type { Actor } from "@/lib/types";
import { customerScope, staff, admin } from "./access";
import { today, cycleEnd } from "./dates";
import { date, uuid } from "@/lib/validation";
import { AppError } from "@/lib/errors";
export interface Filters {
  from?: string;
  to?: string;
  customer?: string;
  plan?: string;
  status?: string;
  search?: string;
  page?: number;
}
export function parseFilters(params: URLSearchParams): Filters {
  const f: Filters = {};
  for (const key of ["from", "to"] as const)
    if (params.get(key)) f[key] = date.parse(params.get(key));
  for (const key of ["customer", "plan"] as const)
    if (params.get(key)) f[key] = uuid.parse(params.get(key));
  if (params.get("status")) f.status = params.get("status")!.slice(0, 30);
  if (params.get("search"))
    f.search = params.get("search")!.trim().slice(0, 100);
  f.page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
  if (f.from && f.to && f.from > f.to)
    throw new AppError(
      400,
      "INVALID_RANGE",
      "Start date must be before end date.",
    );
  return f;
}
export async function list(
  actor: Actor,
  kind: string,
  f: Filters = {},
  db: Db = pool,
) {
  const scope = await customerScope(actor, db);
  const values: unknown[] = [];
  const conditions: string[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replaceAll("?", `$${values.length}`));
  };
  let select = "",
    from = "",
    sort = "created_at DESC",
    search = "",
    status = "";
  switch (kind) {
    case "subscriptions":
      select = "s.*,c.company,p.name AS plan_name,p.frequency";
      from =
        "subscriptions s JOIN customers c ON c.id=s.customer_id JOIN plans p ON p.id=s.plan_id";
      sort = "s.created_at DESC,s.id";
      search = "s.number || ' ' || c.company || ' ' || p.name";
      status = "s.status";
      if (scope || f.customer) add("s.customer_id=?", scope ?? f.customer);
      if (f.plan) add("s.plan_id=?", f.plan);
      break;
    case "invoices":
      select =
        "i.*,c.company,s.number AS subscription_number,p.name AS plan_name,(i.total-i.paid) AS balance,CASE WHEN i.status='CONFIRMED' AND i.due_on<(now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'OVERDUE' WHEN i.status='CONFIRMED' AND i.paid>0 THEN 'PARTIAL' ELSE i.status END AS display_status";
      from =
        "invoices i JOIN customers c ON c.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id JOIN plans p ON p.id=s.plan_id";
      sort = "i.created_at DESC,i.id";
      search = "i.number || ' ' || c.company";
      status = "i.status";
      if (scope) {
        add("i.customer_id=?", scope);
        conditions.push("i.status IN ('CONFIRMED','PAID')");
      } else if (f.customer) add("i.customer_id=?", f.customer);
      if (f.plan) add("s.plan_id=?", f.plan);
      if (f.from) add("i.billing_date>=?", f.from);
      if (f.to) add("i.billing_date<=?", f.to);
      if (f.status === "OVERDUE") {
        conditions.push("i.status='CONFIRMED'");
        add("i.due_on<?", today());
        status = "";
      }
      if (f.status === "PARTIAL") {
        conditions.push("i.status='CONFIRMED' AND i.paid>0");
        status = "";
      }
      break;
    case "payments":
      staff(actor);
      select = "t.*,i.number AS invoice_number,c.company";
      from =
        "payments t JOIN invoices i ON i.id=t.invoice_id JOIN customers c ON c.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id";
      sort = "t.created_at DESC,t.id";
      search =
        "i.number || ' ' || c.company || ' ' || COALESCE(t.reference,'')";
      if (f.from) add("t.paid_on>=?", f.from);
      if (f.to) add("t.paid_on<=?", f.to);
      if (f.customer) add("i.customer_id=?", f.customer);
      if (f.plan) add("s.plan_id=?", f.plan);
      break;
    case "customers":
      staff(actor);
      select =
        "c.*, (SELECT count(*)::int FROM subscriptions s WHERE s.customer_id=c.id) AS subscriptions";
      from = "customers c";
      sort = "c.created_at DESC,c.id";
      search = "c.company || ' ' || c.email";
      break;
    case "staff":
      admin(actor);
      select = 'id,name,email,role,"createdAt" AS created_at';
      from = '"user"';
      conditions.push("role IN ('ADMIN','STAFF')");
      search = "name || ' ' || email";
      sort = '"createdAt" DESC';
      break;
    case "outbox":
      admin(actor);
      select = "id,recipient,subject,body,kind,created_at";
      from = "outbox";
      search = "recipient || ' ' || subject";
      break;
    case "audit":
      staff(actor);
      select = "a.*,u.name AS actor_name";
      from = 'audit a LEFT JOIN "user" u ON u.id=a.actor_id';
      sort = "a.created_at DESC,a.id";
      search = "a.action || ' ' || a.entity_id";
      break;
    case "billing-runs":
      staff(actor);
      select = "*";
      from = "billing_runs";
      break;
    case "findings":
      staff(actor);
      select = "*";
      from = "findings";
      status = "status";
      search = "title || ' ' || code";
      sort = "CASE WHEN status='OPEN' THEN 0 ELSE 1 END,created_at DESC";
      break;
    case "plans":
      staff(actor);
      select = "p.*,r.name AS product_name";
      from = "plans p JOIN products r ON r.id=p.product_id";
      sort = "p.created_at DESC,p.id";
      search = "p.name || ' ' || p.code";
      break;
    case "products":
    case "variants":
    case "taxes":
    case "discounts":
    case "templates":
      staff(actor);
      select = "*";
      from = kind;
      search = kind === "variants" ? "name" : "name";
      if (kind === "variants") sort = "name";
      break;
    default:
      throw new AppError(404, "NOT_FOUND", "Collection not found.");
  }
  if (f.status && status) add(`${status}=?`, f.status);
  if (f.search && search) add(`(${search}) ILIKE ?`, `%${f.search}%`);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const count = await one<{ total: number }>(
    `SELECT count(*)::int total FROM ${from} ${where}`,
    values,
    db,
  );
  const result = await rows(
    `SELECT ${select} FROM ${from} ${where} ORDER BY ${sort} LIMIT 25 OFFSET $${values.length + 1}`,
    [...values, ((f.page ?? 1) - 1) * 25],
    db,
  );
  return {
    items: result,
    total: count!.total,
    page: f.page ?? 1,
    pageSize: 25,
  };
}
export async function dashboard(actor: Actor, f: Filters = {}) {
  const scoped = await customerScope(actor);
  const customer = scoped ?? f.customer ?? null;
  const plan = f.plan ?? null;
  const from = f.from ?? "2000-01-01",
    to = f.to ?? today();
  const [
    invoices,
    payments,
    subscriptions,
    series,
    overdue,
    recent,
    runs,
    findings,
  ] = await Promise.all([
    one<{
      billed: number;
      outstanding: number;
      overdue: number;
      drafts: number;
      overdue_count: number;
    }>(
      "SELECT COALESCE(sum(i.subtotal-i.discount) FILTER(WHERE i.status IN ('CONFIRMED','PAID')),0)::bigint billed,COALESCE(sum(i.total-i.paid) FILTER(WHERE i.status='CONFIRMED'),0)::bigint outstanding,COALESCE(sum(i.total-i.paid) FILTER(WHERE i.status='CONFIRMED' AND i.due_on<$5),0)::bigint overdue,count(*) FILTER(WHERE i.status='DRAFT')::int drafts,count(*) FILTER(WHERE i.status='CONFIRMED' AND i.due_on<$5)::int overdue_count FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id WHERE ($1::uuid IS NULL OR i.customer_id=$1) AND ($2::uuid IS NULL OR s.plan_id=$2) AND i.billing_date BETWEEN $3 AND $4",
      [customer, plan, from, to, today()],
    ),
    one<{ collected: number }>(
      "SELECT COALESCE(sum(p.amount),0)::bigint collected FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN subscriptions s ON s.id=i.subscription_id WHERE p.reversed_at IS NULL AND p.paid_on BETWEEN $3 AND $4 AND ($1::uuid IS NULL OR i.customer_id=$1) AND ($2::uuid IS NULL OR s.plan_id=$2)",
      [customer, plan, from, to],
    ),
    rows<{ status: string; count: number }>(
      "SELECT CASE WHEN status='ACTIVE' AND expiry_on<$3 THEN 'EXPIRED' ELSE status END status,count(*)::int count FROM subscriptions WHERE ($1::uuid IS NULL OR customer_id=$1) AND ($2::uuid IS NULL OR plan_id=$2) AND start_on<=$3 GROUP BY 1",
      [customer, plan, today()],
    ),
    rows<{ month: string; collected: number }>(
      "SELECT to_char(p.paid_on,'YYYY-MM') AS month,sum(p.amount)::bigint collected FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN subscriptions s ON s.id=i.subscription_id WHERE p.reversed_at IS NULL AND p.paid_on BETWEEN $3 AND $4 AND ($1::uuid IS NULL OR i.customer_id=$1) AND ($2::uuid IS NULL OR s.plan_id=$2) GROUP BY 1 ORDER BY 1 DESC LIMIT 6",
      [customer, plan, from, to],
    ),
    rows(
      "SELECT i.id,i.number,c.company,i.total-i.paid balance,i.due_on FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id WHERE i.status='CONFIRMED' AND i.due_on<$5 AND i.billing_date BETWEEN $3 AND $4 AND ($1::uuid IS NULL OR i.customer_id=$1) AND ($2::uuid IS NULL OR s.plan_id=$2) ORDER BY i.due_on,i.id LIMIT 3",
      [customer, plan, from, to, today()],
    ),
    list(actor, "invoices", { ...f, page: 1 }),
    scoped
      ? Promise.resolve([])
      : rows("SELECT * FROM billing_runs ORDER BY created_at DESC LIMIT 3"),
    scoped
      ? Promise.resolve({ count: 0 })
      : one<{ count: number }>(
          "SELECT count(*)::int count FROM findings WHERE status='OPEN'",
        ),
  ]);
  // Six calendar buckets, filled from actual payment rows; missing buckets represent zero receipts.
  const chart = [];
  let month = today().slice(0, 7) + "-01";
  const d = new Date(`${month}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 5);
  month = d.toISOString().slice(0, 10);
  for (let n = 0; n < 6; n++) {
    chart.push({
      month: month.slice(0, 7),
      collected:
        series.find((x) => x.month === month.slice(0, 7))?.collected ?? 0,
    });
    month = cycleEnd(month, "MONTHLY", 1);
  }
  return {
    today: today(),
    ...invoices,
    ...payments,
    active: subscriptions.find((s) => s.status === "ACTIVE")?.count ?? 0,
    subscriptions,
    series: chart,
    overdueInvoices: overdue,
    recent: recent.items.slice(0, 5),
    runs,
    findings: findings?.count ?? 0,
    demo: process.env.ALLOW_LOCAL_DEMO === "true",
  };
}
