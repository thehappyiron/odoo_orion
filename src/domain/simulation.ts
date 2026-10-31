import { rows, transaction } from "@/lib/db";
import type { Actor, Discount, Subscription } from "@/lib/types";
import { staff } from "./access";
import { subscriptionSelect } from "./subscriptions";
import { priced } from "./invoices";
import { addDays, cycleEnd, today } from "./dates";
import { assert } from "@/lib/errors";
export async function simulate(actor: Actor, months: number, planId?: string) {
  staff(actor);
  assert(
    Number.isInteger(months) && months >= 1 && months <= 12,
    "Choose a horizon from 1 to 12 months.",
  );
  return transaction(async (db) => {
    await db.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    );
    const start = today();
    let horizon = start;
    for (let n = 0; n < months; n++)
      horizon = cycleEnd(horizon, "MONTHLY", Number(start.slice(8)));
    const subscriptions = await rows<Subscription>(
      `${subscriptionSelect} WHERE s.status='ACTIVE' AND ($1::uuid IS NULL OR s.plan_id=$1) ORDER BY s.id LIMIT 1001`,
      [planId ?? null],
      db,
    );
    assert(
      subscriptions.length <= 1000,
      "Limit this preview to a plan with at most 1,000 active subscriptions.",
    );
    const discounts = await rows<Discount>(
      "SELECT * FROM discounts ORDER BY id",
      [],
      db,
    );
    const events: {
      id: string;
      subscription: string;
      customer: string;
      on: string;
      end: string;
      total: number;
      discount: number;
    }[] = [];
    const warnings: { subscription: string; message: string }[] = [];
    for (const s of subscriptions) {
      let on = s.next_billing_on;
      for (let count = 0; on < horizon && count < 400; count++) {
        if (s.expiry_on && on > s.expiry_on) break;
        const end = cycleEnd(on, s.frequency, s.anchor_day, s.anchor_month);
        if (s.expiry_on && end > addDays(s.expiry_on, 1)) {
          warnings.push({
            subscription: s.number,
            message: "Partial final period requires review",
          });
          break;
        }
        try {
          const calc = await priced(s, on, db, discounts);
          events.push({
            id: `${s.id}:${on}`,
            subscription: s.number,
            customer: s.company,
            on,
            end,
            total: calc.total,
            discount: calc.discount,
          });
          if (calc.discountId)
            discounts.find((d) => d.id === calc.discountId)!.uses_consumed++;
        } catch (error) {
          warnings.push({
            subscription: s.number,
            message:
              error instanceof Error ? error.message : "Invalid configuration",
          });
          break;
        }
        on = end;
        assert(
          events.length <= 20000,
          "Preview exceeds 20,000 cycles; select a smaller horizon or plan.",
        );
      }
    }
    const monthly: Record<
      string,
      { month: string; total: number; count: number }
    > = {};
    for (const e of events) {
      const month = e.on.slice(0, 7);
      monthly[month] ??= { month, total: 0, count: 0 };
      monthly[month].total += e.total;
      monthly[month].count++;
    }
    return {
      start,
      horizon,
      months,
      total: events.reduce((a, e) => a + e.total, 0),
      count: events.length,
      monthly: Object.values(monthly).sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
      events: events.slice(0, 250),
      warnings,
      assumptions: [
        "Read-only projection of current agreements, including overdue ungenerated cycles.",
        "Accepted prices stay fixed; no assumed churn or price increases.",
        "Known effective tax rules and discount caps apply. Discounts are simulated in stable subscription order.",
        "No invoices, payments, subscriptions or live discount counters are changed.",
      ],
    };
  });
}
