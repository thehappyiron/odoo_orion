import { describe, expect, it } from "vitest";
import { calculate, money, roundedRatio } from "../src/domain/money";
import { addDays, cycleEnd, validDate } from "../src/domain/dates";
import type { Discount, Line } from "../src/lib/types";
const line: Line = {
  productId: "p",
  name: "Suite",
  kind: "BASE",
  quantity: 1,
  baseAmount: 100000,
  variantAmount: 56000,
  unitAmount: 156000,
  taxBps: 1800,
};
const rule: Discount = {
  id: "a",
  code: "TEN",
  name: "Ten percent",
  kind: "PERCENT",
  value: 1000,
  product_ids: [],
  min_amount: 0,
  min_quantity: 1,
  valid_from: "2020-01-01",
  valid_until: "2030-12-31",
  max_uses: 10,
  uses_consumed: 0,
  active: true,
};
describe("exact billing arithmetic", () => {
  it("matches the Odoo +560 / 10% / 18% worked example", () => {
    const c = calculate([line], [rule], "2026-10-31");
    expect(c).toMatchObject({
      subtotal: 156000,
      discount: 15600,
      tax: 25272,
      total: 165672,
    });
  });
  it("parses decimal strings exactly and rejects unsafe or overprecise input", () => {
    expect(money("0.01")).toBe(1);
    expect(money("1000.1")).toBe(100010);
    for (const x of ["-1", "1.005", "1e9", "NaN", "Infinity", "1,000"])
      expect(() => money(x)).toThrow();
  });
  it("uses HALF_UP rounding at a half-paisa", () => {
    expect(roundedRatio(1, 5000, 10000)).toBe(1);
    expect(roundedRatio(1, 4999, 10000)).toBe(0);
  });
  it("allocates remainder paise without losing a cent", () => {
    const lines = Array.from({ length: 3 }, (_, i) => ({
      ...line,
      productId: String(i),
      unitAmount: 1,
      taxBps: 0,
    }));
    const c = calculate(
      lines,
      [{ ...rule, kind: "FIXED", value: 2 }],
      "2026-10-31",
    );
    expect(c.lines.map((l) => l.discount)).toEqual([1, 1, 0]);
    expect(c.total).toBe(1);
    expect(c.lines.reduce((a, l) => a + l.total, 0)).toBe(c.total);
  });
  it("selects the largest single eligible discount", () => {
    const c = calculate(
      [line],
      [rule, { ...rule, id: "b", kind: "FIXED", value: 20000 }],
      "2026-10-31",
    );
    expect(c.discount).toBe(20000);
    expect(c.discountId).toBe("b");
  });
  it("caps a fixed saving at the eligible subtotal", () => {
    expect(
      calculate(
        [line],
        [{ ...rule, kind: "FIXED", value: 999999 }],
        "2026-10-31",
      ).total,
    ).toBe(0);
  });
  it.each([
    { active: false },
    { valid_from: "2027-01-01" },
    { valid_until: "2025-01-01" },
    { max_uses: 1, uses_consumed: 1 },
    { min_quantity: 2 },
    { min_amount: 200000 },
    { product_ids: ["other"] },
  ])("rejects an ineligible rule %j", (patch) => {
    expect(
      calculate([line], [{ ...rule, ...patch }], "2026-10-31").discount,
    ).toBe(0);
  });
  it("uses eligible product quantity rather than unrelated add-ons", () => {
    const c = calculate(
      [line, { ...line, productId: "addon", quantity: 9 }],
      [{ ...rule, product_ids: ["p"], min_quantity: 5 }],
      "2026-10-31",
    );
    expect(c.discount).toBe(0);
  });
  it("taxes discounted amounts per line", () => {
    const c = calculate([line], [rule], "2026-10-31");
    expect(c.lines[0].tax).toBe(25272);
    expect(c.total).toBe(c.subtotal - c.discount + c.tax);
  });
});
describe("business-local date recurrence", () => {
  it.each([
    ["2026-01-31", "2026-02-28"],
    ["2026-02-28", "2026-03-31"],
    ["2026-03-31", "2026-04-30"],
    ["2028-01-31", "2028-02-29"],
  ])("restores monthly anchor from %s", (start, end) =>
    expect(cycleEnd(start, "MONTHLY", 31)).toBe(end),
  );
  it("restores leap-year February 29", () => {
    expect(cycleEnd("2027-02-28", "YEARLY", 29, 2)).toBe("2028-02-29");
  });
  it("handles daily, weekly, year and month boundaries", () => {
    expect(cycleEnd("2026-12-31", "DAILY", 31)).toBe("2027-01-01");
    expect(cycleEnd("2026-12-28", "WEEKLY", 28)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
  });
  it("rejects impossible calendar dates", () => {
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(validDate("2026-13-01")).toBe(false);
  });
});
