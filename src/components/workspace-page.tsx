"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Package,
  Tag,
  Check,
  PencilSimple,
  ShieldCheck,
  ArrowsClockwise,
  ClockCounterClockwise,
  Play,
  WarningCircle,
  Receipt,
} from "@phosphor-icons/react";
import { useActor } from "./shell";
import {
  api,
  Badge,
  Info,
  label,
  Modal,
  money,
  Pagination,
  prettyDate,
  Search,
  Spinner,
  State,
  Toast,
  useData,
  type Row,
} from "./ui";
import {
  fields,
  PaymentForm,
  RecordForm,
  SubscriptionForm,
  type Lookup,
} from "./forms";
import { ConfirmAction, InvoiceDetail, SubscriptionDetail } from "./details";
import { DateFilter, InvoiceTable, rangeQuery } from "./dashboard";
interface PageData {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}
const config: Record<
  string,
  { title: string; description: string; create?: string }
> = {
  subscriptions: {
    title: "Subscriptions",
    description: "From the first quotation to the next renewal.",
    create: "New subscription",
  },
  invoices: {
    title: "Invoices",
    description: "Every cycle, from draft to paid.",
  },
  payments: {
    title: "Payments",
    description: "Received money, recorded against the right invoice.",
    create: "Record payment",
  },
  customers: {
    title: "Customers",
    description: "The people and businesses behind every subscription.",
    create: "New customer",
  },
  products: {
    title: "Products",
    description: "Your software, services and recurring add-ons.",
    create: "New product",
  },
  plans: {
    title: "Plans",
    description: "Clear pricing. Flexible cycles. Terms you control.",
    create: "New plan",
  },
  taxes: {
    title: "Tax rules",
    description: "Effective-dated rates applied after discounts.",
    create: "New tax rule",
  },
  discounts: {
    title: "Discounts",
    description: "The right saving, automatically on the next invoice.",
    create: "New discount",
  },
  templates: {
    title: "Quotation templates",
    description: "A consistent starting point for every new agreement.",
    create: "New template",
  },
  variants: {
    title: "Product variants",
    description: "Additive adjustments to a product’s agreed price.",
    create: "New variant",
  },
  staff: {
    title: "Team members",
    description: "Only administrators can add internal staff.",
    create: "Add staff member",
  },
  outbox: {
    title: "Local outbox",
    description:
      "Development messages stored locally. No external email is sent.",
  },
  audit: {
    title: "Audit history",
    description: "A permanent record of changes to your workspace.",
  },
  "billing-runs": {
    title: "Billing runs",
    description: "A history of generated cycles, retries and exceptions.",
  },
};
const statusOptions: Record<string, string[]> = {
  subscriptions: [
    "ACTIVE",
    "DRAFT",
    "QUOTATION",
    "CONFIRMED",
    "PAUSED",
    "CLOSED",
  ],
  invoices: ["DRAFT", "CONFIRMED", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"],
};
function cell(row: Row, key: string): ReactNode {
  const value = row[key];
  if (["status", "display_status", "role", "kind", "severity"].includes(key))
    return <Badge value={value} />;
  if (
    [
      "amount",
      "total",
      "balance",
      "sales_amount",
      "cost_amount",
      "delta",
      "min_amount",
    ].includes(key)
  )
    return <span className="money">{money(value)}</span>;
  if (
    [
      "created_at",
      "paid_on",
      "start_on",
      "next_billing_on",
      "valid_from",
      "valid_until",
      "available_from",
      "due_on",
      "as_of",
    ].includes(key)
  )
    return <span className="muted">{prettyDate(value)}</span>;
  if (key === "active") return <Badge value={value ? "ACTIVE" : "ARCHIVED"} />;
  if (key === "rate_bps") return `${Number(value) / 100}%`;
  if (key === "value")
    return row.kind === "PERCENT" ? `${Number(value) / 100}%` : money(value);
  if (key === "uses_consumed")
    return `${value} / ${row.max_uses ?? "Unlimited"}`;
  if (key === "errors")
    return Array.isArray(value) && value.length
      ? `${value.length} require review`
      : "None";
  if (value === null || value === undefined) return "—";
  return String(value);
}
const columns: Record<string, [string, string][]> = {
  subscriptions: [
    ["number", "Subscription"],
    ["company", "Customer"],
    ["plan_name", "Plan"],
    ["status", "Status"],
    ["next_billing_on", "Next bill"],
    ["start_on", "Started"],
  ],
  payments: [
    ["invoice_number", "Invoice"],
    ["company", "Customer"],
    ["amount", "Received"],
    ["method", "Method"],
    ["paid_on", "Received on"],
    ["reference", "Reference"],
  ],
  customers: [
    ["company", "Company"],
    ["contact", "Contact"],
    ["email", "Billing email"],
    ["subscriptions", "Subscriptions"],
  ],
  products: [
    ["name", "Product"],
    ["sku", "SKU"],
    ["type", "Type"],
    ["sales_amount", "Sales price"],
    ["cost_amount", "Cost price"],
    ["active", "Status"],
  ],
  taxes: [
    ["name", "Rule"],
    ["rate_bps", "Rate"],
    ["valid_from", "Effective from"],
    ["valid_until", "Until"],
    ["active", "Status"],
  ],
  discounts: [
    ["name", "Rule"],
    ["code", "Code"],
    ["value", "Saving"],
    ["min_quantity", "Min. quantity"],
    ["min_amount", "Min. purchase"],
    ["uses_consumed", "Uses"],
    ["active", "Status"],
  ],
  templates: [
    ["name", "Template"],
    ["validity_days", "Validity (days)"],
    ["payment_days", "Payment term (days)"],
    ["active", "Status"],
  ],
  variants: [
    ["name", "Variant"],
    ["attribute", "Attribute"],
    ["delta", "Price adjustment"],
    ["active", "Status"],
  ],
  staff: [
    ["name", "Name"],
    ["email", "Email"],
    ["role", "Role"],
    ["created_at", "Added"],
  ],
  outbox: [
    ["subject", "Message"],
    ["recipient", "Recipient"],
    ["kind", "Type"],
    ["created_at", "Created"],
  ],
  audit: [
    ["action", "Action"],
    ["actor_name", "By"],
    ["created_at", "When"],
  ],
  "billing-runs": [
    ["as_of", "Billing date"],
    ["status", "Status"],
    ["created", "Created"],
    ["skipped", "Duplicates prevented"],
    ["errors", "Exceptions"],
    ["created_at", "Started"],
  ],
};
function Collection({
  kind,
  revision,
  notify,
  onChanged,
}: {
  kind: string;
  revision: number;
  notify: (s: string, error?: boolean) => void;
  onChanged: () => void;
}) {
  const actor = useActor();
  const admin = actor.role === "ADMIN";
  const internal = actor.role !== "CUSTOMER";
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [customer, setCustomer] = useState(params.get("customer") ?? "");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [range, setRange] = useState("all");
  const [selected, setSelected] = useState<Row>();
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<Row>();
  const [reverse, setReverse] = useState<Row>();
  const [runBusy, setRunBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const query = new URLSearchParams(rangeQuery(range));
  query.set("page", String(page));
  if (status) query.set("status", status);
  if (term) query.set("search", term);
  if (customer) query.set("customer", customer);
  const { data, error, loading } = useData<PageData>(
    `${kind}?${query}`,
    revision,
  );
  const c = config[kind];
  const canCreate =
    Boolean(c.create) &&
    internal &&
    (admin ||
      ["subscriptions", "payments", "customers", "templates"].includes(kind));
  const canEdit =
    Boolean(fields[kind]) &&
    !["staff"].includes(kind) &&
    (admin || ["customers", "templates"].includes(kind));
  const saved = () => {
    setCreate(false);
    setEdit(undefined);
    onChanged();
    notify("Record saved to your workspace.");
  };
  async function billing() {
    setRunBusy(true);
    try {
      const result = await api<{ created: number; errors: unknown[] }>(
        "billing",
        {},
      );
      onChanged();
      notify(
        `${result.created} draft invoice${result.created === 1 ? "" : "s"} generated. ${result.errors.length ? `${result.errors.length} exception(s) need review in Billing runs.` : "No duplicate cycles were created."}`,
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setRunBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {["plans", "products"].includes(kind)
              ? "YOUR CATALOG"
              : "YOUR WORKSPACE"}
          </p>
          <h1>
            {c.title}
            <span className="peach-text">.</span>
          </h1>
          <p className="page-description">{c.description}</p>
        </div>
        <div className="heading-actions">
          {kind === "invoices" && admin ? (
            <button
              className="button secondary"
              disabled={runBusy}
              onClick={billing}
            >
              {runBusy ? <Spinner /> : <ArrowsClockwise size={18} />}Run due
              billing
            </button>
          ) : null}
          {canCreate ? (
            <button className="button primary" onClick={() => setCreate(true)}>
              <Plus size={18} />
              {c.create}
            </button>
          ) : null}
        </div>
      </div>
      {kind === "invoices" ? (
        <div className="page-callout">
          <ShieldCheck size={20} />
          <p>
            Invoices come from active subscriptions. Run due billing to create
            drafts, then review and confirm.
          </p>
          <Link href="/settings?tab=billing-runs">
            Billing history
            <ArrowUpRight size={16} />
          </Link>
        </div>
      ) : null}
      <div className="list-toolbar">
        <Search
          value={search}
          onChange={setSearch}
          placeholder={`Search ${c.title.toLowerCase()}…`}
        />
        <div className="toolbar-right">
          {customer ? (
            <button
              className="button ghost small"
              onClick={() => {
                setCustomer("");
                setPage(1);
              }}
            >
              Clear customer filter
            </button>
          ) : null}
          {statusOptions[kind] ? (
            <select
              className="compact-select"
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {statusOptions[kind].map((s) => (
                <option value={s} key={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          ) : null}
          {["invoices", "payments"].includes(kind) ? (
            <DateFilter
              value={range}
              onChange={(v) => {
                setRange(v);
                setPage(1);
              }}
            />
          ) : null}
          <span className="record-count">{data?.total ?? "…"} records</span>
        </div>
      </div>
      <State error={error} loading={loading && !data} />
      {data ? (
        <>
          {kind === "plans" ? (
            <div className="plan-grid">
              {data.items.map((p, n) => (
                <article
                  className={`plan-card ${n === 1 ? "plan-featured" : ""}`}
                  key={p.id}
                >
                  <div className="plan-card-top">
                    <span className="plan-icon">
                      <Tag size={24} />
                    </span>
                    <Badge value={p.active ? "ACTIVE" : "ARCHIVED"} />
                  </div>
                  <p className="eyebrow">{String(p.code)}</p>
                  <h2>{String(p.name)}</h2>
                  <p className="plan-description">{String(p.description)}</p>
                  <div className="plan-price">
                    {money(p.amount)}
                    <small>
                      /{" "}
                      {
                        {
                          DAILY: "day",
                          WEEKLY: "week",
                          MONTHLY: "month",
                          YEARLY: "year",
                        }[String(p.frequency)]
                      }
                    </small>
                  </div>
                  <div className="plan-divider" />
                  <p className="plan-base">{String(p.product_name)}</p>
                  <ul className="plan-features">
                    <li>
                      <Check size={16} />
                      Minimum {String(p.min_quantity)} seat
                      {Number(p.min_quantity) === 1 ? "" : "s"}
                    </li>
                    <li className={!p.allow_pause ? "muted" : ""}>
                      <Check size={16} />
                      {p.allow_pause
                        ? "Pause and resume anytime"
                        : "Pause unavailable"}
                    </li>
                    <li className={!p.allow_renew ? "muted" : ""}>
                      <Check size={16} />
                      {p.allow_renew
                        ? "Renewal supported"
                        : "Fixed-term agreement"}
                    </li>
                    <li>
                      <Check size={16} />
                      {p.allow_close
                        ? "Early closure allowed"
                        : "Commitment until expiry"}
                    </li>
                  </ul>
                  {admin ? (
                    <button
                      className="button secondary full-width"
                      onClick={() => setEdit(p)}
                    >
                      Edit plan
                      <ArrowUpRight size={17} />
                    </button>
                  ) : (
                    <p className="muted small-text">
                      Configured by your administrator
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <section className="panel collection-panel">
              {data.items.length ? (
                kind === "invoices" ? (
                  <InvoiceTable
                    items={data.items}
                    onOpen={(id) =>
                      setSelected(data.items.find((i) => i.id === id))
                    }
                  />
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {columns[kind].map(([key, title]) => (
                            <th
                              key={key}
                              className={
                                [
                                  "amount",
                                  "sales_amount",
                                  "cost_amount",
                                  "delta",
                                  "value",
                                  "min_amount",
                                ].includes(key)
                                  ? "numeric"
                                  : ""
                              }
                            >
                              {title}
                            </th>
                          ))}
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((r) => (
                          <tr key={r.id}>
                            {columns[kind].map(([key], index) => (
                              <td
                                key={key}
                                className={
                                  [
                                    "amount",
                                    "sales_amount",
                                    "cost_amount",
                                    "delta",
                                    "value",
                                    "min_amount",
                                  ].includes(key)
                                    ? "numeric"
                                    : ""
                                }
                              >
                                {index === 0 ? (
                                  <button
                                    className="record-link"
                                    onClick={() => setSelected(r)}
                                  >
                                    {["products", "subscriptions"].includes(
                                      kind,
                                    ) ? (
                                      <span className="record-icon">
                                        {kind === "products" ? (
                                          <Package size={18} />
                                        ) : (
                                          <Receipt size={18} />
                                        )}
                                      </span>
                                    ) : null}
                                    <span>
                                      {cell(r, key)}
                                      {kind === "payments" && r.reversed_at ? (
                                        <small className="danger-text">
                                          Reversed
                                        </small>
                                      ) : null}
                                    </span>
                                  </button>
                                ) : (
                                  cell(r, key)
                                )}
                              </td>
                            ))}
                            <td className="row-actions">
                              {canEdit ? (
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${String(r.name ?? r.company ?? "record")}`}
                                  onClick={() => setEdit(r)}
                                >
                                  <PencilSimple size={17} />
                                </button>
                              ) : kind === "payments" &&
                                admin &&
                                !r.reversed_at ? (
                                <button
                                  className="text-button danger-text"
                                  onClick={() => setReverse(r)}
                                >
                                  Reverse
                                </button>
                              ) : (
                                <button
                                  className="icon-button"
                                  aria-label="View record details"
                                  onClick={() => setSelected(r)}
                                >
                                  <ArrowUpRight size={17} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <State empty />
              )}
              <Pagination page={page} total={data.total} onPage={setPage} />
            </section>
          )}
          {kind === "plans" ? (
            <Pagination page={page} total={data.total} onPage={setPage} />
          ) : null}
        </>
      ) : null}
      {create || edit ? (
        <Modal
          title={
            edit
              ? `Edit ${kind === "staff" ? "staff member" : label(kind).replace(/s$/, "")}`
              : (c.create ?? "New record")
          }
          subtitle={
            kind === "payments"
              ? "Record an already received payment."
              : "Clear terms start with the right details."
          }
          wide={["subscriptions", "templates", "plans"].includes(kind)}
          onClose={() => {
            setCreate(false);
            setEdit(undefined);
          }}
        >
          {kind === "subscriptions" ? (
            <SubscriptionForm
              onClose={() => setCreate(false)}
              onSaved={saved}
            />
          ) : kind === "payments" ? (
            <PaymentForm onClose={() => setCreate(false)} onSaved={saved} />
          ) : (
            <RecordForm
              kind={kind}
              initial={edit}
              onClose={() => {
                setCreate(false);
                setEdit(undefined);
              }}
              onSaved={saved}
            />
          )}
        </Modal>
      ) : null}
      {selected ? (
        kind === "invoices" ? (
          <InvoiceDetail
            id={selected.id}
            onClose={() => setSelected(undefined)}
            onChanged={onChanged}
            notify={notify}
          />
        ) : kind === "subscriptions" ? (
          <SubscriptionDetail
            id={selected.id}
            onClose={() => setSelected(undefined)}
            onChanged={onChanged}
            notify={notify}
          />
        ) : (
          <Modal
            title={String(
              selected.name ??
                selected.number ??
                selected.subject ??
                selected.company ??
                c.title,
            )}
            subtitle={c.description}
            onClose={() => setSelected(undefined)}
          >
            <div className="detail-body">
              {kind === "customers" ? (
                <>
                  <dl className="detail-grid">
                    {["company", "contact", "email", "address"].map((k) => (
                      <div key={k}>
                        <dt>{label(k)}</dt>
                        <dd>{String(selected[k] || "—")}</dd>
                      </div>
                    ))}
                  </dl>
                  <Link
                    className="button primary"
                    href={`/subscriptions?customer=${selected.id}`}
                  >
                    View subscriptions
                    <ArrowRight size={17} />
                  </Link>
                </>
              ) : kind === "outbox" ? (
                <>
                  <p className="muted">To {String(selected.recipient)}</p>
                  <Info>
                    Local development message. No external email was sent.
                  </Info>
                  <pre className="message-body">{String(selected.body)}</pre>
                  {String(selected.body).match(/https?:\/\/\S+/)?.[0] ? (
                    <a
                      className="button primary"
                      href={String(selected.body).match(/https?:\/\/\S+/)![0]}
                    >
                      Open local reset link
                      <ArrowUpRight size={17} />
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  <dl className="detail-grid">
                    {(columns[kind] ?? []).map(([k, t]) => (
                      <div key={k}>
                        <dt>{t}</dt>
                        <dd>{cell(selected, k)}</dd>
                      </div>
                    ))}
                  </dl>
                  {selected.notes ? <p>{String(selected.notes)}</p> : null}
                  {selected.detail || selected.errors ? (
                    <pre className="evidence-json">
                      {JSON.stringify(
                        selected.detail ?? selected.errors,
                        null,
                        2,
                      )}
                    </pre>
                  ) : null}
                  {canEdit ? (
                    <button
                      className="button primary"
                      onClick={() => {
                        setEdit(selected);
                        setSelected(undefined);
                      }}
                    >
                      Edit details
                      <PencilSimple size={17} />
                    </button>
                  ) : null}
                  {kind === "products" && admin ? (
                    <Link
                      className="button secondary"
                      href="/settings?tab=variants"
                    >
                      Manage variants
                      <ArrowUpRight size={17} />
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          </Modal>
        )
      ) : null}
      {reverse ? (
        <ConfirmAction
          title="Reverse payment"
          description={`Reverse the recorded receipt of ${money(reverse.amount)}. The invoice balance will reopen and the original record will remain in the audit history.`}
          onClose={() => setReverse(undefined)}
          onConfirm={async (reason) => {
            await api(`payments/${reverse.id}/reverse`, { reason });
            onChanged();
            notify("Payment reversed. Invoice balance updated.");
          }}
        />
      ) : null}
    </>
  );
}
function Integrity({
  revision,
  onChanged,
  notify,
}: {
  revision: number;
  onChanged: () => void;
  notify: (s: string, error?: boolean) => void;
}) {
  const actor = useActor();
  const [status, setStatus] = useState("OPEN");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Row>();
  const [resolve, setResolve] = useState<Row>();
  const { data, error, loading } = useData<PageData>(
    `findings?status=${status}&page=${page}`,
    revision,
  );
  async function run() {
    setBusy(true);
    try {
      const result = await api<{
        findings: number;
        scanned: number;
        limited: boolean;
      }>("scan", {});
      onChanged();
      notify(
        `${result.scanned} records checked. ${result.findings} findings.${result.limited ? " The scan reached its 500-record batch limit." : ""}`,
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BILLING INTEGRITY STUDIO</p>
          <h1>
            A check before the charge<span className="peach-text">.</span>
          </h1>
          <p className="page-description">
            Rules, evidence, and a safer path to every invoice.
          </p>
        </div>
        <button className="button primary" onClick={run} disabled={busy}>
          {busy ? <Spinner /> : <ShieldCheck size={19} />}Run integrity scan
        </button>
      </div>
      <section className="integrity-banner">
        <span className="integrity-emblem">
          <ShieldCheck size={42} weight="light" />
        </span>
        <div>
          <h2>Meet BillGuard.</h2>
          <p>
            Checks draft arithmetic, accepted prices, discounts, taxes, missing
            cycles and ledger balances. Confirmation always runs these checks
            again.
          </p>
        </div>
        <div className="integrity-count">
          <strong>{data?.total ?? "—"}</strong>
          <span>{status === "OPEN" ? "open" : "resolved"} findings</span>
        </div>
      </section>
      <div className="list-toolbar">
        <div className="tabs">
          <button
            className={status === "OPEN" ? "active" : ""}
            onClick={() => {
              setStatus("OPEN");
              setPage(1);
            }}
          >
            Open findings
          </button>
          <button
            className={status === "RESOLVED" ? "active" : ""}
            onClick={() => {
              setStatus("RESOLVED");
              setPage(1);
            }}
          >
            Resolved
          </button>
        </div>
        <span className="small-text muted">Deterministic checks · No ML</span>
      </div>
      <State error={error} loading={loading && !data} />
      {data ? (
        <section className="finding-list">
          {data.items.length ? (
            data.items.map((f) => (
              <article className="finding-card" key={f.id}>
                <span
                  className={`finding-symbol ${f.severity === "BLOCKER" ? "warm" : ""}`}
                >
                  <WarningCircle size={24} />
                </span>
                <div className="grow">
                  <div className="finding-meta">
                    <Badge value={f.severity} />
                    <span>{String(f.code)}</span>
                    {(f.evidence as Record<string, unknown>)?.fixture ? (
                      <span className="fixture-tag">Demo fixture</span>
                    ) : null}
                  </div>
                  <h3>{String(f.title)}</h3>
                  <p>
                    {f.status === "OPEN"
                      ? "Review the evidence and correct the underlying record."
                      : "The last scan no longer detected this condition."}
                  </p>
                </div>
                <button
                  className="button secondary small"
                  onClick={() => setSelected(f)}
                >
                  Review
                  <ArrowUpRight size={16} />
                </button>
              </article>
            ))
          ) : (
            <div className="panel">
              <State empty />
            </div>
          )}
          <Pagination page={page} total={data.total} onPage={setPage} />
        </section>
      ) : null}
      <Info>
        Two anomalous draft fixtures are intentionally seeded for the demo.
        Issued invoices are protected. Scans check at most 500 drafts and 500
        due subscriptions per run.
      </Info>
      {selected ? (
        <Modal
          title="Finding evidence"
          subtitle={String(selected.code)}
          wide
          onClose={() => setSelected(undefined)}
        >
          <div className="detail-body">
            <Badge value={selected.severity} />
            <h2 className="finding-detail-title">{String(selected.title)}</h2>
            <pre className="evidence-json">
              {JSON.stringify(selected.evidence, null, 2)}
            </pre>
            {selected.status === "OPEN" ? (
              <>
                <Info>
                  A repair recalculates only a draft, or runs due billing for a
                  missing cycle. Underlying configuration errors must be fixed
                  before re-scanning.
                </Info>
                {String(selected.code) === "BI-002_MISSING_DUE_INVOICE" &&
                actor.role !== "ADMIN" ? (
                  <p className="muted">
                    Ask an administrator to run due billing.
                  </p>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => {
                      setResolve(selected);
                      setSelected(undefined);
                    }}
                  >
                    Review and repair
                    <ArrowRight size={17} />
                  </button>
                )}
              </>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {resolve ? (
        <ConfirmAction
          title="Approve repair"
          description="Apply the proposed safe repair, record your note and re-scan. Issued invoice amounts cannot be changed."
          onClose={() => setResolve(undefined)}
          onConfirm={async (reason) => {
            await api(`findings/${resolve.id}`, { reason });
            onChanged();
            notify("Repair attempted and BillGuard re-scanned the records.");
          }}
        />
      ) : null}
    </>
  );
}
interface Simulation {
  start: string;
  horizon: string;
  total: number;
  count: number;
  monthly: { month: string; total: number; count: number }[];
  events: {
    id: string;
    subscription: string;
    customer: string;
    on: string;
    end: string;
    total: number;
    discount: number;
  }[];
  warnings: { subscription: string; message: string }[];
  assumptions: string[];
}
function Simulator({
  notify,
}: {
  notify: (s: string, error?: boolean) => void;
}) {
  const [months, setMonths] = useState(3);
  const [plan, setPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Simulation>();
  const lookup = useData<Lookup>("bootstrap");
  async function run() {
    setBusy(true);
    try {
      setResult(
        await api<Simulation>("simulate", {
          months,
          ...(plan ? { plan_id: plan } : {}),
        }),
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BILLING INTEGRITY STUDIO</p>
          <h1>
            A little clarity, ahead<span className="peach-text">.</span>
          </h1>
          <p className="page-description">
            Explore upcoming billing cycles without changing your books.
          </p>
        </div>
      </div>
      <section className="simulation-intro">
        <div className="simulation-visual">
          <ClockCounterClockwise size={66} weight="thin" />
          <span className="simulation-orbit" />
          <span className="simulation-orbit second" />
        </div>
        <div>
          <span className="eyebrow">THE BILLING TIME MACHINE</span>
          <h2>See the next chapter.</h2>
          <p>
            Project invoices from your existing agreements. Same billing rules,
            a read-only view of what comes next.
          </p>
        </div>
        <span className="readonly-tag">
          <ShieldCheck size={16} />
          Read-only simulation
        </span>
      </section>
      <section className="panel simulation-controls">
        <label>
          Look ahead
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            {[1, 3, 6, 12].map((m) => (
              <option value={m} key={m}>
                {m} month{m > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Include
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">All active plans</option>
            {lookup.data?.plans.map((p) => (
              <option value={p.id} key={p.id}>
                {String(p.name)}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" disabled={busy} onClick={run}>
          {busy ? <Spinner /> : <Play size={17} weight="fill" />}Preview future
          cycles
        </button>
      </section>
      {result ? (
        <>
          <div className="simulation-result-label">
            <span className="live-dot" />
            <strong>SIMULATION</strong>
            <span>
              No live records changed · {prettyDate(result.start)} to{" "}
              {prettyDate(result.horizon)}
            </span>
          </div>
          <div className="simulation-stats">
            <div>
              <span>Projected billing, including tax</span>
              <strong>{money(result.total)}</strong>
            </div>
            <div>
              <span>Projected invoices</span>
              <strong>{result.count}</strong>
            </div>
            <div>
              <span>Agreements needing review</span>
              <strong>{result.warnings.length}</strong>
            </div>
          </div>
          <section className="panel">
            <header className="panel-heading">
              <div>
                <h2>Billing by month</h2>
                <p>
                  Hypothetical invoice amounts, not cash collection predictions.
                </p>
              </div>
            </header>
            <div className="projection-bars">
              {result.monthly.map((m) => (
                <div key={m.month}>
                  <span>
                    {new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString(
                      "en-IN",
                      { month: "short", year: "2-digit" },
                    )}
                  </span>
                  <div className="projection-track">
                    <span
                      style={{
                        width: `${Math.max(1, (m.total / Math.max(...result.monthly.map((x) => x.total), 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{money(m.total)}</strong>
                  <small>{m.count} bills</small>
                </div>
              ))}
            </div>
          </section>
          <section className="panel simulation-table">
            <header className="panel-heading">
              <div>
                <h2>Projected invoice details</h2>
                <p>Showing the first {Math.min(250, result.count)} cycles.</p>
              </div>
            </header>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Subscription</th>
                    <th>Customer</th>
                    <th>Billing date</th>
                    <th className="numeric">Saving</th>
                    <th className="numeric">Total with tax</th>
                  </tr>
                </thead>
                <tbody>
                  {result.events.map((e) => (
                    <tr key={e.id}>
                      <td>{e.subscription}</td>
                      <td>{e.customer}</td>
                      <td>{prettyDate(e.on)}</td>
                      <td className="numeric">{money(e.discount)}</td>
                      <td className="numeric money">{money(e.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="panel assumptions">
            <h3>Assumptions, in plain sight</h3>
            <ul>
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            {result.warnings.map((w, n) => (
              <p className="danger-text" key={n}>
                {w.subscription}: {w.message}
              </p>
            ))}
          </div>
        </>
      ) : (
        <div className="simulation-empty">
          <ClockCounterClockwise size={32} />
          <h3>The future is a preview away.</h3>
          <p>Choose a horizon and preview your current agreements.</p>
          <span>Invoices · Discounts · Taxes · Expiries</span>
        </div>
      )}
    </>
  );
}
function Settings({
  revision,
  onChanged,
  notify,
}: {
  revision: number;
  onChanged: () => void;
  notify: (s: string, error?: boolean) => void;
}) {
  const actor = useActor();
  const params = useSearchParams();
  const router = useRouter();
  const tabs =
    actor.role === "ADMIN"
      ? [
          "templates",
          "variants",
          "taxes",
          "discounts",
          "staff",
          "outbox",
          "billing-runs",
          "audit",
        ]
      : ["templates", "billing-runs", "audit"];
  const tab = tabs.includes(params.get("tab") ?? "")
    ? params.get("tab")!
    : tabs[0];
  return (
    <>
      <div className="settings-tabs" aria-label="Settings sections">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() =>
              router.replace(`/settings?tab=${t}`, { scroll: false })
            }
            className={tab === t ? "active" : ""}
          >
            {config[t].title}
          </button>
        ))}
      </div>
      <Collection
        key={tab}
        kind={tab}
        revision={revision}
        onChanged={onChanged}
        notify={notify}
      />
    </>
  );
}
function Profile({
  revision,
  onChanged,
  notify,
}: {
  revision: number;
  onChanged: () => void;
  notify: (s: string, error?: boolean) => void;
}) {
  const router = useRouter();
  const { data, error, loading } = useData<Row>("profile", revision);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h1>
            My profile<span className="peach-text">.</span>
          </h1>
          <p className="page-description">
            Keep your billing contact details up to date.
          </p>
        </div>
      </div>
      <section className="panel profile-panel">
        {data ? (
          <RecordForm
            kind="profile"
            initial={data}
            onClose={() => router.push("/")}
            onSaved={() => {
              onChanged();
              notify("Profile updated.");
            }}
          />
        ) : (
          <State error={error} loading={loading} />
        )}
      </section>
    </>
  );
}
export function WorkspacePage({ section }: { section: string }) {
  const actor = useActor();
  const params = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<{ message: string; error?: boolean }>();
  const refresh = () => setRevision((v) => v + 1);
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  if (
    actor.role === "CUSTOMER" &&
    !["subscriptions", "invoices", "profile"].includes(section)
  )
    return (
      <div className="page">
        <State error="This page is available to the internal team." />
      </div>
    );
  return (
    <div className="page">
      {section === "settings" ? (
        <Settings revision={revision} onChanged={refresh} notify={notify} />
      ) : section === "integrity" ? (
        <Integrity revision={revision} onChanged={refresh} notify={notify} />
      ) : section === "simulator" ? (
        <Simulator notify={notify} />
      ) : section === "profile" ? (
        <Profile revision={revision} onChanged={refresh} notify={notify} />
      ) : (
        <Collection
          key={`${section}:${params.get("status") ?? ""}:${params.get("customer") ?? ""}`}
          kind={section}
          revision={revision}
          onChanged={refresh}
          notify={notify}
        />
      )}
      {toast ? <Toast {...toast} onClose={() => setToast(undefined)} /> : null}
    </div>
  );
}
