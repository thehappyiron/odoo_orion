import "./env";
import { pool, one, rows, transaction } from "../src/lib/db";
import type { Actor } from "../src/lib/types";
import { saveCatalog, saveCustomer } from "../src/domain/catalog";
import {
  createSubscription,
  subscription,
  transition,
} from "../src/domain/subscriptions";
import {
  insertInvoice,
  priced,
  invoiceAction,
  recordPayment,
} from "../src/domain/invoices";
import { today, addDays, cycleEnd } from "../src/domain/dates";
import { audit } from "../src/domain/access";
import { scan } from "../src/domain/integrity";
const url = new URL(process.env.DATABASE_URL!);
if (
  process.env.ALLOW_LOCAL_DEMO !== "true" ||
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw new Error("Showcase data is restricted to explicit local demo mode.");
const actor = await one<Actor>(
  'SELECT id,name,email,role FROM "user" WHERE role=\'ADMIN\' ORDER BY "createdAt" LIMIT 1',
);
if (!actor)
  throw new Error("Run npm run setup first to create the demo administrator.");
const lock = await pool.connect();
await lock.query("SELECT pg_advisory_lock(824749)");
try {
  const now = today();
  const first = now.slice(0, 7) + "-01";
  const startDate = new Date(`${first}T12:00:00Z`);
  startDate.setUTCMonth(startDate.getUTCMonth() - 5);
  const start = startDate.toISOString().slice(0, 10);
  const product =
    (await one<{ id: string }>(
      "SELECT id FROM products WHERE sku='DEMO-WORKSPACE'",
    )) ??
    (await saveCatalog(actor, "products", {
      sku: "DEMO-WORKSPACE",
      name: "Demo · Connected Workspace",
      type: "Software",
      sales_amount: "1999",
      cost_amount: "450",
      notes: "Sample product for the local interactive demonstration.",
    }));
  const addon =
    (await one<{ id: string }>(
      "SELECT id FROM products WHERE sku='DEMO-SUPPORT'",
    )) ??
    (await saveCatalog(actor, "products", {
      sku: "DEMO-SUPPORT",
      name: "Demo · Priority Care",
      type: "Service",
      sales_amount: "499",
      cost_amount: "100",
      notes: "Sample recurring support add-on.",
    }));
  const plan =
    (await one<{ id: string }>(
      "SELECT id FROM plans WHERE code='DEMO-SHOWCASE-M'",
    )) ??
    (await saveCatalog(actor, "plans", {
      code: "DEMO-SHOWCASE-M",
      name: "Demo · Growth monthly",
      product_id: product!.id,
      amount: "1999",
      frequency: "MONTHLY",
      min_quantity: 1,
      available_from: "2020-01-01",
      available_until: null,
      allow_pause: true,
      allow_close: true,
      allow_renew: true,
      auto_close: true,
      description:
        "A sample team workspace with six months of billing history.",
    }));
  const customers: { id: string; stage: string }[] = [];
  for (const [i, name] of [
    "Aurora Design Studio",
    "Maple Retail Collective",
    "Cloudline Technologies",
    "Little Leaf Foods",
    "Seabrook Consulting",
    "Mango Media House",
    "Northstar Logistics",
    "Openfield Labs",
  ].entries()) {
    const email = `showcase-${i}@example.invalid`;
    const c =
      (await one<{ id: string }>("SELECT id FROM customers WHERE email=$1", [
        email,
      ])) ??
      (await saveCustomer(actor, {
        company: `Demo · ${name}`,
        contact: `${name.split(" ")[0]} team`,
        email,
        address: "Sample business · Bengaluru, India",
      }));
    customers.push({
      id: String(c!.id),
      stage:
        i === 5
          ? "PAUSED"
          : i === 6
            ? "QUOTATION"
            : i === 7
              ? "DRAFT"
              : "ACTIVE",
    });
  }
  // Give existing empty portals sample records without changing their identity or other data.
  const empty = await rows<{ id: string }>(
    "SELECT c.id FROM customers c JOIN \"user\" u ON u.id=c.user_id WHERE u.role='CUSTOMER' AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.customer_id=c.id)",
  );
  customers.push(...empty.map((c) => ({ id: c.id, stage: "ACTIVE" })));
  let created = 0;
  for (const [index, c] of customers.entries()) {
    let record = await one<{ id: string }>(
      "SELECT id FROM subscriptions WHERE customer_id=$1 AND plan_id=$2 ORDER BY created_at LIMIT 1",
      [c.id, plan!.id],
    );
    if (
      record &&
      (await one(
        "SELECT id FROM audit WHERE entity_id=$1 AND action='demo.showcase_completed'",
        [record.id],
      ))
    )
      continue;
    if (!record)
      record = await createSubscription(actor, {
        customer_id: c.id,
        plan_id: plan!.id,
        start_on: start,
        expiry_on: null,
        payment_days: 7,
        lines: [
          { kind: "BASE", productId: product!.id, quantity: 1 + (index % 4) },
          ...(index % 2 === 0
            ? [{ kind: "ADDON", productId: addon!.id, quantity: 1 }]
            : []),
        ],
      });
    let s = await subscription(actor, record!.id);
    if (c.stage !== "DRAFT" && s.status === "DRAFT")
      s = await transition(actor, s.id, {
        action: "issue",
        version: s.version,
        reason: "Demo showcase quotation",
      });
    if (!["DRAFT", "QUOTATION"].includes(c.stage)) {
      if (s.status === "QUOTATION")
        s = await transition(actor, s.id, {
          action: "confirm",
          version: s.version,
          reason: "Demo customer acceptance",
        });
      if (s.status === "CONFIRMED")
        s = await transition(actor, s.id, {
          action: "activate",
          version: s.version,
          reason: "Demo showcase activation",
        });
      let on = start;
      for (let cycle = 0; on <= now && cycle < 6; cycle++) {
        const end = cycleEnd(on, "MONTHLY", 1);
        let bill = await transaction(
          async (db) =>
            (await one<{
              id: string;
              status: string;
              total: number;
              paid: number;
            }>(
              "SELECT id,status,total,paid FROM invoices WHERE subscription_id=$1 AND period_start=$2",
              [s.id, on],
              db,
            )) ??
            (await insertInvoice(db, s, await priced(s, on, db), on, end)),
        );
        if (bill!.status === "DRAFT")
          bill = await invoiceAction(
            actor,
            bill!.id,
            "confirm",
            "Reviewed sample invoice for the local demo",
          );
        const shouldPay = cycle < 4 || index % 3 !== 0;
        const desired = shouldPay
          ? cycle === 5 && index % 3 === 1
            ? Math.floor(bill!.total / 2)
            : bill!.total
          : 0;
        if (desired > bill!.paid)
          await recordPayment(actor, {
            invoice_id: bill!.id,
            amount: ((desired - bill!.paid) / 100).toFixed(2),
            method: ["BANK", "UPI", "CARD"][index % 3],
            paid_on: addDays(on, 3) > now ? now : addDays(on, 3),
            reference: `showcase-${s.id}-${on}`,
            note: "DEMO: simulated received payment for the local walkthrough; no real money moved.",
          });
        on = end;
      }
      await pool.query(
        "UPDATE subscriptions SET next_billing_on=$2 WHERE id=$1",
        [s.id, on],
      );
      s = await subscription(actor, s.id);
      if (c.stage === "PAUSED" && s.status === "ACTIVE")
        await transition(actor, s.id, {
          action: "pause",
          version: s.version,
          reason: "Demo: customer paused after the current billed cycle",
        });
    }
    await audit(pool, actor, "demo.showcase_completed", s.id, { sample: true });
    created++;
  }
  await scan(actor);
  console.log(
    `Showcase ready: ${created} sample subscriptions added or completed. Existing user records were retained.`,
  );
} finally {
  await lock.query("SELECT pg_advisory_unlock(824749)");
  lock.release();
  await pool.end();
}
