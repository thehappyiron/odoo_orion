"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Stack,
  Receipt,
  Clock,
  ShieldCheck,
  CheckCircle,
  CalendarBlank,
  TrendUp,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { useActor } from "./shell";
import {
  Badge,
  Modal,
  money,
  prettyDate,
  State,
  Toast,
  useData,
  type Row,
} from "./ui";
import { SubscriptionForm, type Lookup } from "./forms";
import { InvoiceDetail } from "./details";
import { addDays, today } from "@/domain/dates";
interface Summary {
  today: string;
  demo: boolean;
  billed: number;
  outstanding: number;
  overdue: number;
  drafts: number;
  overdue_count: number;
  collected: number;
  active: number;
  subscriptions: { status: string; count: number }[];
  series: { month: string; collected: number }[];
  overdueInvoices: Row[];
  recent: Row[];
  runs: Row[];
  findings: number;
}
export function DateFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="date-filter">
      <CalendarBlank size={17} />
      <select
        aria-label="Reporting period"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="all">All records</option>
        <option value="month">This month</option>
        <option value="90">Last 90 days</option>
        <option value="year">This year</option>
      </select>
    </div>
  );
}
export function rangeQuery(range: string) {
  const d = today();
  return range === "month"
    ? `from=${d.slice(0, 7)}-01&to=${d}`
    : range === "year"
      ? `from=${d.slice(0, 4)}-01-01&to=${d}`
      : range === "90"
        ? `from=${addDays(d, -90)}&to=${d}`
        : "";
}
function AdditionalFilters({
  customer,
  plan,
  onCustomer,
  onPlan,
}: {
  customer: string;
  plan: string;
  onCustomer: (v: string) => void;
  onPlan: (v: string) => void;
}) {
  const { data } = useData<Lookup>("bootstrap");
  return (
    <>
      <select
        className="compact-select"
        aria-label="Filter by customer"
        value={customer}
        onChange={(e) => onCustomer(e.target.value)}
      >
        <option value="">All customers</option>
        {data?.customers.map((c) => (
          <option value={c.id} key={c.id}>
            {String(c.company)}
          </option>
        ))}
      </select>
      <select
        className="compact-select"
        aria-label="Filter by plan"
        value={plan}
        onChange={(e) => onPlan(e.target.value)}
      >
        <option value="">All plans</option>
        {data?.plans.map((p) => (
          <option value={p.id} key={p.id}>
            {String(p.name)}
          </option>
        ))}
      </select>
    </>
  );
}
function ReceiptChart({ series }: { series: Summary["series"] }) {
  const max = Math.max(...series.map((s) => s.collected), 10000) * 1.15;
  const width = 610,
    height = 170;
  const points = series.map((s, i) => ({
    x: 12 + (i * (width - 24)) / 5,
    y: height - 8 - (s.collected / max) * (height - 23),
  }));
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  return (
    <div className="chart">
      <div className="chart-y">
        <span>{money(Math.round(max / 100) * 100)}</span>
        <span>{money(Math.round(max / 200) * 100)}</span>
        <span>₹0</span>
      </div>
      <div className="chart-main">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Monthly cash collected: ${series.map((s) => `${s.month}: ${money(s.collected)}`).join(", ")}`}
        >
          <defs>
            <linearGradient id="receipt-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b8c8df" stopOpacity=".25" />
              <stop offset="100%" stopColor="#b8c8df" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[15, 85, 162].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2={width}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="4 5"
            />
          ))}
          <path
            d={`${path} L${width - 12},${height} L12,${height} Z`}
            fill="url(#receipt-area)"
          />
          <path
            d={path}
            fill="none"
            stroke="#b5c9e5"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="4"
              fill="#18263a"
              stroke="#c7d7ec"
              strokeWidth="2"
            >
              <title>
                {series[i].month}: {money(series[i].collected)}
              </title>
            </circle>
          ))}
        </svg>
        <div className="chart-x">
          {series.map((s) => (
            <span key={s.month}>
              {new Date(`${s.month}-01T12:00:00Z`).toLocaleDateString("en-IN", {
                month: "short",
              })}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
export function InvoiceTable({
  items,
  onOpen,
}: {
  items: Row[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Due date</th>
            <th>Status</th>
            <th className="numeric">Amount</th>
            <th className="table-arrow">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} onClick={() => onOpen(i.id)}>
              <td>
                <button
                  className="record-link"
                  aria-label={`Open invoice ${String(i.number)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(i.id);
                  }}
                >
                  <span className="record-icon">
                    <Receipt size={18} />
                  </span>
                  {String(i.number)}
                </button>
              </td>
              <td>{String(i.company)}</td>
              <td className="muted">{prettyDate(i.due_on)}</td>
              <td>
                <Badge value={i.display_status ?? i.status} />
              </td>
              <td className="numeric money">{money(i.total)}</td>
              <td>
                <ArrowUpRight size={17} className="muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Dashboard() {
  const actor = useActor();
  const internal = actor.role !== "CUSTOMER";
  const [range, setRange] = useState("all");
  const [customer, setCustomer] = useState("");
  const [plan, setPlan] = useState("");
  const [revision, setRevision] = useState(0);
  const [create, setCreate] = useState(false);
  const [invoice, setInvoice] = useState("");
  const [toast, setToast] = useState<{ message: string; error?: boolean }>();
  const query = new URLSearchParams(rangeQuery(range));
  if (customer) query.set("customer", customer);
  if (plan) query.set("plan", plan);
  const {
    data: d,
    error,
    loading,
  } = useData<Summary>(`dashboard?${query}`, revision);
  const refresh = () => setRevision((v) => v + 1);
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {internal ? "LET’S KEEP THINGS MOVING" : "YOUR BRIGHTLOOP ACCOUNT"}
          </p>
          <h1>
            Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"},{" "}
            {actor.name.split(" ")[0]}
            <span className="peach-text">.</span>
          </h1>
          <p className="page-description">
            {internal
              ? "Every subscription. Every payment. A little more clarity."
              : "Your subscriptions and bills, together in one place."}
          </p>
        </div>
        <DateFilter value={range} onChange={setRange} />
      </div>
      {internal ? (
        <div className="dashboard-filters">
          <span>Viewing</span>
          <AdditionalFilters
            customer={customer}
            plan={plan}
            onCustomer={setCustomer}
            onPlan={setPlan}
          />
          {customer || plan ? (
            <button
              className="text-button"
              onClick={() => {
                setCustomer("");
                setPlan("");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
      <State error={error} loading={loading && !d} />
      {d ? (
        <>
          <section className="collection-hero">
            <div className="hero-copy">
              <span className="hero-eyebrow">
                {internal ? "CASH COLLECTED" : "YOUR OUTSTANDING BALANCE"}
                <span className="hero-live">
                  <span />
                  FROM YOUR RECORDS
                </span>
              </span>
              <div className="hero-amount">
                {money(internal ? d.collected : d.outstanding)}
              </div>
              <p>
                {internal
                  ? "Payments received. Progress you can see."
                  : "View your issued invoices and their payment history."}
              </p>
              <div className="hero-actions">
                {internal ? (
                  <button
                    className="button hero-button"
                    onClick={() => setCreate(true)}
                  >
                    <Plus size={18} />
                    New subscription
                  </button>
                ) : (
                  <Link className="button hero-button" href="/invoices">
                    View my invoices
                    <ArrowRight size={18} />
                  </Link>
                )}
                <Link
                  className="hero-link"
                  href={internal ? "/payments" : "/subscriptions"}
                >
                  {internal ? "View payments" : "Manage subscriptions"}
                  <ArrowUpRight size={17} />
                </Link>
              </div>
            </div>
            <div className="hero-aside">
              <div className="hero-ring">
                <ArrowsClockwise size={27} weight="light" />
              </div>
              <div>
                <span className="hero-aside-number">
                  {d.active.toString().padStart(2, "0")}
                </span>
                <span className="hero-aside-label">active subscriptions</span>
              </div>
              <span className="hero-aside-foot">
                <CheckCircle size={15} />
                Every cycle, accounted for.
              </span>
            </div>
          </section>
          <section className="metric-strip" aria-label="Workspace metrics">
            {[
              {
                name: "Active subscriptions",
                value: String(d.active).padStart(2, "0"),
                sub: "Currently in term",
                icon: Stack,
                href: "/subscriptions?status=ACTIVE",
              },
              {
                name: "Billed net revenue",
                value: money(d.billed),
                sub: "Issued invoices · excludes tax",
                icon: TrendUp,
                href: "/invoices",
              },
              {
                name: "Outstanding",
                value: money(d.outstanding),
                sub: "Unpaid issued invoice balances",
                icon: Receipt,
                href: "/invoices?status=CONFIRMED",
              },
              {
                name: "Overdue",
                value: money(d.overdue),
                sub: `${d.overdue_count} invoice${d.overdue_count === 1 ? "" : "s"} need attention`,
                icon: Clock,
                href: "/invoices?status=OVERDUE",
              },
            ].map((m, i) => (
              <Link key={m.name} href={m.href} className={`metric metric-${i}`}>
                <div className="metric-label">
                  <span>{m.name}</span>
                  <m.icon size={18} />
                </div>
                <strong>{m.value}</strong>
                <small>
                  {i === 3 ? <span className="peach-dot" /> : null}
                  {m.sub}
                </small>
              </Link>
            ))}
          </section>
          <div className="dashboard-grid">
            <section className="panel receipts-panel">
              <header className="panel-heading">
                <div>
                  <h2>Cash, over time</h2>
                  <p>Recorded receipts · last six calendar months</p>
                </div>
                <span className="chart-legend">
                  <span />
                  Cash collected
                </span>
              </header>
              <ReceiptChart series={d.series} />
              <div className="chart-caption">
                <CheckCircle size={15} />
                <span>Based on received payments, excluding reversals.</span>
              </div>
            </section>
            <section className="panel attention-panel">
              <header className="panel-heading">
                <div>
                  <h2>A little attention</h2>
                  <p>
                    {internal
                      ? "The next steps that keep billing on track."
                      : "Stay on top of your account."}
                  </p>
                </div>
                <span className="attention-icon">
                  <ArrowUpRight size={20} />
                </span>
              </header>
              <div className="attention-list">
                <Link href="/invoices?status=OVERDUE">
                  <span className="attention-symbol warm">
                    <Clock size={20} />
                  </span>
                  <div>
                    <strong>
                      {d.overdue_count
                        ? `${d.overdue_count} overdue invoice${d.overdue_count === 1 ? "" : "s"}`
                        : "You’re up to date"}
                    </strong>
                    <small>
                      {d.overdue_count
                        ? `${money(d.overdue)} awaiting payment`
                        : "No overdue balances in this view"}
                    </small>
                  </div>
                  <ArrowRight size={17} />
                </Link>
                {internal ? (
                  <>
                    <Link href="/invoices?status=DRAFT">
                      <span className="attention-symbol">
                        <Receipt size={20} />
                      </span>
                      <div>
                        <strong>
                          {d.drafts} draft invoice{d.drafts === 1 ? "" : "s"}
                        </strong>
                        <small>Review the details before issuing</small>
                      </div>
                      <ArrowRight size={17} />
                    </Link>
                    <Link href="/integrity">
                      <span className="attention-symbol">
                        <ShieldCheck size={20} />
                      </span>
                      <div>
                        <strong>
                          {d.findings
                            ? `${d.findings} billing finding${d.findings === 1 ? "" : "s"}`
                            : "BillGuard is ready"}
                        </strong>
                        <small>
                          {d.findings
                            ? "Inspect the evidence in BillGuard"
                            : "Run a check before your next billing cycle"}
                        </small>
                      </div>
                      <ArrowRight size={17} />
                    </Link>
                  </>
                ) : (
                  <Link href="/subscriptions">
                    <span className="attention-symbol">
                      <Stack size={20} />
                    </span>
                    <div>
                      <strong>
                        {d.active} active subscription
                        {d.active === 1 ? "" : "s"}
                      </strong>
                      <small>View your terms and available actions</small>
                    </div>
                    <ArrowRight size={17} />
                  </Link>
                )}
              </div>
            </section>
          </div>
          <section className="panel recent-panel">
            <header className="panel-heading">
              <div>
                <h2>Recent invoices</h2>
                <p>A clear view of your latest billing activity.</p>
              </div>
              <Link href="/invoices" className="text-button">
                View all invoices
                <ArrowRight size={16} />
              </Link>
            </header>
            {d.recent.length ? (
              <InvoiceTable items={d.recent} onOpen={setInvoice} />
            ) : (
              <State empty />
            )}
          </section>
          <div className="dashboard-bottom-note">
            <span className="live-dot" />
            {d.demo ? "Demo data · " : ""}Figures come from your PostgreSQL
            records.
            <span className="note-date">As of {prettyDate(d.today)} · IST</span>
          </div>
        </>
      ) : null}
      {create ? (
        <Modal
          title="New subscription"
          subtitle="Start with a quotation. Build a clear agreement."
          wide
          onClose={() => setCreate(false)}
        >
          <SubscriptionForm
            onClose={() => setCreate(false)}
            onSaved={() => {
              setCreate(false);
              refresh();
              notify(
                "Draft subscription created. Open it to issue the quotation.",
              );
            }}
          />
        </Modal>
      ) : null}
      {invoice ? (
        <InvoiceDetail
          id={invoice}
          onClose={() => setInvoice("")}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}
      {toast ? <Toast {...toast} onClose={() => setToast(undefined)} /> : null}
    </div>
  );
}
