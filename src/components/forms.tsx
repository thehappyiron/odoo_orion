"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash, ArrowRight } from "@phosphor-icons/react";
import { api, Info, money, Spinner, State, useData, type Row } from "./ui";
import { today } from "@/domain/dates";
import type { Line, Subscription } from "@/lib/types";
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
  hint?: string;
};
export interface Lookup {
  products: Row[];
  variants: Row[];
  plans: Row[];
  customers: Row[];
  templates: Row[];
  taxes: Row[];
}
export const fields: Record<string, Field[]> = {
  products: [
    { key: "name", label: "Product name" },
    { key: "sku", label: "SKU" },
    {
      key: "type",
      label: "Product type",
      options: ["Software", "Service", "Add-on"],
    },
    { key: "sales_amount", label: "Sales price (INR)", type: "money" },
    { key: "cost_amount", label: "Cost price (INR)", type: "money" },
    { key: "notes", label: "Notes", type: "textarea", required: false },
    { key: "active", label: "Available in catalog", type: "boolean" },
  ],
  variants: [
    { key: "product_id", label: "Product", type: "products" },
    { key: "attribute", label: "Attribute (e.g. Brand)" },
    { key: "name", label: "Variant name" },
    { key: "delta", label: "Additional price per unit (INR)", type: "money" },
    { key: "active", label: "Available", type: "boolean" },
  ],
  plans: [
    { key: "name", label: "Plan name" },
    { key: "code", label: "Plan code" },
    { key: "product_id", label: "Base product", type: "products" },
    {
      key: "amount",
      label: "Recurring unit price (INR)",
      type: "money",
      hint: "Replaces the product catalog price. Variants are added per unit.",
    },
    {
      key: "frequency",
      label: "Billing frequency",
      options: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"],
    },
    { key: "min_quantity", label: "Minimum quantity", type: "number" },
    { key: "available_from", label: "Available from", type: "date" },
    {
      key: "available_until",
      label: "Available until",
      type: "date",
      required: false,
    },
    {
      key: "description",
      label: "Description",
      type: "textarea",
      required: false,
    },
    { key: "allow_pause", label: "Allow pause and resume", type: "boolean" },
    { key: "allow_close", label: "Allow early closure", type: "boolean" },
    { key: "allow_renew", label: "Allow renewal", type: "boolean" },
    {
      key: "auto_close",
      label: "Close automatically at expiry",
      type: "boolean",
    },
    {
      key: "active",
      label: "Available for new subscriptions",
      type: "boolean",
    },
  ],
  customers: [
    { key: "company", label: "Company name" },
    { key: "contact", label: "Contact name" },
    { key: "email", label: "Billing email", type: "email" },
    {
      key: "address",
      label: "Billing address",
      type: "textarea",
      required: false,
    },
  ],
  taxes: [
    { key: "name", label: "Tax rule name" },
    {
      key: "rate_bps",
      label: "Rate (basis points)",
      type: "number",
      hint: "100 basis points = 1%. For 18%, enter 1800.",
    },
    {
      key: "product_ids",
      label: "Product scope",
      type: "multi",
      hint: "Leave empty to apply to all products.",
    },
    { key: "valid_from", label: "Effective from", type: "date" },
    {
      key: "valid_until",
      label: "Effective until",
      type: "date",
      required: false,
    },
    { key: "active", label: "Active rule", type: "boolean" },
  ],
  discounts: [
    { key: "name", label: "Rule name" },
    { key: "code", label: "Discount code" },
    { key: "kind", label: "Discount type", options: ["PERCENT", "FIXED"] },
    { key: "value", label: "Value (% or INR)", type: "money" },
    {
      key: "product_ids",
      label: "Eligible products",
      type: "multi",
      hint: "Leave empty for a subscription-wide discount.",
    },
    {
      key: "min_amount",
      label: "Minimum eligible purchase (INR)",
      type: "money",
    },
    { key: "min_quantity", label: "Minimum eligible quantity", type: "number" },
    { key: "valid_from", label: "Valid from", type: "date" },
    { key: "valid_until", label: "Valid until", type: "date", required: false },
    {
      key: "max_uses",
      label: "Maximum confirmed invoice uses",
      type: "number",
      required: false,
      hint: "Leave empty for unlimited uses.",
    },
    { key: "active", label: "Active rule", type: "boolean" },
  ],
  templates: [
    { key: "name", label: "Template name" },
    { key: "plan_id", label: "Plan", type: "plans" },
    {
      key: "validity_days",
      label: "Quotation validity (days)",
      type: "number",
    },
    { key: "payment_days", label: "Payment term (days)", type: "number" },
    { key: "active", label: "Available template", type: "boolean" },
  ],
  staff: [
    { key: "name", label: "Full name" },
    { key: "email", label: "Email", type: "email" },
    {
      key: "password",
      label: "Initial password",
      type: "password",
      hint: "9+ characters with uppercase, lowercase and a special character.",
    },
  ],
  profile: [
    { key: "company", label: "Company name" },
    { key: "contact", label: "Contact name" },
    {
      key: "address",
      label: "Billing address",
      type: "textarea",
      required: false,
    },
  ],
};
const moneyFields = new Set([
  "sales_amount",
  "cost_amount",
  "delta",
  "amount",
  "value",
  "min_amount",
]);
function defaults(kind: string, initial?: Row): Record<string, unknown> {
  const data: Record<string, unknown> = {
    active: true,
    allow_pause: true,
    allow_close: true,
    allow_renew: true,
    auto_close: true,
    min_quantity: 1,
    min_amount: "0",
    frequency: "MONTHLY",
    type: "Software",
    attribute: "Brand",
    kind: "PERCENT",
    valid_from: today(),
    available_from: today(),
    validity_days: 14,
    payment_days: 7,
  };
  for (const f of fields[kind] ?? []) {
    if (initial && initial[f.key] !== undefined)
      data[f.key] = moneyFields.has(f.key)
        ? (Number(initial[f.key]) / 100).toFixed(2)
        : (initial[f.key] ?? "");
    else if (data[f.key] === undefined)
      data[f.key] = f.type === "boolean" ? false : f.type === "multi" ? [] : "";
  }
  return data;
}
export interface InputLine {
  kind: "BASE" | "ADDON";
  productId: string;
  variantId: string | null;
  quantity: number;
}
export function LineEditor({
  lines,
  onChange,
  lookup,
  planId,
}: {
  lines: InputLine[];
  onChange: (v: InputLine[]) => void;
  lookup: Lookup;
  planId: string;
}) {
  const plan = lookup.plans.find((p) => p.id === planId);
  const patch = (index: number, p: Partial<InputLine>) =>
    onChange(lines.map((l, i) => (i === index ? { ...l, ...p } : l)));
  return (
    <div className="line-editor">
      <div className="section-label">
        <h3>Product lines</h3>
        <span>Prices are tax-exclusive</span>
      </div>
      {lines.map((l, i) => (
        <div className="line-edit-row" key={i}>
          <div className="line-edit-kind">
            {l.kind === "BASE" ? "Base plan" : "Add-on"}
          </div>
          <label>
            Product
            <select
              required
              aria-label={`Product line ${i + 1}`}
              value={l.productId}
              disabled={l.kind === "BASE"}
              onChange={(e) =>
                patch(i, { productId: e.target.value, variantId: null })
              }
            >
              <option value="">Choose product</option>
              {lookup.products
                .filter((p) => l.kind !== "BASE" || p.id === plan?.product_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.name)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Variant
            <select
              aria-label={`Variant line ${i + 1}`}
              value={l.variantId ?? ""}
              onChange={(e) => patch(i, { variantId: e.target.value || null })}
            >
              <option value="">Standard</option>
              {lookup.variants
                .filter((v) => v.product_id === l.productId)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {String(v.name)} (+{money(v.delta)})
                  </option>
                ))}
            </select>
          </label>
          <label>
            Quantity
            <input
              required
              aria-label={`Quantity line ${i + 1}`}
              type="number"
              min={l.kind === "BASE" ? Number(plan?.min_quantity ?? 1) : 1}
              max="100000"
              value={l.quantity}
              onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
            />
          </label>
          {l.kind === "ADDON" ? (
            <button
              type="button"
              className="icon-button delete-line"
              aria-label={`Remove line ${i + 1}`}
              onClick={() => onChange(lines.filter((_, n) => n !== i))}
            >
              <Trash size={18} />
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={!planId || lines.length >= 30}
        onClick={() =>
          onChange([
            ...lines,
            {
              kind: "ADDON",
              productId:
                lookup.products.find((p) => p.id !== plan?.product_id)?.id ??
                "",
              variantId: null,
              quantity: 1,
            },
          ])
        }
      >
        <Plus size={16} />
        Add a recurring add-on
      </button>
    </div>
  );
}
export function RecordForm({
  kind,
  initial,
  onSaved,
  onClose,
}: {
  kind: string;
  initial?: Row;
  onSaved: () => void;
  onClose: () => void;
}) {
  const lookup = useData<Lookup>(kind === "profile" ? "profile" : "bootstrap");
  const [data, setData] = useState(() => defaults(kind, initial));
  const [lines, setLines] = useState<InputLine[]>(
    (initial?.lines as InputLine[]) ?? [],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) => {
    setData((d) => ({ ...d, [key]: value }));
    if (kind === "templates" && key === "plan_id") {
      const p = lookup.data?.plans.find((p) => p.id === value);
      if (p)
        setLines([
          {
            kind: "BASE",
            productId: String(p.product_id),
            variantId: null,
            quantity: Number(p.min_quantity),
          },
        ]);
    }
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {};
      for (const f of fields[kind]) {
        body[f.key] =
          f.type === "number"
            ? data[f.key] === ""
              ? null
              : Number(data[f.key])
            : data[f.key];
      }
      if (kind === "templates") body.lines = lines;
      await api(
        `${kind}${initial && kind !== "profile" ? `/${initial.id}` : ""}`,
        body,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const needsLookup = (fields[kind] ?? []).some((f) =>
    ["products", "plans", "multi"].includes(f.type ?? ""),
  );
  if (needsLookup && !lookup.data)
    return <State error={lookup.error} loading={lookup.loading} />;
  return (
    <form onSubmit={submit}>
      <div className="form-body">
        <div className="form-grid">
          {(fields[kind] ?? []).map((f) => (
            <label
              key={f.key}
              className={`field ${["textarea", "multi", "boolean"].includes(f.type ?? "") ? "field-full" : ""} ${f.type === "boolean" ? "toggle-field" : ""}`}
            >
              <span>
                {f.label}
                {f.required !== false && f.type !== "boolean" ? (
                  <span className="required-mark"> *</span>
                ) : null}
              </span>
              {f.type === "boolean" ? (
                <input
                  className="toggle"
                  type="checkbox"
                  checked={Boolean(data[f.key])}
                  onChange={(e) => set(f.key, e.target.checked)}
                />
              ) : f.type === "textarea" ? (
                <textarea
                  rows={3}
                  value={String(data[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : f.options ? (
                <select
                  value={String(data[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              ) : ["products", "plans"].includes(f.type ?? "") ? (
                <select
                  required
                  value={String(data[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  <option value="">
                    Choose {f.type === "products" ? "product" : "plan"}
                  </option>
                  {lookup.data?.[f.type as "products" | "plans"].map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.name)}
                    </option>
                  ))}
                </select>
              ) : f.type === "multi" ? (
                <select
                  multiple
                  value={(data[f.key] as string[]) ?? []}
                  onChange={(e) =>
                    set(
                      f.key,
                      Array.from(e.target.selectedOptions, (o) => o.value),
                    )
                  }
                >
                  {lookup.data?.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.name)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required={f.required !== false}
                  type={f.type === "money" ? "text" : (f.type ?? "text")}
                  inputMode={f.type === "money" ? "decimal" : undefined}
                  min={f.type === "number" ? 0 : undefined}
                  autoComplete={
                    f.type === "password" ? "new-password" : undefined
                  }
                  value={String(data[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
              {f.hint ? <small>{f.hint}</small> : null}
            </label>
          ))}
        </div>
        {kind === "templates" && lookup.data ? (
          <LineEditor
            lines={lines}
            onChange={setLines}
            planId={String(data.plan_id ?? "")}
            lookup={lookup.data}
          />
        ) : null}
        {kind === "plans" ? (
          <Info>
            Catalog changes apply to future quotations. Existing accepted
            agreements keep their prices.
          </Info>
        ) : null}
        {error ? (
          <div role="alert" className="form-error">
            {error}
          </div>
        ) : null}
      </div>
      <footer className="modal-footer">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button disabled={busy} className="button primary" type="submit">
          {busy ? <Spinner /> : null}
          {initial ? "Save changes" : "Create record"}
          <ArrowRight size={17} />
        </button>
      </footer>
    </form>
  );
}
export function SubscriptionForm({
  onSaved,
  onClose,
}: {
  onSaved: () => void;
  onClose: () => void;
}) {
  const lookup = useData<Lookup>("bootstrap");
  const [customer, setCustomer] = useState("");
  const [plan, setPlan] = useState("");
  const [template, setTemplate] = useState("");
  const [start, setStart] = useState(today());
  const [expiry, setExpiry] = useState("");
  const [days, setDays] = useState(7);
  const [lines, setLines] = useState<InputLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!lookup.data)
    return <State error={lookup.error} loading={lookup.loading} />;
  const data = lookup.data;
  function selectPlan(id: string) {
    setPlan(id);
    setTemplate("");
    const p = data.plans.find((p) => p.id === id);
    setLines(
      p
        ? [
            {
              kind: "BASE",
              productId: String(p.product_id),
              variantId: null,
              quantity: Number(p.min_quantity),
            },
          ]
        : [],
    );
  }
  function selectTemplate(id: string) {
    setTemplate(id);
    const t = data.templates.find((t) => t.id === id);
    if (t) {
      setPlan(String(t.plan_id));
      setDays(Number(t.payment_days));
      setLines(t.lines as InputLine[]);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("subscriptions", {
        customer_id: customer,
        plan_id: plan,
        template_id: template || null,
        start_on: start,
        expiry_on: expiry || null,
        payment_days: days,
        lines,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-body">
        <div className="form-grid">
          <label className="field field-full">
            Customer
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              required
            >
              <option value="">Choose a customer</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.company)} · {String(c.email)}
                </option>
              ))}
            </select>
            <small>
              Customer search includes the first 500 records, ordered by
              company.
            </small>
          </label>
          <label className="field">
            Quotation template
            <select
              value={template}
              onChange={(e) => selectTemplate(e.target.value)}
            >
              <option value="">Start from scratch</option>
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {String(t.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Plan
            <select
              required
              value={plan}
              onChange={(e) => selectPlan(e.target.value)}
            >
              <option value="">Choose a plan</option>
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {String(p.name)} · {money(p.amount)} /{" "}
                  {String(p.frequency).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Start date
            <input
              required
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            Expiry date (optional)
            <input
              type="date"
              min={start}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </label>
          <label className="field">
            Payment term (days)
            <input
              type="number"
              min="0"
              max="365"
              required
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
        </div>
        <LineEditor
          lines={lines}
          onChange={setLines}
          lookup={data}
          planId={plan}
        />
        <Info>
          A draft quotation is created first. The team records acceptance before
          activation. Eligible discounts and taxes are calculated on the server.
        </Info>
        {error ? (
          <div role="alert" className="form-error">
            {error}
          </div>
        ) : null}
      </div>
      <footer className="modal-footer">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          disabled={busy || !lines.length}
          type="submit"
          className="button primary"
        >
          {busy ? <Spinner /> : null}Create draft
          <ArrowRight size={17} />
        </button>
      </footer>
    </form>
  );
}
export function AddonForm({
  subscription: s,
  lines: agreed,
  onClose,
  onSaved,
}: {
  subscription: Subscription;
  lines: Line[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const lookup = useData<Lookup>("bootstrap");
  const [lines, setLines] = useState<InputLine[]>(
    agreed.map((l) => ({
      kind: l.kind,
      productId: l.productId,
      variantId: l.variantId ?? null,
      quantity: l.quantity,
    })),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!lookup.data)
    return <State error={lookup.error} loading={lookup.loading} />;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api(`subscriptions/${s.id}/addons`, {
            version: s.version,
            reason,
            lines: lines.filter((l) => l.kind === "ADDON"),
          });
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-body">
        <Info>
          Changes take effect on {s.next_billing_on}, the next unbilled cycle.
          The base plan and existing add-on unit prices stay agreed. New add-ons
          use catalog prices. Issued invoices stay unchanged.
        </Info>
        <LineEditor
          lines={lines}
          onChange={setLines}
          lookup={lookup.data}
          planId={s.plan_id}
        />
        <label className="field">
          Approval note
          <textarea
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Record the customer’s approval of this change"
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? <Spinner /> : null}Approve next-cycle change
          <ArrowRight size={17} />
        </button>
      </footer>
    </form>
  );
}
export function PaymentForm({
  invoiceId,
  balance,
  onSaved,
  onClose,
}: {
  invoiceId?: string;
  balance?: number;
  onSaved: () => void;
  onClose: () => void;
}) {
  const invoices = useData<{ items: Row[] }>("invoices?status=CONFIRMED");
  const [id, setId] = useState(invoiceId ?? "");
  const [amount, setAmount] = useState(
    balance !== undefined ? (balance / 100).toFixed(2) : "",
  );
  const [method, setMethod] = useState("BANK");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("payments", {
        invoice_id: id,
        amount,
        method,
        paid_on: date,
        reference,
        note,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-body">
        <div className="form-grid">
          {!invoiceId ? (
            <label className="field field-full">
              Outstanding invoice
              <select
                required
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  const i = invoices.data?.items.find(
                    (i) => i.id === e.target.value,
                  );
                  setAmount(i ? (Number(i.balance) / 100).toFixed(2) : "");
                }}
              >
                <option value="">Choose an invoice</option>
                {invoices.data?.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {String(i.number)} · {String(i.company)} ·{" "}
                    {money(i.balance)} outstanding
                  </option>
                ))}
              </select>
              <small>
                For older invoices, open the invoice directly to record payment.
              </small>
            </label>
          ) : null}
          <label className="field">
            Amount received (INR)
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="field">
            Payment method
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {["BANK", "UPI", "CARD", "CASH", "OTHER"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Received on
            <input
              required
              type="date"
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            Receipt reference (optional)
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label className="field field-full">
            Note
            <textarea
              required
              rows={3}
              placeholder="How was this receipt checked?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <Info>
          This records money already received. It does not initiate a payment or
          independently verify a bank transaction.
        </Info>
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <footer className="modal-footer">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button disabled={busy} className="button primary" type="submit">
          {busy ? <Spinner /> : null}Record payment
          <ArrowRight size={17} />
        </button>
      </footer>
    </form>
  );
}
