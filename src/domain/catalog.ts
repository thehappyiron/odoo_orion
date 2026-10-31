import { z } from "zod";
import { one, rows, transaction, type Db, pool } from "@/lib/db";
import { assert, AppError } from "@/lib/errors";
import type { Actor, Line } from "@/lib/types";
import { admin, audit, staff } from "./access";
import * as v from "@/lib/validation";
import { today } from "./dates";
import { calculate } from "./money";
const schemas = {
  products: v.productSchema,
  variants: v.variantSchema,
  plans: v.planSchema,
  taxes: v.taxSchema,
  discounts: v.discountSchema,
  templates: v.templateSchema,
};
export type CatalogKind = keyof typeof schemas;
export function isCatalog(kind: string): kind is CatalogKind {
  return Object.hasOwn(schemas, kind);
}
export async function saveCatalog(
  actor: Actor,
  kind: CatalogKind,
  input: unknown,
  id?: string,
) {
  if (kind === "templates") staff(actor);
  else admin(actor);
  const parsed = schemas[kind].parse(input);
  const data: Record<string, unknown> = { ...parsed };
  return transaction(async (db) => {
    const before = id
      ? await one(`SELECT * FROM ${kind} WHERE id=$1 FOR UPDATE`, [id], db)
      : null;
    if (id) assert(before, "Record not found");
    const from = data.available_from ?? data.valid_from;
    const until = data.available_until ?? data.valid_until;
    assert(
      !until || String(until) >= String(from),
      "End date must be on or after the start date.",
    );
    if (kind === "discounts")
      assert(
        data.kind !== "PERCENT" || Number(data.value) <= 10000,
        "Percentage must be between 0 and 100.",
      );
    if (kind === "taxes") {
      await db.query("SELECT pg_advisory_xact_lock(824742)");
      if (data.active) {
        const conflicts = await rows(
          "SELECT id FROM taxes WHERE active AND ($1::uuid IS NULL OR id<>$1) AND daterange(valid_from,valid_until,'[]') && daterange($2::date,$3::date,'[]') AND (cardinality(product_ids)=0 OR cardinality($4::uuid[])=0 OR product_ids && $4::uuid[])",
          [id ?? null, data.valid_from, data.valid_until, data.product_ids],
          db,
        );
        assert(
          !conflicts.length,
          "This tax rule overlaps another active rule for the same products and dates.",
          "TAX_OVERLAP",
        );
      }
    }
    if (Array.isArray(data.product_ids) && data.product_ids.length) {
      const found = await rows(
        "SELECT id FROM products WHERE id=ANY($1::uuid[])",
        [data.product_ids],
        db,
      );
      assert(
        found.length === new Set(data.product_ids).size,
        "Unknown product scope.",
      );
    }
    if (kind === "templates") {
      await buildLines(
        String(data.plan_id),
        data.lines as z.infer<typeof v.lineInput>[],
        today(),
        db,
      );
      data.lines = JSON.stringify(data.lines);
    }
    const keys = Object.keys(data);
    const values = Object.values(data);
    const sql = id
      ? `UPDATE ${kind} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${keys.length + 1} RETURNING *`
      : `INSERT INTO ${kind}(${keys.join(",")}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`;
    const result = await one(sql, id ? [...values, id] : values, db);
    await audit(
      db,
      actor,
      `${kind}.${id ? "updated" : "created"}`,
      String(result!.id),
      { before, after: result },
    );
    return result;
  });
}
export async function buildLines(
  planId: string,
  input: z.infer<typeof v.lineInput>[],
  on: string,
  db: Db = pool,
): Promise<Line[]> {
  const plan = await one<{
    product_id: string;
    amount: number;
    min_quantity: number;
    active: boolean;
  }>("SELECT * FROM plans WHERE id=$1", [planId], db);
  assert(plan?.active, "Choose an active plan.");
  const bases = input.filter((l) => l.kind === "BASE");
  assert(
    bases.length === 1 &&
      bases[0].productId === plan.product_id &&
      bases[0].quantity >= plan.min_quantity,
    "A quote needs exactly one base product matching the plan and its minimum quantity.",
  );
  const products = await rows<{
    id: string;
    name: string;
    sales_amount: number;
    active: boolean;
  }>(
    "SELECT * FROM products WHERE id=ANY($1::uuid[])",
    [input.map((l) => l.productId)],
    db,
  );
  const variants = await rows<{
    id: string;
    product_id: string;
    name: string;
    delta: number;
    active: boolean;
  }>(
    "SELECT * FROM variants WHERE id=ANY($1::uuid[])",
    [input.flatMap((l) => (l.variantId ? [l.variantId] : []))],
    db,
  );
  const taxes = await rows<{ rate_bps: number; product_ids: string[] }>(
    "SELECT * FROM taxes WHERE active AND valid_from<=$1 AND (valid_until IS NULL OR valid_until>=$1)",
    [on],
    db,
  );
  const output: Line[] = input.map((l) => {
    const p = products.find((p) => p.id === l.productId);
    assert(p?.active, "Choose an active product.");
    const variant = l.variantId
      ? variants.find(
          (v) => v.id === l.variantId && v.product_id === p.id && v.active,
        )
      : undefined;
    assert(
      !l.variantId || variant,
      "The variant does not belong to this product.",
    );
    const applicable = taxes.filter(
      (t) => !t.product_ids.length || t.product_ids.includes(p.id),
    );
    assert(
      applicable.length === 1,
      "Select exactly one effective tax rule per product, including an explicit zero-rate rule.",
      "INVALID_TAX_CONFIGURATION",
    );
    const base = l.kind === "BASE" ? plan.amount : p.sales_amount;
    return {
      ...l,
      name: p.name,
      variant: variant?.name,
      baseAmount: base,
      variantAmount: variant?.delta ?? 0,
      unitAmount: base + (variant?.delta ?? 0),
      taxBps: applicable[0].rate_bps,
    };
  });
  try {
    calculate(output, [], on);
  } catch {
    throw new AppError(
      422,
      "AMOUNT_LIMIT",
      "The proposed quantity, price or tax exceeds the supported invoice amount. Reduce the quantity or unit price.",
    );
  }
  return output;
}
export async function saveCustomer(actor: Actor, input: unknown, id?: string) {
  staff(actor);
  const p = v.customerSchema.parse(input);
  return transaction(async (db) => {
    const result = id
      ? await one(
          "UPDATE customers SET company=$1,contact=$2,email=$3,address=$4 WHERE id=$5 RETURNING *",
          [p.company, p.contact, p.email, p.address, id],
          db,
        )
      : await one(
          "INSERT INTO customers(company,contact,email,address) VALUES($1,$2,$3,$4) RETURNING *",
          [p.company, p.contact, p.email, p.address],
          db,
        );
    if (!result) throw new AppError(404, "NOT_FOUND", "Customer not found");
    await audit(db, actor, "customer.saved", String(result.id));
    return result;
  });
}
