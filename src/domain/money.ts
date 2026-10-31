import type { Calculation, Discount, Line } from "@/lib/types";
export const MONEY_LIMIT = 1_000_000_000_000;
export function safe(value: bigint): number {
  if (value < 0n || value > BigInt(MONEY_LIMIT))
    throw new Error("Amount outside supported range");
  return Number(value);
}
export function money(value: string): number {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a nonnegative amount with at most two decimals");
  const [whole, decimal = ""] = value.split(".");
  return safe(BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0")));
}
export function roundedRatio(
  amount: number,
  numerator: number,
  denominator: number,
): number {
  return safe(
    (BigInt(amount) * BigInt(numerator) * 2n + BigInt(denominator)) /
      (2n * BigInt(denominator)),
  );
}
export function calculate(
  lines: Line[],
  discounts: Discount[],
  on: string,
): Calculation {
  const gross = lines.map((l) => {
    if (
      !Number.isInteger(l.quantity) ||
      l.quantity < 1 ||
      l.taxBps < 0 ||
      l.taxBps > 10000
    )
      throw new Error("Invalid invoice line");
    return safe(BigInt(l.unitAmount) * BigInt(l.quantity));
  });
  const subtotal = safe(gross.reduce((a, n) => a + BigInt(n), 0n));
  const candidates = discounts
    .filter(
      (d) =>
        d.active &&
        d.valid_from <= on &&
        (!d.valid_until || on <= d.valid_until) &&
        (d.max_uses === null || d.uses_consumed < d.max_uses),
    )
    .map((d) => {
      const indices = lines.flatMap((l, i) =>
        !d.product_ids.length || d.product_ids.includes(l.productId) ? [i] : [],
      );
      const eligible = indices.reduce((sum, i) => sum + gross[i], 0);
      const quantity = indices.reduce((sum, i) => sum + lines[i].quantity, 0);
      const benefit =
        eligible >= d.min_amount && quantity >= d.min_quantity
          ? Math.min(
              eligible,
              d.kind === "FIXED"
                ? d.value
                : roundedRatio(eligible, d.value, 10000),
            )
          : 0;
      return { d, indices, eligible, benefit };
    })
    .filter((c) => c.benefit > 0)
    .sort((a, b) => b.benefit - a.benefit || a.d.id.localeCompare(b.d.id));
  const best = candidates[0];
  const allocation = lines.map(() => 0);
  if (best) {
    const remainder = best.indices
      .map((i) => {
        const product = BigInt(best.benefit) * BigInt(gross[i]);
        allocation[i] = Number(product / BigInt(best.eligible));
        return { i, rem: product % BigInt(best.eligible) };
      })
      .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
    let left = best.benefit - allocation.reduce((a, n) => a + n, 0);
    for (const r of remainder) {
      if (!left) break;
      allocation[r.i]++;
      left--;
    }
  }
  const output = lines.map((l, i) => {
    const tax = roundedRatio(gross[i] - allocation[i], l.taxBps, 10000);
    return {
      ...l,
      gross: gross[i],
      discount: allocation[i],
      tax,
      total: gross[i] - allocation[i] + tax,
    };
  });
  const discount = allocation.reduce((a, n) => a + n, 0);
  const tax = output.reduce((a, l) => a + l.tax, 0);
  return {
    lines: output,
    subtotal,
    discount,
    tax,
    total: safe(BigInt(subtotal) - BigInt(discount) + BigInt(tax)),
    discountId: best?.d.id ?? null,
    discountCode: best?.d.code ?? null,
  };
}
