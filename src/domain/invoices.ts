import { one, rows, transaction, type Db, pool } from "@/lib/db";
import type {
  Actor,
  Calculation,
  Discount,
  Invoice,
  Line,
  Subscription,
} from "@/lib/types";
import { assert, AppError } from "@/lib/errors";
import { paymentSchema } from "@/lib/validation";
import { staff, admin, audit, customerScope } from "./access";
import { calculate } from "./money";
import { addDays, cycleEnd, today } from "./dates";
import { subscription } from "./subscriptions";
import { agreementLines } from "./agreements";
export const invoiceSelect = `SELECT i.*,c.company,s.number AS subscription_number,p.name AS plan_name FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id JOIN plans p ON p.id=s.plan_id`;
export async function invoice(
  actor: Actor,
  id: string,
  db: Db = pool,
  lock = false,
): Promise<Invoice> {
  const scope = await customerScope(actor, db);
  const result = await one<Invoice>(
    `${invoiceSelect} WHERE i.id=$1 AND ($2::uuid IS NULL OR (i.customer_id=$2 AND i.status IN ('CONFIRMED','PAID'))) ${lock ? "FOR UPDATE OF i" : ""}`,
    [id, scope],
    db,
  );
  if (!result) throw new AppError(404, "NOT_FOUND", "Invoice not found.");
  return result;
}
export async function priced(
  s: Subscription,
  on: string,
  db: Db = pool,
  discounts?: Discount[],
): Promise<Calculation> {
  const taxes = await rows<{ rate_bps: number; product_ids: string[] }>(
    "SELECT * FROM taxes WHERE active AND valid_from<=$1 AND (valid_until IS NULL OR valid_until>=$1)",
    [on],
    db,
  );
  const lines = (await agreementLines(s, on, db)).map((l) => {
    const matches = taxes.filter(
      (t) => !t.product_ids.length || t.product_ids.includes(l.productId),
    );
    assert(
      matches.length === 1,
      `Tax configuration for ${l.name} needs exactly one effective rule.`,
      "BI-007_INVALID_TAX_CONFIGURATION",
    );
    return { ...l, taxBps: matches[0].rate_bps };
  });
  return calculate(
    lines,
    discounts ??
      (await rows<Discount>("SELECT * FROM discounts ORDER BY id", [], db)),
    on,
  );
}
export function sameAgreement(a: Line[], b: Line[]) {
  const commercial = (lines: Line[]) =>
    lines.map((l) => [
      l.productId,
      l.variantId ?? null,
      l.kind,
      l.quantity,
      l.unitAmount,
    ]);
  return JSON.stringify(commercial(a)) === JSON.stringify(commercial(b));
}
export async function insertInvoice(
  db: Db,
  s: Subscription,
  calc: Calculation,
  start: string,
  end: string,
) {
  const customer = await one<{
    company: string;
    email: string;
    address: string;
  }>(
    "SELECT company,email,address FROM customers WHERE id=$1",
    [s.customer_id],
    db,
  );
  return one<Invoice>(
    "INSERT INTO invoices(subscription_id,customer_id,period_start,period_end,billing_date,due_on,subtotal,discount,tax,total,lines,discount_id,discount_code,customer_snapshot) VALUES($1,$2,$3,$4,$3,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(subscription_id,period_start) DO NOTHING RETURNING *",
    [
      s.id,
      s.customer_id,
      start,
      end,
      addDays(start, s.payment_days),
      calc.subtotal,
      calc.discount,
      calc.tax,
      calc.total,
      JSON.stringify(calc.lines),
      calc.discountId,
      calc.discountCode,
      JSON.stringify(customer),
    ],
    db,
  );
}
export async function runBilling(
  actor: Actor | null,
  asOf = today(),
  limit = 250,
) {
  if (actor) admin(actor);
  assert(asOf <= today(), "Future billing is only available in Time Machine.");
  const run = await one<{ id: string }>(
    "INSERT INTO billing_runs(actor_id,as_of) VALUES($1,$2) RETURNING id",
    [actor?.id ?? null, asOf],
  );
  await transaction(async (db) => {
    const expired = await rows<{ id: string }>(
      "UPDATE subscriptions s SET status='CLOSED',version=s.version+1 FROM plans p WHERE p.id=s.plan_id AND p.auto_close AND s.expiry_on<$1 AND (s.status='PAUSED' OR (s.status='ACTIVE' AND s.next_billing_on>s.expiry_on)) RETURNING s.id",
      [asOf],
      db,
    );
    for (const s of expired)
      await audit(db, actor, "subscription.expired", s.id, { asOf });
  });
  const due = await rows<{ id: string }>(
    "SELECT id FROM subscriptions WHERE status='ACTIVE' AND next_billing_on<=$1 ORDER BY next_billing_on,id LIMIT $2",
    [asOf, limit],
  );
  let created = 0,
    skipped = 0;
  const errors: { subscriptionId: string; message: string }[] = [];
  const system = actor ?? {
    id: "",
    name: "Local scheduler",
    email: "",
    role: "ADMIN" as const,
  };
  for (const item of due) {
    try {
      const result = await transaction(async (db) => {
        const s = await subscription(system, item.id, db, true);
        let n = 0,
          duplicates = 0;
        if (s.status !== "ACTIVE") return { n, duplicates };
        while (s.next_billing_on <= asOf && n + duplicates < 120) {
          const start = s.next_billing_on;
          if (s.expiry_on && start > s.expiry_on) {
            if (s.auto_close) {
              await db.query(
                "UPDATE subscriptions SET status='CLOSED',version=version+1 WHERE id=$1",
                [s.id],
              );
              await audit(db, actor, "subscription.expired", s.id);
            }
            break;
          }
          const end = cycleEnd(
            start,
            s.frequency,
            s.anchor_day,
            s.anchor_month,
          );
          assert(
            !s.expiry_on || end <= addDays(s.expiry_on, 1),
            "Partial final period needs review. Align the term before billing.",
            "BI-009_PARTIAL_PERIOD_REVIEW",
          );
          const calc = await priced(s, start, db);
          const inserted = await insertInvoice(db, s, calc, start, end);
          if (inserted) {
            n++;
            await audit(db, actor, "invoice.generated", inserted.id, {
              period: start,
              runId: run!.id,
            });
          } else {
            duplicates++;
            await audit(db, actor, "billing.duplicate_prevented", s.id, {
              period: start,
              runId: run!.id,
            });
          }
          s.next_billing_on = end;
          await db.query(
            "UPDATE subscriptions SET next_billing_on=$2,version=version+1 WHERE id=$1",
            [s.id, end],
          );
        }
        return { n, duplicates };
      });
      created += result.n;
      skipped += result.duplicates;
    } catch (error) {
      errors.push({
        subscriptionId: item.id,
        message: error instanceof Error ? error.message : "Billing failed",
      });
    }
  }
  await pool.query(
    "UPDATE billing_runs SET created=$2,skipped=$3,errors=$4,status=$5,finished_at=now() WHERE id=$1",
    [
      run!.id,
      created,
      skipped,
      JSON.stringify(errors),
      errors.length ? "REVIEW" : "COMPLETED",
    ],
  );
  return { id: run!.id, created, skipped, errors, batchLimit: limit };
}
export interface Issue {
  code: string;
  title: string;
  expected?: unknown;
  observed?: unknown;
}
export async function invoiceIssues(
  i: Invoice,
  s: Subscription,
  db: Db = pool,
  discounts?: Discount[],
): Promise<Issue[]> {
  const issues: Issue[] = [];
  if (
    i.total !== i.subtotal - i.discount + i.tax ||
    i.lines.reduce((a, l) => a + l.total, 0) !== i.total ||
    i.lines.reduce((a, l) => a + l.gross, 0) !== i.subtotal ||
    i.lines.reduce((a, l) => a + l.discount, 0) !== i.discount ||
    i.lines.reduce((a, l) => a + l.tax, 0) !== i.tax
  )
    issues.push({
      code: "BI-005_TOTAL_MISMATCH",
      title: "Invoice arithmetic does not reconcile",
      expected: i.subtotal - i.discount + i.tax,
      observed: i.total,
    });
  const agreed = await agreementLines(s, i.period_start, db);
  if (s.accepted && !sameAgreement(i.lines, agreed))
    issues.push({
      code: "BI-006_QUOTE_MISMATCH",
      title: "Draft differs from the accepted quotation",
      expected: agreed,
      observed: i.lines,
    });
  if (
    i.period_start < s.start_on ||
    (s.expiry_on && i.period_start > s.expiry_on)
  )
    issues.push({
      code: "BI-003_NONBILLABLE_SUBSCRIPTION",
      title: "Billing period is outside the agreement",
    });
  if (s.expiry_on && i.period_end > addDays(s.expiry_on, 1))
    issues.push({
      code: "BI-009_PARTIAL_PERIOD_REVIEW",
      title: "Billing period extends beyond the agreed expiry",
    });
  // A valid draft for a period before a later pause/closure remains reviewable and payable.
  try {
    const expected = await priced(s, i.period_start, db, discounts);
    if (
      i.lines.some((line, n) =>
        ["gross", "discount", "tax", "total"].some(
          (key) => line[key as "gross"] !== expected.lines[n]?.[key as "gross"],
        ),
      ) &&
      !issues.some((issue) => issue.code === "BI-005_TOTAL_MISMATCH")
    ) {
      issues.push({
        code: "BI-005_TOTAL_MISMATCH",
        title: "Stored line arithmetic differs from the billing calculation",
        expected: expected.lines,
        observed: i.lines,
      });
    }
    if (
      i.discount_id !== expected.discountId ||
      i.discount !== expected.discount
    )
      issues.push({
        code: "BI-004_INVALID_DISCOUNT",
        title:
          "Discount changed or reached its usage cap; recalculate the draft",
        expected: expected.discount,
        observed: i.discount,
      });
    if (
      i.tax !== expected.tax ||
      i.lines.some((l, n) => l.taxBps !== expected.lines[n]?.taxBps)
    )
      issues.push({
        code: "BI-007_INVALID_TAX_CONFIGURATION",
        title: "Tax calculation differs from the effective rule",
        expected: expected.tax,
        observed: i.tax,
      });
    if (
      i.total !== expected.total &&
      !issues.some((x) => x.code === "BI-005_TOTAL_MISMATCH")
    )
      issues.push({
        code: "BI-005_TOTAL_MISMATCH",
        title: "Total differs from the agreed pricing calculation",
        expected: expected.total,
        observed: i.total,
      });
  } catch (error) {
    issues.push({
      code: "BI-007_INVALID_TAX_CONFIGURATION",
      title: error instanceof Error ? error.message : "Invalid tax rules",
    });
  }
  return issues;
}
export async function invoiceAction(
  actor: Actor,
  id: string,
  action: string,
  reason: string,
) {
  staff(actor);
  return transaction(async (db) => {
    const i = await invoice(actor, id, db, true);
    if (action === "confirm" || action === "recalculate") {
      assert(
        i.status === "DRAFT",
        "Only draft invoices can be confirmed or recalculated.",
      );
      const s = await subscription(actor, i.subscription_id, db);
      // Consistent lock order serializes the last discount use across different invoices.
      const discounts = await rows<Discount>(
        "SELECT * FROM discounts ORDER BY id FOR UPDATE",
        [],
        db,
      );
      if (action === "recalculate") {
        const calc = await priced(s, i.period_start, db, discounts);
        await db.query(
          "UPDATE invoices SET subtotal=$2,discount=$3,tax=$4,total=$5,lines=$6,discount_id=$7,discount_code=$8 WHERE id=$1",
          [
            id,
            calc.subtotal,
            calc.discount,
            calc.tax,
            calc.total,
            JSON.stringify(calc.lines),
            calc.discountId,
            calc.discountCode,
          ],
        );
      } else {
        const issues = await invoiceIssues(i, s, db, discounts);
        assert(
          !issues.length,
          issues.map((x) => x.title).join("; "),
          "BILLGUARD_BLOCKED",
        );
        if (i.discount_id) {
          const consumed = await db.query(
            "UPDATE discounts SET uses_consumed=uses_consumed+1 WHERE id=$1 AND (max_uses IS NULL OR uses_consumed<max_uses) RETURNING id",
            [i.discount_id],
          );
          assert(
            consumed.rowCount,
            "Discount usage cap reached. Recalculate this draft.",
            "DISCOUNT_CAP_REACHED",
          );
        }
        await db.query(
          "UPDATE invoices SET status=CASE WHEN total=0 THEN 'PAID' ELSE 'CONFIRMED' END,issued_at=now() WHERE id=$1",
          [id],
        );
      }
    } else if (action === "cancel") {
      assert(
        ["DRAFT", "CONFIRMED"].includes(i.status) && i.paid === 0,
        "Only an unpaid invoice can be cancelled. Reverse payments first.",
      );
      assert(reason.trim().length >= 3, "Provide a cancellation reason.");
      await db.query("UPDATE invoices SET status='CANCELLED' WHERE id=$1", [
        id,
      ]);
    } else if (action === "send") {
      assert(
        ["CONFIRMED", "PAID"].includes(i.status),
        "Confirm the invoice before sending.",
      );
      await db.query(
        "INSERT INTO outbox(recipient,subject,body,kind,invoice_id) VALUES($1,$2,$3,'INVOICE',$4) ON CONFLICT(invoice_id,kind) DO NOTHING",
        [
          i.customer_snapshot.email,
          `Brightloop invoice ${i.number}`,
          `Your invoice ${i.number} for ${i.period_start} to ${i.period_end} is ready. Total INR ${(i.total / 100).toFixed(2)}. View it in your Brightloop portal. This is a local outbox message; no external email was sent.`,
          id,
        ],
      );
    } else throw new AppError(400, "INVALID_ACTION", "Unknown invoice action.");
    const updated = await invoice(actor, id, db);
    await audit(db, actor, `invoice.${action}`, id, {
      reason,
      before: {
        status: i.status,
        total: i.total,
        discount: i.discount,
        tax: i.tax,
      },
      after: {
        status: updated.status,
        total: updated.total,
        discount: updated.discount,
        tax: updated.tax,
      },
    });
    return updated;
  });
}
export async function recordPayment(actor: Actor, input: unknown) {
  staff(actor);
  const p = paymentSchema.parse(input);
  assert(p.amount > 0, "Payment must be greater than zero.");
  assert(p.paid_on <= today(), "A received payment cannot have a future date.");
  return transaction(async (db) => {
    const i = await invoice(actor, p.invoice_id, db, true);
    assert(
      i.status === "CONFIRMED",
      "Payments can only be recorded against an outstanding confirmed invoice.",
    );
    assert(
      p.amount <= i.total - i.paid,
      "Payment exceeds the remaining balance.",
      "OVERPAYMENT",
    );
    const payment = await one<{ id: string }>(
      "INSERT INTO payments(invoice_id,amount,method,paid_on,note,reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [i.id, p.amount, p.method, p.paid_on, p.note, p.reference, actor.id],
      db,
    );
    await db.query(
      "UPDATE invoices SET paid=paid+$2,status=CASE WHEN paid+$2=total THEN 'PAID' ELSE 'CONFIRMED' END WHERE id=$1",
      [i.id, p.amount],
    );
    await audit(db, actor, "payment.recorded", i.id, {
      paymentId: payment!.id,
      amount: p.amount,
      method: p.method,
    });
    return payment;
  });
}
export async function reversePayment(actor: Actor, id: string, reason: string) {
  admin(actor);
  assert(reason.trim().length >= 3, "Provide a reversal reason.");
  return transaction(async (db) => {
    const pointer = await one<{ invoice_id: string }>(
      "SELECT invoice_id FROM payments WHERE id=$1",
      [id],
      db,
    );
    assert(pointer, "Payment not found.");
    const i = await invoice(actor, pointer.invoice_id, db, true);
    const p = await one<{ amount: number; reversed_at: string | null }>(
      "SELECT * FROM payments WHERE id=$1 FOR UPDATE",
      [id],
      db,
    );
    assert(p && !p.reversed_at, "This payment has already been reversed.");
    await db.query(
      "UPDATE payments SET reversed_at=now(),reversal_reason=$2 WHERE id=$1",
      [id, reason],
    );
    await db.query(
      "UPDATE invoices SET paid=paid-$2,status='CONFIRMED' WHERE id=$1",
      [i.id, p.amount],
    );
    await audit(db, actor, "payment.reversed", i.id, { paymentId: id, reason });
    return { id };
  });
}
