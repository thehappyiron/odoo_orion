export type Role = "ADMIN" | "STAFF" | "CUSTOMER";
export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export interface Line {
  productId: string;
  variantId?: string | null;
  name: string;
  variant?: string;
  kind: "BASE" | "ADDON";
  quantity: number;
  baseAmount: number;
  variantAmount: number;
  unitAmount: number;
  taxBps: number;
}
export interface CalculatedLine extends Line {
  gross: number;
  discount: number;
  tax: number;
  total: number;
}
export interface Discount {
  id: string;
  code: string;
  name: string;
  kind: "FIXED" | "PERCENT";
  value: number;
  product_ids: string[];
  min_amount: number;
  min_quantity: number;
  valid_from: string;
  valid_until: string | null;
  max_uses: number | null;
  uses_consumed: number;
  active: boolean;
}
export interface Calculation {
  lines: CalculatedLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  discountId: string | null;
  discountCode: string | null;
}
export interface Subscription {
  id: string;
  number: string;
  customer_id: string;
  plan_id: string;
  status: string;
  start_on: string;
  expiry_on: string | null;
  next_billing_on: string;
  anchor_day: number;
  anchor_month: number;
  payment_days: number;
  lines: Line[];
  accepted: Line[] | null;
  quote_valid_until: string | null;
  version: number;
  company: string;
  customer_email: string;
  plan_name: string;
  frequency: Frequency;
  min_quantity: number;
  allow_pause: boolean;
  allow_close: boolean;
  allow_renew: boolean;
  auto_close: boolean;
  available_from: string;
  available_until: string | null;
}
export interface Invoice {
  id: string;
  number: string;
  subscription_id: string;
  customer_id: string;
  status: string;
  period_start: string;
  period_end: string;
  due_on: string;
  billing_date: string;
  issued_at: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  lines: CalculatedLine[];
  discount_id: string | null;
  discount_code: string | null;
  customer_snapshot: { company: string; email: string; address: string };
  company: string;
  subscription_number: string;
  plan_name: string;
  created_at: string;
  fixture: boolean;
}
