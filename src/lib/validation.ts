import { z } from "zod";
import { money } from "@/domain/money";
import { validDate } from "@/domain/dates";
export const date = z
  .string()
  .refine(validDate, "Enter a valid date (YYYY-MM-DD)");
export const optionalDate = z
  .union([date, z.literal(""), z.null()])
  .transform((v) => v || null);
export const amount = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount with at most two decimals")
  .transform(money);
export const text = z.string().trim().min(1).max(200);
export const uuid = z.uuid();
export const lineInput = z.strictObject({
  productId: uuid,
  variantId: uuid.nullish(),
  kind: z.enum(["BASE", "ADDON"]),
  quantity: z.coerce.number().int().min(1).max(100000),
});
export const productSchema = z.strictObject({
  sku: text,
  name: text,
  type: text,
  sales_amount: amount,
  cost_amount: amount,
  notes: z.string().max(2000).default(""),
  active: z.boolean().default(true),
});
export const variantSchema = z.strictObject({
  product_id: uuid,
  name: text,
  attribute: text.default("Brand"),
  delta: amount,
  active: z.boolean().default(true),
});
export const planSchema = z.strictObject({
  code: text,
  name: text,
  product_id: uuid,
  amount,
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  min_quantity: z.coerce.number().int().min(1).max(100000),
  available_from: date,
  available_until: optionalDate,
  allow_pause: z.boolean(),
  allow_close: z.boolean(),
  allow_renew: z.boolean(),
  auto_close: z.boolean(),
  active: z.boolean().default(true),
  description: z.string().max(2000).default(""),
});
export const taxSchema = z.strictObject({
  name: text,
  rate_bps: z.coerce.number().int().min(0).max(10000),
  product_ids: z.array(uuid).max(100).default([]),
  valid_from: date,
  valid_until: optionalDate,
  active: z.boolean().default(true),
});
export const discountSchema = z.strictObject({
  code: text,
  name: text,
  kind: z.enum(["FIXED", "PERCENT"]),
  value: amount,
  product_ids: z.array(uuid).max(100).default([]),
  min_amount: amount,
  min_quantity: z.coerce.number().int().min(1).max(100000),
  valid_from: date,
  valid_until: optionalDate,
  max_uses: z.coerce.number().int().min(0).max(1000000).nullable(),
  active: z.boolean().default(true),
});
export const templateSchema = z.strictObject({
  name: text,
  plan_id: uuid,
  validity_days: z.coerce.number().int().min(1).max(365),
  payment_days: z.coerce.number().int().min(0).max(365),
  lines: z.array(lineInput).min(1).max(30),
  active: z.boolean().default(true),
});
export const customerSchema = z.strictObject({
  company: text,
  contact: text,
  email: z.email().transform((v) => v.trim().toLowerCase()),
  address: z.string().max(2000).default(""),
});
export const subscriptionSchema = z.strictObject({
  customer_id: uuid,
  plan_id: uuid,
  template_id: uuid.nullish(),
  start_on: date,
  expiry_on: optionalDate,
  payment_days: z.coerce.number().int().min(0).max(365),
  lines: z.array(lineInput).min(1).max(30),
});
export const transitionSchema = z.strictObject({
  action: z.enum([
    "issue",
    "confirm",
    "activate",
    "pause",
    "resume",
    "close",
    "renew",
  ]),
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
  expiry_on: optionalDate.optional(),
});
export const paymentSchema = z.strictObject({
  invoice_id: uuid,
  amount,
  method: z.enum(["BANK", "UPI", "CARD", "CASH", "OTHER"]),
  paid_on: date,
  note: z.string().max(2000),
  reference: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || null),
});
