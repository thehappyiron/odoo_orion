import { one, rows, transaction, type Db, pool } from "@/lib/db";
import { assert, AppError } from "@/lib/errors";
import type { Actor, Subscription } from "@/lib/types";
import { subscriptionSchema, transitionSchema } from "@/lib/validation";
import { buildLines } from "./catalog";
import { addDays, today } from "./dates";
import { audit, customerScope, staff } from "./access";
import { agreementLines } from "./agreements";
import { z } from "zod";
import { lineInput } from "@/lib/validation";
export const subscriptionSelect = `SELECT s.*,c.company,c.email AS customer_email,p.name AS plan_name,p.frequency,p.min_quantity,p.allow_pause,p.allow_close,p.allow_renew,p.auto_close,p.available_from,p.available_until FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN plans p ON p.id=s.plan_id`;
export async function subscription(
  actor: Actor,
  id: string,
  db: Db = pool,
  lock = false,
): Promise<Subscription> {
  const scope = await customerScope(actor, db);
  const result = await one<Subscription>(
    `${subscriptionSelect} WHERE s.id=$1 AND ($2::uuid IS NULL OR s.customer_id=$2) ${lock ? "FOR UPDATE OF s" : ""}`,
    [id, scope],
    db,
  );
  if (!result) throw new AppError(404, "NOT_FOUND", "Subscription not found.");
  return result;
}
export async function createSubscription(actor: Actor, input: unknown) {
  staff(actor);
  const p = subscriptionSchema.parse(input);
  assert(
    !p.expiry_on || p.expiry_on >= p.start_on,
    "Expiry must be on or after the start date.",
  );
  return transaction(async (db) => {
    const customer = await one(
      "SELECT id FROM customers WHERE id=$1",
      [p.customer_id],
      db,
    );
    assert(customer, "Customer not found.");
    let validity = 14;
    if (p.template_id) {
      const t = await one<{ plan_id: string; validity_days: number }>(
        "SELECT * FROM templates WHERE id=$1 AND active",
        [p.template_id],
        db,
      );
      assert(
        t && t.plan_id === p.plan_id,
        "Template must match the selected plan.",
      );
      validity = t.validity_days;
    }
    const lines = await buildLines(p.plan_id, p.lines, p.start_on, db);
    const plan = await one<{
      available_from: string;
      available_until: string | null;
    }>(
      "SELECT available_from,available_until FROM plans WHERE id=$1",
      [p.plan_id],
      db,
    );
    assert(
      plan &&
        p.start_on >= plan.available_from &&
        (!plan.available_until || p.start_on <= plan.available_until),
      "Plan is not available on the subscription start date.",
    );
    const s = await one<{ id: string }>(
      "INSERT INTO subscriptions(customer_id,plan_id,start_on,expiry_on,next_billing_on,anchor_day,anchor_month,payment_days,lines,validity_days,created_by) VALUES($1,$2,$3,$4,$3,$5,$6,$7,$8,$9,$10) RETURNING *",
      [
        p.customer_id,
        p.plan_id,
        p.start_on,
        p.expiry_on,
        Number(p.start_on.slice(8)),
        Number(p.start_on.slice(5, 7)),
        p.payment_days,
        JSON.stringify(lines),
        validity,
        actor.id,
      ],
      db,
    );
    await audit(db, actor, "subscription.created", s!.id);
    return s;
  });
}
export async function transition(actor: Actor, id: string, input: unknown) {
  const p = transitionSchema.parse(input);
  return transaction(async (db) => {
    const s = await subscription(actor, id, db, true);
    assert(
      s.version === p.version,
      "This subscription changed. Refresh before acting.",
      "STALE_VERSION",
    );
    const now = today();
    let next = s.status;
    let expiry = s.expiry_on;
    let billing = s.next_billing_on;
    let anchorDay = s.anchor_day;
    let anchorMonth = s.anchor_month;
    let accepted = s.accepted;
    let valid = s.quote_valid_until;
    if (["issue", "confirm", "activate"].includes(p.action)) staff(actor);
    switch (p.action) {
      case "issue":
        assert(
          ["DRAFT", "QUOTATION"].includes(s.status),
          "Only draft or quoted subscriptions can be issued.",
        );
        next = "QUOTATION";
        const validity = await one<{ validity_days: number }>(
          "SELECT validity_days FROM subscriptions WHERE id=$1",
          [id],
          db,
        );
        valid = addDays(now, validity!.validity_days);
        break;
      case "confirm":
        assert(
          s.status === "QUOTATION" && valid && valid >= now,
          "Quotation expired or not issued. Reissue it before accepting.",
          "EXPIRED_QUOTE",
        );
        next = "CONFIRMED";
        accepted = s.lines;
        break;
      case "activate":
        assert(
          s.status === "CONFIRMED",
          "Accept the quotation before activation.",
        );
        assert(
          !expiry || expiry >= now,
          "An expired agreement cannot be activated.",
        );
        assert(
          s.start_on >= s.available_from &&
            (!s.available_until || s.start_on <= s.available_until),
          "Plan was not available on the start date.",
        );
        next = "ACTIVE";
        break;
      case "pause":
        assert(
          s.next_billing_on > now,
          "Generate all due invoices before pausing so earlier cycles are not silently skipped.",
        );
        assert(
          s.status === "ACTIVE" && s.allow_pause,
          "This plan does not allow pausing in its current state.",
        );
        next = "PAUSED";
        break;
      case "resume":
        assert(
          s.status === "PAUSED" && s.allow_pause && (!expiry || expiry >= now),
          "This subscription cannot resume.",
        );
        next = "ACTIVE";
        billing = now;
        anchorDay = Number(now.slice(8));
        anchorMonth = Number(now.slice(5, 7));
        const existing = await one<{ period_end: string }>(
          "SELECT period_end FROM invoices WHERE subscription_id=$1 ORDER BY period_start DESC LIMIT 1",
          [id],
          db,
        );
        if (existing && existing.period_end > billing)
          billing = existing.period_end;
        anchorDay = Number(billing.slice(8));
        anchorMonth = Number(billing.slice(5, 7));
        break;
      case "close":
        assert(
          s.status === "PAUSED" || s.next_billing_on > now,
          "Generate all due invoices before closing this agreement.",
        );
        assert(
          ["ACTIVE", "PAUSED"].includes(s.status) && s.allow_close,
          "This plan does not allow early closure.",
        );
        next = "CLOSED";
        break;
      case "renew":
        assert(
          expiry,
          "This agreement is open-ended and does not need a renewal date.",
        );
        assert(
          ["ACTIVE", "PAUSED"].includes(s.status) && s.allow_renew,
          "This agreement cannot be renewed.",
        );
        assert(
          p.expiry_on && p.expiry_on > (expiry ?? now) && p.expiry_on >= now,
          "Choose an expiry after the existing term and today.",
        );
        expiry = p.expiry_on;
        break;
    }
    await db.query(
      "UPDATE subscriptions SET status=$2,expiry_on=$3,next_billing_on=$4,anchor_day=$5,anchor_month=$6,accepted=$7,quote_valid_until=$8,version=version+1 WHERE id=$1",
      [
        id,
        next,
        expiry,
        billing,
        anchorDay,
        anchorMonth,
        JSON.stringify(accepted),
        valid,
      ],
    );
    await audit(db, actor, `subscription.${p.action}`, id, {
      from: s.status,
      to: next,
      reason: p.reason,
      expiry,
      billing,
    });
    return subscription(actor, id, db);
  });
}
export async function subscriptionHistory(actor: Actor, id: string) {
  await subscription(actor, id);
  return rows(
    "SELECT action,detail,created_at FROM audit WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 40",
    [id],
  );
}
export async function amendAddons(actor: Actor, id: string, input: unknown) {
  staff(actor);
  const p = z
    .strictObject({
      version: z.number().int().positive(),
      reason: z.string().trim().min(3).max(1000),
      lines: z.array(lineInput).max(29),
    })
    .parse(input);
  assert(
    p.lines.every((l) => l.kind === "ADDON"),
    "Only add-on lines can be changed here.",
  );
  return transaction(async (db) => {
    const s = await subscription(actor, id, db, true);
    assert(
      s.version === p.version,
      "This subscription changed. Refresh before acting.",
    );
    assert(
      ["ACTIVE", "PAUSED"].includes(s.status),
      "Add-ons can be changed only on an active or paused agreement.",
    );
    assert(
      s.next_billing_on >= today(),
      "Generate overdue billing cycles before changing add-ons.",
    );
    const before = await agreementLines(s, s.next_billing_on, db);
    const base = before.find((l) => l.kind === "BASE")!;
    const recalculated = await buildLines(
      s.plan_id,
      [
        {
          kind: "BASE",
          productId: base.productId,
          variantId: base.variantId,
          quantity: base.quantity,
        },
        ...p.lines,
      ],
      s.next_billing_on,
      db,
    );
    const after = recalculated.map((line) => {
      if (line.kind === "BASE") return base;
      const existing = before.find(
        (l) =>
          l.kind === "ADDON" &&
          l.productId === line.productId &&
          (l.variantId ?? null) === (line.variantId ?? null),
      );
      return existing ? { ...existing, quantity: line.quantity } : line;
    });
    await db.query(
      "INSERT INTO subscription_amendments(subscription_id,effective_on,before_lines,after_lines,reason,created_by) VALUES($1,$2,$3,$4,$5,$6)",
      [
        id,
        s.next_billing_on,
        JSON.stringify(before),
        JSON.stringify(after),
        p.reason,
        actor.id,
      ],
    );
    await db.query("UPDATE subscriptions SET version=version+1 WHERE id=$1", [
      id,
    ]);
    await audit(db, actor, "subscription.addons_amended", id, {
      effectiveOn: s.next_billing_on,
      before,
      after,
      reason: p.reason,
    });
    return { effectiveOn: s.next_billing_on, lines: after };
  });
}
