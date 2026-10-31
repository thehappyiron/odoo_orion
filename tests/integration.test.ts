import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Actor } from "../src/lib/types";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const testUrl = new URL(process.env.DATABASE_URL!);
testUrl.pathname = "/brightloop_test";
process.env.DATABASE_URL = testUrl.toString();
process.env.BETTER_AUTH_URL = "http://localhost:3000";
const { pool, one, rows, transaction } = await import("../src/lib/db");
const { passwordValid } = await import("../src/lib/auth-config");
let auth: typeof import("../src/lib/auth").auth;
const { saveCatalog } = await import("../src/domain/catalog");
const { createSubscription, subscription, transition } =
  await import("../src/domain/subscriptions");
const { amendAddons } = await import("../src/domain/subscriptions");
const {
  runBilling,
  invoice,
  invoiceAction,
  recordPayment,
  reversePayment,
  priced,
  insertInvoice,
} = await import("../src/domain/invoices");
const { scan } = await import("../src/domain/integrity");
const { simulate } = await import("../src/domain/simulation");
const { dashboard, list } = await import("../src/domain/reporting");
let GET: typeof import("../src/app/api/v1/[...path]/route").GET;
let POST: typeof import("../src/app/api/v1/[...path]/route").POST;
const { today, addDays } = await import("../src/domain/dates");
const { invoicePdf } = await import("../src/domain/pdf");
let admin: Actor,
  staff: Actor,
  customer: Actor,
  other: Actor,
  customerId: string,
  otherId: string,
  product: string,
  variant: string,
  plan: string;
const password = "BrightloopTests!A";
async function user(role: Actor["role"]) {
  const email = `${randomUUID()}@example.invalid`;
  const u = (
    await auth.api.signUpEmail({ body: { email, name: role, password } })
  ).user;
  await pool.query('UPDATE "user" SET role=$2 WHERE id=$1', [u.id, role]);
  return { id: u.id, email, name: role, role };
}
async function active(
  on = today(),
  customer_id = customerId,
  expiry_on: string | null = null,
) {
  const draft = await createSubscription(admin, {
    customer_id,
    plan_id: plan,
    start_on: on,
    expiry_on,
    payment_days: 7,
    lines: [
      { kind: "BASE", productId: product, variantId: variant, quantity: 1 },
    ],
  });
  let s = await subscription(admin, draft!.id);
  for (const action of ["issue", "confirm", "activate"]) {
    s = await transition(admin, s.id, {
      action,
      version: s.version,
      reason: "Test lifecycle",
    });
  }
  return s;
}
async function route(
  actor: Actor,
  path: string,
  body?: unknown,
  origin = "http://localhost:3000",
) {
  const login = await auth.api.signInEmail({
    body: { email: actor.email, password },
    asResponse: true,
  });
  const cookie = login.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  const req = new Request(`http://localhost:3000/api/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie,
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (body === undefined ? GET : POST)(req, {
    params: Promise.resolve({ path: path.split("/") }),
  });
}
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/brightloop_test")
    throw new Error("Refusing to reset a non-test database.");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  const { migrate } = await import("../scripts/migrate");
  await migrate();
  ({ auth } = await import("../src/lib/auth"));
  ({ GET, POST } = await import("../src/app/api/v1/[...path]/route"));
  admin = await user("ADMIN");
  staff = await user("STAFF");
  customer = await user("CUSTOMER");
  other = await user("CUSTOMER");
  customerId = (await one<{ id: string }>(
    "SELECT id FROM customers WHERE user_id=$1",
    [customer.id],
  ))!.id;
  otherId = (await one<{ id: string }>(
    "SELECT id FROM customers WHERE user_id=$1",
    [other.id],
  ))!.id;
  product = String(
    (await saveCatalog(admin, "products", {
      name: "Software",
      sku: "TEST",
      type: "Software",
      sales_amount: "5000",
      cost_amount: "400",
    }))!.id,
  );
  variant = String(
    (await saveCatalog(admin, "variants", {
      product_id: product,
      name: "Odoo",
      delta: "560",
    }))!.id,
  );
  await saveCatalog(admin, "taxes", {
    name: "Test 18%",
    rate_bps: 1800,
    valid_from: "2020-01-01",
    valid_until: null,
  });
  plan = String(
    (await saveCatalog(admin, "plans", {
      name: "Test monthly",
      code: "TEST-M",
      product_id: product,
      amount: "1000",
      frequency: "MONTHLY",
      min_quantity: 1,
      available_from: "2020-01-01",
      available_until: null,
      allow_pause: true,
      allow_close: true,
      allow_renew: true,
      auto_close: true,
    }))!.id,
  );
}, 30000);
afterAll(async () => {
  await pool.end();
});
describe("PostgreSQL billing integration", () => {
  it("enforces the PDF password policy", () => {
    for (const p of ["Abcdefg!", "abcdefghi!", "ABCDEFGHI!", "Abcdefghi1"])
      expect(passwordValid(p)).toBe(false);
    expect(passwordValid("Abcdefgh!")).toBe(true);
  });
  it("rejects duplicate normalized emails and role injection on signup", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: customer.email.toUpperCase(),
          name: "Duplicate",
          password,
        },
      }),
    ).rejects.toThrow();
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          name: "Injected",
          email: `${randomUUID()}@example.invalid`,
          password,
          role: "ADMIN",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).user.role).toBe("CUSTOMER");
  });
  it("creates exactly one bill with concurrent workers and safe retry", async () => {
    const s = await active();
    await Promise.all([runBilling(admin), runBilling(admin)]);
    await runBilling(admin);
    const bills = await rows(
      "SELECT * FROM invoices WHERE subscription_id=$1",
      [s.id],
    );
    expect(bills).toHaveLength(1);
    expect(bills[0].total).toBe(184080);
    expect((await subscription(admin, s.id)).next_billing_on > s.start_on).toBe(
      true,
    );
  });
  it("catches up all missed monthly cycles", async () => {
    const start = addDays(today(), -95);
    const s = await active(start);
    await runBilling(admin);
    const bills = await rows<{ period_start: string; period_end: string }>(
      "SELECT * FROM invoices WHERE subscription_id=$1 ORDER BY period_start",
      [s.id],
    );
    expect(bills.length).toBeGreaterThanOrEqual(3);
    expect(bills[0].period_start).toBe(start);
    for (let n = 1; n < bills.length; n++)
      expect(bills[n].period_start).toBe(bills[n - 1].period_end);
  });
  it("rolls back an invoice and cursor together on a failed transaction", async () => {
    const s = await active();
    await expect(
      transaction(async (db) => {
        await insertInvoice(
          db,
          s,
          await priced(s, today(), db),
          today(),
          addDays(today(), 30),
        );
        await db.query(
          "UPDATE subscriptions SET next_billing_on=$2 WHERE id=$1",
          [s.id, addDays(today(), 30)],
        );
        throw new Error("simulated crash");
      }),
    ).rejects.toThrow("simulated crash");
    expect(
      await rows("SELECT id FROM invoices WHERE subscription_id=$1", [s.id]),
    ).toHaveLength(0);
    expect((await subscription(admin, s.id)).next_billing_on).toBe(today());
  });
  it("does not bill paused subscriptions; resume retains already billed coverage", async () => {
    let s = await active();
    await runBilling(admin);
    const before = await rows(
      "SELECT id FROM invoices WHERE subscription_id=$1",
      [s.id],
    );
    s = await subscription(admin, s.id);
    s = await transition(customer, s.id, {
      action: "pause",
      version: s.version,
      reason: "Pause test",
    });
    await runBilling(admin);
    expect(
      await rows("SELECT id FROM invoices WHERE subscription_id=$1", [s.id]),
    ).toHaveLength(before.length);
    s = await transition(customer, s.id, {
      action: "resume",
      version: s.version,
      reason: "Resume test",
    });
    expect(s.status).toBe("ACTIVE");
    expect(s.next_billing_on > today()).toBe(true);
  });
  it("blocks unsupported partial final periods", async () => {
    const s = await active();
    await pool.query("UPDATE subscriptions SET expiry_on=$2 WHERE id=$1", [
      s.id,
      addDays(today(), 10),
    ]);
    const result = await runBilling(admin);
    expect(result.errors.some((e) => e.subscriptionId === s.id)).toBe(true);
    expect(
      await rows("SELECT id FROM invoices WHERE subscription_id=$1", [s.id]),
    ).toHaveLength(0);
  });
  it("guards lifecycle order and stale versions", async () => {
    let s = await active();
    await expect(
      transition(admin, s.id, {
        action: "activate",
        version: s.version,
        reason: "Invalid activation",
      }),
    ).rejects.toThrow();
    await expect(
      transition(admin, s.id, {
        action: "close",
        version: s.version - 1,
        reason: "Stale update",
      }),
    ).rejects.toThrow("changed");
    await runBilling(admin);
    s = await subscription(admin, s.id);
    s = await transition(admin, s.id, {
      action: "close",
      version: s.version,
      reason: "Close test",
    });
    await expect(
      transition(admin, s.id, {
        action: "renew",
        version: s.version,
        reason: "Renew closed",
        expiry_on: addDays(today(), 365),
      }),
    ).rejects.toThrow();
  });
  it("blocks expired quotations", async () => {
    const draft = await createSubscription(admin, {
      customer_id: customerId,
      plan_id: plan,
      start_on: today(),
      expiry_on: null,
      payment_days: 7,
      lines: [{ kind: "BASE", productId: product, quantity: 1 }],
    });
    let s = await subscription(admin, draft!.id);
    s = await transition(admin, s.id, {
      action: "issue",
      version: s.version,
      reason: "Issue",
    });
    await pool.query(
      "UPDATE subscriptions SET quote_valid_until=$2 WHERE id=$1",
      [s.id, addDays(today(), -1)],
    );
    await expect(
      transition(admin, s.id, {
        action: "confirm",
        version: s.version,
        reason: "Expired",
      }),
    ).rejects.toThrow("expired");
  });
  it("serializes the last discount redemption and blocks the losing draft", async () => {
    const d = await saveCatalog(admin, "discounts", {
      name: "One use",
      code: "ONE",
      kind: "PERCENT",
      value: "10",
      min_amount: "0",
      min_quantity: 1,
      valid_from: "2020-01-01",
      valid_until: null,
      max_uses: 1,
    });
    const a = await active(),
      b = await active();
    await runBilling(admin);
    const ia = (
      await rows<{ id: string }>(
        "SELECT id FROM invoices WHERE subscription_id=$1",
        [a.id],
      )
    )[0];
    const ib = (
      await rows<{ id: string }>(
        "SELECT id FROM invoices WHERE subscription_id=$1",
        [b.id],
      )
    )[0];
    const results = await Promise.allSettled([
      invoiceAction(admin, ia.id, "confirm", "Approve"),
      invoiceAction(admin, ib.id, "confirm", "Approve"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await one<{ uses_consumed: number }>(
        "SELECT uses_consumed FROM discounts WHERE id=$1",
        [d!.id],
      ))!.uses_consumed,
    ).toBe(1);
    await pool.query("UPDATE discounts SET active=false WHERE id=$1", [d!.id]);
  });
  it("records partial/full receipts, rejects overpayment and reverses safely", async () => {
    const s = await active();
    await runBilling(admin);
    const i = (
      await rows<{ id: string; total: number }>(
        "SELECT * FROM invoices WHERE subscription_id=$1",
        [s.id],
      )
    )[0];
    await invoiceAction(admin, i.id, "confirm", "Reviewed");
    const p = await recordPayment(staff, {
      invoice_id: i.id,
      amount: "100",
      method: "UPI",
      paid_on: today(),
      note: "Partial receipt",
      reference: randomUUID(),
    });
    expect((await invoice(admin, i.id)).paid).toBe(10000);
    await expect(
      recordPayment(staff, {
        invoice_id: i.id,
        amount: "999999",
        method: "UPI",
        paid_on: today(),
        note: "Overpay",
      }),
    ).rejects.toThrow("exceeds");
    await recordPayment(staff, {
      invoice_id: i.id,
      amount: ((i.total - 10000) / 100).toFixed(2),
      method: "BANK",
      paid_on: today(),
      note: "Balance receipt",
    });
    expect((await invoice(admin, i.id)).status).toBe("PAID");
    await expect(invoiceAction(admin, i.id, "cancel", "No")).rejects.toThrow();
    await reversePayment(admin, p!.id, "Correction");
    expect((await invoice(admin, i.id)).status).toBe("CONFIRMED");
    expect((await invoice(admin, i.id)).paid).toBe(i.total - 10000);
  });
  it("keeps issued snapshots immutable after catalog edits", async () => {
    const s = await active();
    await runBilling(admin);
    const i = (
      await rows<{ id: string }>(
        "SELECT id FROM invoices WHERE subscription_id=$1",
        [s.id],
      )
    )[0];
    await invoiceAction(admin, i.id, "confirm", "Reviewed");
    const before = await invoice(admin, i.id);
    await pool.query("UPDATE products SET sales_amount=999999 WHERE id=$1", [
      product,
    ]);
    expect((await invoice(admin, i.id)).total).toBe(before.total);
    await expect(
      pool.query("UPDATE invoices SET total=1 WHERE id=$1", [i.id]),
    ).rejects.toThrow("immutable");
    expect((await invoicePdf(before)).subarray(0, 4).toString()).toBe("%PDF");
  });
  it("detects draft corruption and blocks confirmation outside the UI", async () => {
    const s = await active();
    await runBilling(admin);
    const i = (
      await rows<{ id: string }>(
        "SELECT id FROM invoices WHERE subscription_id=$1",
        [s.id],
      )
    )[0];
    await pool.query("UPDATE invoices SET total=total+123 WHERE id=$1", [i.id]);
    await expect(
      invoiceAction(admin, i.id, "confirm", "Unsafe"),
    ).rejects.toThrow("reconcile");
    await scan(staff);
    expect(
      (
        await rows(
          "SELECT code FROM findings WHERE entity_id=$1 AND status='OPEN'",
          [i.id],
        )
      ).some((f) => f.code === "BI-005_TOTAL_MISMATCH"),
    ).toBe(true);
    await invoiceAction(staff, i.id, "recalculate", "Repair");
    await invoiceAction(staff, i.id, "confirm", "Reviewed repair");
  });
  it("runs deterministic simulations without mutating any billing ledger", async () => {
    const snapshot = async () =>
      one(
        "SELECT (SELECT count(*) FROM invoices)::int invoices,(SELECT count(*) FROM payments)::int payments,(SELECT sum(uses_consumed) FROM discounts)::bigint uses,(SELECT md5(string_agg(id::text||next_billing_on::text,',' ORDER BY id)) FROM subscriptions) cursor",
      );
    const before = await snapshot();
    const a = await simulate(staff, 3);
    const b = await simulate(staff, 3);
    expect(a).toEqual(b);
    expect(await snapshot()).toEqual(before);
  });
  it("reconciles SQL dashboard totals with the payment ledger", async () => {
    const d = await dashboard(admin);
    const p = await one<{ total: number }>(
      "SELECT COALESCE(sum(amount),0)::bigint total FROM payments WHERE reversed_at IS NULL",
    );
    expect(d.collected).toBe(p!.total);
  });
  it("enforces ownership in detail, lists, invoice PDFs and API routes", async () => {
    const s = await active(today(), otherId);
    await runBilling(admin);
    const i = (
      await rows<{ id: string }>(
        "SELECT id FROM invoices WHERE subscription_id=$1",
        [s.id],
      )
    )[0];
    await invoiceAction(admin, i.id, "confirm", "Reviewed");
    await expect(invoice(customer, i.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(subscription(customer, s.id)).rejects.toMatchObject({
      status: 404,
    });
    const own = await list(customer, "invoices");
    expect(
      own.items.every(
        (r) => r.customer_id === customerId && r.status !== "DRAFT",
      ),
    ).toBe(true);
    expect((await route(customer, `invoices/${i.id}/pdf`)).status).toBe(404);
    expect((await route(customer, "scan", {})).status).toBe(403);
    expect(
      (
        await route(staff, "staff", {
          name: "Intruder",
          email: "no@example.invalid",
          password,
        })
      ).status,
    ).toBe(403);
    expect((await route(customer, "discounts", {})).status).toBe(403);
  });
  it("rejects client-controlled invoice totals and CSRF requests", async () => {
    expect(
      (await route(admin, "scan", {}, "https://evil.example")).status,
    ).toBe(403);
    expect(
      (
        await route(staff, "payments", {
          invoice_id: randomUUID(),
          amount: "10",
          method: "BANK",
          paid_on: today(),
          note: "Test",
          grandTotal: 1,
        })
      ).status,
    ).toBe(422);
    const req = new Request("http://localhost:3000/api/v1/scan", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(
      (await POST(req, { params: Promise.resolve({ path: ["scan"] }) })).status,
    ).toBe(401);
  });
  it("delivers a one-time reset to the local outbox and rejects reuse", async () => {
    const resetUser = await user("CUSTOMER");
    await auth.api.requestPasswordReset({
      body: { email: resetUser.email, redirectTo: "/reset-password" },
    });
    const mail = await one<{ body: string }>(
      "SELECT body FROM outbox WHERE user_id=$1 AND kind='RESET' ORDER BY created_at DESC LIMIT 1",
      [resetUser.id],
    );
    expect(mail).toBeDefined();
    const url = mail!.body.match(/https?:\/\/\S+/)![0];
    const token = new URL(url).pathname.split("/").pop()!;
    await auth.api.resetPassword({
      body: { token, newPassword: "DifferentPassword!A" },
    });
    await expect(
      auth.api.resetPassword({
        body: { token, newPassword: "AnotherPassword!A" },
      }),
    ).rejects.toThrow();
  });
  it("applies approved add-on changes only to future unbilled cycles", async () => {
    let s = await active();
    await runBilling(admin);
    s = await subscription(admin, s.id);
    const previous = (
      await rows<{ id: string }>(
        "SELECT id FROM invoices WHERE subscription_id=$1",
        [s.id],
      )
    )[0];
    const before = await invoice(admin, previous.id);
    const addon = await saveCatalog(admin, "products", {
      name: "Support",
      sku: "ADDON",
      type: "Service",
      sales_amount: "499",
      cost_amount: "100",
    });
    await amendAddons(staff, s.id, {
      version: s.version,
      reason: "Customer approved support for the next cycle",
      lines: [{ kind: "ADDON", productId: addon!.id, quantity: 2 }],
    });
    expect((await priced(s, before.period_start)).subtotal).toBe(156000);
    expect((await priced(s, s.next_billing_on)).subtotal).toBe(255800);
    expect((await invoice(admin, previous.id)).lines).toEqual(before.lines);
    expect(
      await rows(
        "SELECT * FROM subscription_amendments WHERE subscription_id=$1",
        [s.id],
      ),
    ).toHaveLength(1);
    await expect(
      amendAddons(customer, s.id, {
        version: s.version,
        reason: "Unauthorized",
        lines: [],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("requires pending cycles to be billed before pause or closure", async () => {
    const s = await active();
    await expect(
      transition(customer, s.id, {
        action: "pause",
        version: s.version,
        reason: "Pause today",
      }),
    ).rejects.toThrow("due invoices");
    await expect(
      transition(customer, s.id, {
        action: "close",
        version: s.version,
        reason: "Close today",
      }),
    ).rejects.toThrow("due invoices");
  });
  it("enforces plan lifecycle policies for staff and customers", async () => {
    let s = await active();
    await runBilling(admin);
    s = await subscription(admin, s.id);
    await pool.query(
      "UPDATE plans SET allow_pause=false,allow_close=false,allow_renew=false WHERE id=$1",
      [plan],
    );
    for (const actor of [staff, customer])
      for (const action of ["pause", "close", "renew"])
        await expect(
          transition(actor, s.id, {
            action,
            version: s.version,
            reason: "Not permitted",
            expiry_on: addDays(today(), 365),
          }),
        ).rejects.toThrow();
    await pool.query(
      "UPDATE plans SET allow_pause=true,allow_close=true,allow_renew=true WHERE id=$1",
      [plan],
    );
  });
  it("automatically closes an expired paused agreement without new charges", async () => {
    const { cycleEnd } = await import("../src/domain/dates");
    const on = today();
    const end = cycleEnd(on, "MONTHLY", Number(on.slice(8)));
    const expiry = addDays(end, -1);
    let s = await active(on, customerId, expiry);
    await runBilling(admin);
    s = await subscription(admin, s.id);
    s = await transition(customer, s.id, {
      action: "pause",
      version: s.version,
      reason: "Pause before expiry",
    });
    const count = await rows(
      "SELECT id FROM invoices WHERE subscription_id=$1",
      [s.id],
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(`${end}T12:00:00Z`));
      await runBilling(admin);
      expect((await subscription(admin, s.id)).status).toBe("CLOSED");
      expect(
        await rows("SELECT id FROM invoices WHERE subscription_id=$1", [s.id]),
      ).toHaveLength(count.length);
    } finally {
      vi.useRealTimers();
    }
  });
  it("creates the customer profile atomically with identity and blocks an email-claim race", async () => {
    const email = `${randomUUID()}@example.invalid`;
    await pool.query(
      "INSERT INTO customers(company,contact,email) VALUES('Managed','Contact',$1)",
      [email],
    );
    const id = randomUUID();
    await expect(
      pool.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",role) VALUES($1,$2,$3,false,now(),now(),\'CUSTOMER\')',
        [id, "Race fixture", email],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await rows('SELECT id FROM "user" WHERE id=$1', [id])).toHaveLength(
      0,
    );
    const u = await user("CUSTOMER");
    expect(
      await rows("SELECT id FROM customers WHERE user_id=$1", [u.id]),
    ).toHaveLength(1);
  });
  it("does not shorten an open-ended contract through renewal", async () => {
    const s = await active();
    await expect(
      transition(customer, s.id, {
        action: "renew",
        version: s.version,
        reason: "Renew test",
        expiry_on: addDays(today(), 10),
      }),
    ).rejects.toThrow("open-ended");
  });
  it("rejects an expired password reset token", async () => {
    const u = await user("CUSTOMER");
    await auth.api.requestPasswordReset({
      body: { email: u.email, redirectTo: "/reset-password" },
    });
    const mail = await one<{ body: string }>(
      "SELECT body FROM outbox WHERE user_id=$1 AND kind='RESET' ORDER BY created_at DESC LIMIT 1",
      [u.id],
    );
    const token = new URL(mail!.body.match(/https?:\/\/\S+/)![0]).pathname
      .split("/")
      .pop()!;
    await pool.query(
      "UPDATE verification SET \"expiresAt\"=now()-interval '1 minute'",
    );
    await expect(
      auth.api.resetPassword({
        body: { token, newPassword: "SomeOtherPassword!A" },
      }),
    ).rejects.toThrow();
  });
});
