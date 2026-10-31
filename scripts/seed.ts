import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { auth } from "../src/lib/auth";
import { pool, one, transaction } from "../src/lib/db";
import type { Actor, Role } from "../src/lib/types";
import { today, addDays, cycleEnd } from "../src/domain/dates";
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
import { scan } from "../src/domain/integrity";
if (
  process.env.ALLOW_LOCAL_DEMO !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Demo seeding is disabled outside explicit local demo mode.");
const existing = await one("SELECT id FROM products LIMIT 1");
if (existing) {
  console.log("Existing demo data retained; no records were overwritten.");
  await pool.end();
  process.exit(0);
}
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("Set DEMO_PASSWORD or run npm run setup.");
async function account(
  email: string,
  name: string,
  role: Role,
): Promise<Actor> {
  const result = await auth.api.signUpEmail({
    body: { email, name, password: password! },
  });
  await pool.query(
    'UPDATE "user" SET role=$2,"emailVerified"=true WHERE id=$1',
    [result.user.id, role],
  );
  await pool.query('DELETE FROM session WHERE "userId"=$1', [result.user.id]);
  if (role !== "CUSTOMER")
    await pool.query("DELETE FROM customers WHERE user_id=$1", [
      result.user.id,
    ]);
  return { id: result.user.id, email, name, role };
}
const admin = await account("admin@brightloop.local", "Aarav Shah", "ADMIN");
await account("staff@brightloop.local", "Meera Joshi", "STAFF");
await account("finance@brightloop.local", "Kabir Desai", "STAFF");
const owners = [];
for (const [email, name, company] of [
  ["anvi@brightloop.local", "Anvi Rao", "Studio North"],
  ["rohan@brightloop.local", "Rohan Mehta", "Meridian Labs"],
  ["isha@brightloop.local", "Isha Nair", "Bloom & Co."],
]) {
  const a = await account(email, name, "CUSTOMER");
  const c = await one<{ id: string }>(
    "UPDATE customers SET company=$2,address=$3 WHERE user_id=$1 RETURNING id",
    [a.id, company, "Bengaluru, India"],
  );
  owners.push(c!.id);
}
for (const company of [
  "Paperplane Studio",
  "Atlas Technologies",
  "Saffron Retail",
  "Kiteworks India",
  "Cedar Consulting",
  "Copper Cloud",
  "Finch Design",
  "Goodform Health",
  "Horizon Systems",
  "Juniper Foods",
  "Orbit Commerce",
  "Pebble Analytics",
  "Riverstone Media",
  "Tandem Logistics",
  "Westward Ventures",
]) {
  const c = await saveCustomer(admin, {
    company,
    contact: company.split(" ")[0] + " Team",
    email: company.toLowerCase().replace(/[^a-z]/g, "") + "@example.invalid",
    address: "India",
  });
  owners.push(String(c.id));
}
const now = today();
const product = await saveCatalog(admin, "products", {
  sku: "BMS-001",
  name: "Business Management Suite",
  type: "Software",
  sales_amount: "1200",
  cost_amount: "400",
  notes: "Core business workspace. Plans override the catalog price.",
});
const addon = await saveCatalog(admin, "products", {
  sku: "SUP-001",
  name: "Priority Support",
  type: "Service",
  sales_amount: "499",
  cost_amount: "120",
  notes: "A recurring support add-on.",
});
const variant = await saveCatalog(admin, "variants", {
  product_id: product!.id,
  name: "Odoo",
  attribute: "Brand",
  delta: "560",
});
await saveCatalog(admin, "taxes", {
  name: "Demo tax · 18%",
  rate_bps: 1800,
  product_ids: [],
  valid_from: "2020-01-01",
  valid_until: null,
});
await saveCatalog(admin, "discounts", {
  code: "WELCOME10",
  name: "Welcome saving",
  kind: "PERCENT",
  value: "10",
  product_ids: [],
  min_amount: "0",
  min_quantity: 1,
  valid_from: "2020-01-01",
  valid_until: addDays(now, 365),
  max_uses: 500,
});
await saveCatalog(admin, "discounts", {
  code: "TEAM15",
  name: "Team volume saving",
  kind: "PERCENT",
  value: "15",
  product_ids: [product!.id],
  min_amount: "0",
  min_quantity: 5,
  valid_from: "2020-01-01",
  valid_until: addDays(now, 365),
  max_uses: 100,
});
const plans = [];
for (const [name, code, amount, frequency, min] of [
  ["Essentials", "ESS-M", "1000", "MONTHLY", 1],
  ["Growth", "GRO-M", "2499", "MONTHLY", 1],
  ["Enterprise", "ENT-Y", "24999", "YEARLY", 5],
  ["Weekly Flex", "FLX-W", "399", "WEEKLY", 1],
  ["Daily Access", "DAY-D", "99", "DAILY", 1],
] as const) {
  const p = await saveCatalog(admin, "plans", {
    name,
    code,
    product_id: product!.id,
    amount,
    frequency,
    min_quantity: min,
    available_from: "2020-01-01",
    available_until: null,
    allow_pause: true,
    allow_close: frequency !== "YEARLY",
    allow_renew: true,
    auto_close: true,
    description:
      name === "Essentials"
        ? "The everyday toolkit for a growing business."
        : name === "Growth"
          ? "More room for ambitious teams."
          : "Flexible, dependable business software.",
  });
  plans.push(p!);
}
await saveCatalog(admin, "templates", {
  name: "Essentials + Odoo",
  plan_id: plans[0].id,
  validity_days: 14,
  payment_days: 7,
  lines: [
    {
      kind: "BASE",
      productId: product!.id,
      variantId: variant!.id,
      quantity: 1,
    },
  ],
});
await saveCatalog(admin, "templates", {
  name: "Growth with Priority Support",
  plan_id: plans[1].id,
  validity_days: 21,
  payment_days: 14,
  lines: [
    { kind: "BASE", productId: product!.id, quantity: 2 },
    { kind: "ADDON", productId: addon!.id, quantity: 1 },
  ],
});
for (let i = 0; i < owners.length + 6; i++) {
  const index = i % owners.length;
  const plan = plans[i % 3];
  const anchor = new Date(`${now}T12:00:00Z`);
  anchor.setUTCMonth(anchor.getUTCMonth() - 4, Math.min(20, 2 + i));
  const start = anchor.toISOString().slice(0, 10);
  const draft = await createSubscription(admin, {
    customer_id: owners[index],
    plan_id: plan.id,
    start_on: start,
    expiry_on: null,
    payment_days: 7,
    lines: [
      {
        kind: "BASE",
        productId: product!.id,
        variantId: i % 3 === 0 ? variant!.id : null,
        quantity: plan.min_quantity,
      },
    ],
  });
  let s = await subscription(admin, draft!.id);
  if (i === 20) continue;
  s = await transition(admin, s.id, {
    action: "issue",
    version: s.version,
    reason: "Seed demo quotation",
  });
  if (i === 21) continue;
  s = await transition(admin, s.id, {
    action: "confirm",
    version: s.version,
    reason: "Demo customer accepted the offer",
  });
  s = await transition(admin, s.id, {
    action: "activate",
    version: s.version,
    reason: "Activate local demo agreement",
  });
  let on = start;
  let cycles = 0;
  while (on <= now && cycles < 4) {
    const end = cycleEnd(on, s.frequency, s.anchor_day, s.anchor_month);
    const bill = await transaction(async (db) =>
      insertInvoice(db, s, await priced(s, on, db), on, end),
    );
    await invoiceAction(
      admin,
      bill!.id,
      "confirm",
      "Confirm balanced demo invoice",
    );
    if ((i + cycles) % 4 !== 0) {
      const amount =
        (i + cycles) % 5 === 0 ? Math.floor(bill!.total / 2) : bill!.total;
      await recordPayment(admin, {
        invoice_id: bill!.id,
        amount: (amount / 100).toFixed(2),
        method: ["BANK", "UPI", "CARD"][i % 3],
        paid_on: addDays(on, 3),
        note: "Manually recorded demo receipt",
        reference: `demo-${i}-${cycles}`,
      });
    }
    on = end;
    cycles++;
  }
  await pool.query("UPDATE subscriptions SET next_billing_on=$2 WHERE id=$1", [
    s.id,
    on,
  ]);
  if (i === 18)
    await pool.query(
      "UPDATE subscriptions SET status='PAUSED',version=version+1 WHERE id=$1",
      [s.id],
    );
  if (i === 19)
    await pool.query(
      "UPDATE subscriptions SET status='CLOSED',version=version+1 WHERE id=$1",
      [s.id],
    );
  // Two labelled anomalous drafts demonstrate protection without corrupting issued bills.
  if (i === 0 || i === 1) {
    const fixture = await transaction(async (db) =>
      insertInvoice(
        db,
        s,
        await priced(s, on, db),
        on,
        cycleEnd(on, s.frequency, s.anchor_day, s.anchor_month),
      ),
    );
    if (i === 0)
      await pool.query(
        "UPDATE invoices SET total=total+25000,fixture=true WHERE id=$1",
        [fixture!.id],
      );
    else
      await pool.query(
        "UPDATE invoices SET lines=jsonb_set(lines,'{0,quantity}','99'),discount=0,discount_id=NULL,discount_code=NULL,fixture=true WHERE id=$1",
        [fixture!.id],
      );
    await pool.query(
      "UPDATE subscriptions SET next_billing_on=$2 WHERE id=$1",
      [s.id, cycleEnd(on, s.frequency, s.anchor_day, s.anchor_month)],
    );
  }
}
await scan(admin);
mkdirSync(".local", { recursive: true });
writeFileSync(
  process.env.BRIGHTLOOP_TEST === "true"
    ? ".local/e2e-credentials.txt"
    : ".local/demo-credentials.txt",
  `LOCAL DEMO ONLY\nPassword for all demo accounts: ${password}\n\nAdmin: admin@brightloop.local\nStaff: staff@brightloop.local\nFinance: finance@brightloop.local\nCustomer: anvi@brightloop.local\nSecond customer: rohan@brightloop.local\nThird customer: isha@brightloop.local\n`,
  { mode: 0o600 },
);
console.log(
  "Demo seeded in PostgreSQL. Credentials saved to .local/demo-credentials.txt (gitignored).",
);
await pool.end();
