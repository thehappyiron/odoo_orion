"use client";
import { useState } from "react";
import {
  ArrowRight,
  DownloadSimple,
  EnvelopeSimple,
  Info as InfoIcon,
  Receipt,
  CheckCircle,
  ShieldCheck,
} from "@phosphor-icons/react";
import type { Invoice, Subscription } from "@/lib/types";
import {
  api,
  Badge,
  Info,
  Modal,
  money,
  prettyDate,
  Spinner,
  State,
  useData,
  type Row,
  label,
} from "./ui";
import { PaymentForm, AddonForm } from "./forms";
import { useActor } from "./shell";
import { today } from "@/domain/dates";
export function ConfirmAction({
  title,
  description,
  onConfirm,
  onClose,
  renew = false,
}: {
  title: string;
  description: string;
  onConfirm: (reason: string, expiry: string) => Promise<void>;
  onClose: () => void;
  renew?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} subtitle={description} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onConfirm(reason, expiry);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          {renew ? (
            <label className="field">
              New expiry date
              <input
                required
                type="date"
                min={today()}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
          ) : null}
          <label className="field">
            Review note
            <textarea
              autoFocus
              required
              minLength={3}
              maxLength={1000}
              rows={3}
              value={reason}
              placeholder="Add a reason for the audit history"
              onChange={(e) => setReason(e.target.value)}
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
            Go back
          </button>
          <button className="button primary" disabled={busy} type="submit">
            {busy ? <Spinner /> : null}Confirm action
            <ArrowRight size={17} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}
interface DetailProps {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  notify: (message: string, error?: boolean) => void;
}
interface SubDetail extends Subscription {
  upcoming_lines: import("@/lib/types").Line[];
  history: {
    action: string;
    detail: Record<string, unknown>;
    created_at: string;
  }[];
}
export function SubscriptionDetail({
  id,
  onClose,
  onChanged,
  notify,
}: DetailProps) {
  const actor = useActor();
  const internal = actor.role !== "CUSTOMER";
  const [revision, setRevision] = useState(0);
  const {
    data: s,
    error,
    loading,
  } = useData<SubDetail>(`subscriptions/${id}`, revision);
  const [action, setAction] = useState("");
  const [addons, setAddons] = useState(false);
  const refresh = () => {
    setRevision((v) => v + 1);
    onChanged();
  };
  if (!s)
    return (
      <Modal title="Subscription details" onClose={onClose} wide>
        <State error={error} loading={loading} />
      </Modal>
    );
  const options: { action: string; label: string; description: string }[] = [];
  if (internal && ["DRAFT", "QUOTATION"].includes(s.status))
    options.push({
      action: "issue",
      label: s.status === "DRAFT" ? "Issue quotation" : "Reissue quotation",
      description:
        "The quotation validity starts today. No invoice will be created.",
    });
  if (internal && s.status === "QUOTATION")
    options.push({
      action: "confirm",
      label: "Record acceptance",
      description:
        "Confirm that the customer accepted this quotation. Commercial terms will be snapshotted.",
    });
  if (internal && s.status === "CONFIRMED")
    options.push({
      action: "activate",
      label: "Activate subscription",
      description:
        "This agreement becomes eligible for recurring billing. Due periods will be caught up by the billing worker.",
    });
  if (s.status === "ACTIVE" && s.allow_pause)
    options.push({
      action: "pause",
      label: "Pause subscription",
      description:
        "Future billing stops. Issued invoices remain payable. Resume starts a new cycle after any existing billed coverage.",
    });
  if (s.status === "PAUSED" && s.allow_pause)
    options.push({
      action: "resume",
      label: "Resume subscription",
      description:
        "A new billing cycle starts today or after existing billed coverage. Paused cycles will not be backbilled.",
    });
  if (["ACTIVE", "PAUSED"].includes(s.status) && s.allow_renew && s.expiry_on)
    options.push({
      action: "renew",
      label: "Extend agreement",
      description:
        "Extend this agreement’s expiry while retaining its accepted pricing.",
    });
  if (["ACTIVE", "PAUSED"].includes(s.status) && s.allow_close)
    options.push({
      action: "close",
      label: "Close subscription",
      description:
        "Billing stops permanently for this agreement. Existing invoices remain payable. This action does not issue a refund.",
    });
  const selected = options.find((o) => o.action === action);
  return (
    <>
      <Modal
        title={s.number}
        subtitle={`${s.company} · ${s.plan_name}`}
        onClose={onClose}
        wide
      >
        <div className="detail-body">
          <div className="detail-topline">
            <Badge value={s.status} />
            <span>{label(s.frequency)} billing</span>
          </div>
          <div className="lifecycle" aria-label="Subscription lifecycle">
            {["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "CLOSED"].map(
              (stage, i) => (
                <div
                  key={stage}
                  className={
                    stage === s.status ||
                    (s.status === "PAUSED" && stage === "ACTIVE")
                      ? "current"
                      : ""
                  }
                >
                  <span>
                    {stage === s.status ? (
                      <CheckCircle size={17} weight="fill" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <small>
                    {stage === "ACTIVE" && s.status === "PAUSED"
                      ? "Paused"
                      : label(stage)}
                  </small>
                </div>
              ),
            )}
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Plan</dt>
              <dd>{s.plan_name}</dd>
            </div>
            <div>
              <dt>Next billing date</dt>
              <dd>{prettyDate(s.next_billing_on)}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{prettyDate(s.start_on)}</dd>
            </div>
            <div>
              <dt>Agreement expiry</dt>
              <dd>{s.expiry_on ? prettyDate(s.expiry_on) : "Open-ended"}</dd>
            </div>
            <div>
              <dt>Payment term</dt>
              <dd>{s.payment_days} days</dd>
            </div>
            <div>
              <dt>Quotation valid until</dt>
              <dd>{prettyDate(s.quote_valid_until)}</dd>
            </div>
          </dl>
          <div className="section-label">
            <h3>Next-cycle product lines</h3>
            <span>Before discounts and tax</span>
          </div>
          <div className="detail-lines">
            {(s.upcoming_lines ?? s.lines).map((l, i) => (
              <div key={i}>
                <span className="record-icon">
                  <Receipt size={19} />
                </span>
                <div className="grow">
                  <strong>{l.name}</strong>
                  <small>
                    {l.variant ? `${l.variant} · ` : ""}
                    {l.quantity} × {money(l.unitAmount)}
                    {l.variantAmount
                      ? ` (includes ${money(l.variantAmount)} variant)`
                      : ""}
                  </small>
                </div>
                <strong className="money">
                  {money(l.unitAmount * l.quantity)}
                </strong>
              </div>
            ))}
          </div>
          {options.length ? (
            <div className="detail-actions">
              {options.map((o, i) => (
                <button
                  key={o.action}
                  className={`button ${i === 0 ? "primary" : "secondary"} ${o.action === "close" ? "danger-text" : ""}`}
                  onClick={() => setAction(o.action)}
                >
                  {o.label}
                  {i === 0 ? <ArrowRight size={17} /> : null}
                </button>
              ))}
            </div>
          ) : null}
          {internal && ["ACTIVE", "PAUSED"].includes(s.status) ? (
            <button
              className="button secondary"
              onClick={() => setAddons(true)}
            >
              Manage recurring add-ons
              <ArrowRight size={17} />
            </button>
          ) : null}
          <Info>
            Pausing or closing leaves issued invoices unchanged. Accepted prices
            stay fixed when the catalog changes.
          </Info>
          <h3 className="history-title">Activity</h3>
          <ol className="activity-list">
            {s.history.map((h, i) => (
              <li key={i}>
                <span className="activity-dot" />
                <div>
                  <strong>
                    {label(
                      h.action
                        .replace("subscription.", "")
                        .replaceAll(".", " "),
                    )}
                  </strong>
                  <p>{String(h.detail.reason ?? "")}</p>
                  <small>{prettyDate(h.created_at)}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Modal>
      {selected ? (
        <ConfirmAction
          title={selected.label}
          description={selected.description}
          renew={action === "renew"}
          onClose={() => setAction("")}
          onConfirm={async (reason, expiry) => {
            await api(`subscriptions/${id}`, {
              action,
              version: s.version,
              reason,
              ...(action === "renew" ? { expiry_on: expiry } : {}),
            });
            refresh();
            notify(
              "Subscription updated. The change is recorded in its history.",
            );
          }}
        />
      ) : null}
      {addons ? (
        <Modal
          title="Manage recurring add-ons"
          subtitle={`Next unbilled cycle · ${prettyDate(s.next_billing_on)}`}
          wide
          onClose={() => setAddons(false)}
        >
          <AddonForm
            subscription={s}
            lines={s.upcoming_lines ?? s.lines}
            onClose={() => setAddons(false)}
            onSaved={() => {
              setAddons(false);
              refresh();
              notify("Add-on change approved for the next unbilled cycle.");
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}
interface InvoiceDetailData extends Invoice {
  payments: Row[];
  previous: {
    id: string;
    number: string;
    total: number;
    subtotal: number;
    discount: number;
    tax: number;
  } | null;
}
export function InvoiceDetail({ id, onClose, onChanged, notify }: DetailProps) {
  const actor = useActor();
  const internal = actor.role !== "CUSTOMER";
  const [revision, setRevision] = useState(0);
  const {
    data: i,
    error,
    loading,
  } = useData<InvoiceDetailData>(`invoices/${id}`, revision);
  const [action, setAction] = useState("");
  const [explain, setExplain] = useState(false);
  const [pay, setPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    setRevision((v) => v + 1);
    onChanged();
  };
  if (!i)
    return (
      <Modal title="Invoice details" onClose={onClose} wide>
        <State error={error} loading={loading} />
      </Modal>
    );
  async function send() {
    setBusy(true);
    try {
      await api(`invoices/${id}`, { action: "send" });
      notify("Invoice saved to the local outbox. No external email was sent.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title={i.number}
        subtitle={`${i.customer_snapshot.company} · ${i.subscription_number}`}
        onClose={onClose}
        wide
      >
        <div className="detail-body">
          <div className="detail-topline">
            <Badge value={i.status} />
            <span>
              {i.fixture ? (
                <span className="fixture-tag">Planted demo anomaly</span>
              ) : (
                "INR · Tax-exclusive pricing"
              )}
            </span>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Billing period</dt>
              <dd>
                {prettyDate(i.period_start)} – {prettyDate(i.period_end)}
              </dd>
              <small>End date excluded</small>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{prettyDate(i.due_on)}</dd>
            </div>
            <div>
              <dt>Bill to</dt>
              <dd>{i.customer_snapshot.company}</dd>
              <small>{i.customer_snapshot.email}</small>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{i.plan_name}</dd>
            </div>
          </dl>
          <div className="table-scroll">
            <table className="invoice-lines">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th className="numeric">Unit price</th>
                  <th className="numeric">Discount</th>
                  <th className="numeric">Tax</th>
                  <th className="numeric">Total</th>
                </tr>
              </thead>
              <tbody>
                {i.lines.map((l, n) => (
                  <tr key={n}>
                    <td>
                      <strong>{l.name}</strong>
                      <small>{l.variant ?? "Standard"}</small>
                    </td>
                    <td>{l.quantity}</td>
                    <td className="numeric">{money(l.unitAmount)}</td>
                    <td className="numeric">{money(l.discount)}</td>
                    <td className="numeric">
                      {money(l.tax)}
                      <small>{l.taxBps / 100}%</small>
                    </td>
                    <td className="numeric">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="invoice-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(i.subtotal)}</strong>
            </div>
            <div>
              <span>
                Discount{" "}
                {i.discount_code ? (
                  <span className="discount-code">{i.discount_code}</span>
                ) : null}
              </span>
              <strong>−{money(i.discount)}</strong>
            </div>
            <div>
              <span>Tax</span>
              <strong>{money(i.tax)}</strong>
            </div>
            <div className="total-line">
              <span>Invoice total</span>
              <strong>{money(i.total)}</strong>
            </div>
            <div>
              <span>Received</span>
              <strong>{money(i.paid)}</strong>
            </div>
            <div className="balance-line">
              <span>Balance due</span>
              <strong>{money(i.total - i.paid)}</strong>
            </div>
          </div>
          <div className="detail-actions">
            {internal && i.status === "DRAFT" ? (
              <>
                <button
                  className="button primary"
                  onClick={() => setAction("confirm")}
                >
                  <ShieldCheck size={18} />
                  Confirm invoice
                </button>
                <button
                  className="button secondary"
                  onClick={() => setAction("recalculate")}
                >
                  Recalculate draft
                </button>
              </>
            ) : null}
            {internal && i.status === "CONFIRMED" ? (
              <button className="button primary" onClick={() => setPay(true)}>
                Record payment
                <ArrowRight size={17} />
              </button>
            ) : null}
            {["CONFIRMED", "PAID"].includes(i.status) ? (
              <>
                <a
                  className="button secondary"
                  href={`/api/v1/invoices/${id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <DownloadSimple size={17} />
                  Print / PDF
                </a>
                {internal ? (
                  <button
                    className="button secondary"
                    onClick={send}
                    disabled={busy}
                  >
                    {busy ? <Spinner /> : <EnvelopeSimple size={17} />}Send to
                    outbox
                  </button>
                ) : null}
              </>
            ) : null}
            {internal &&
            ["DRAFT", "CONFIRMED"].includes(i.status) &&
            i.paid === 0 ? (
              <button
                className="button ghost danger-text"
                onClick={() => setAction("cancel")}
              >
                Cancel invoice
              </button>
            ) : null}
          </div>
          <button
            className="explain-toggle"
            aria-expanded={explain}
            onClick={() => setExplain(!explain)}
          >
            <span>
              <InfoIcon size={21} />
              Explain my bill
            </span>
            <span>
              {explain ? "Hide breakdown" : "Why this amount?"}
              <ArrowRight size={16} />
            </span>
          </button>
          {explain ? (
            <div className="explanation">
              <h3>Every amount, explained.</h3>
              <p>
                This bill covers {prettyDate(i.period_start)} through{" "}
                {prettyDate(i.period_end)} (end date excluded). The following
                values are stored on this invoice.
              </p>
              {i.lines.map((l, n) => (
                <div className="explanation-line" key={n}>
                  <span>
                    {l.quantity} × {l.name}
                    {l.variant ? ` (${l.variant})` : ""}
                    <small>
                      {money(l.baseAmount)} base
                      {l.variantAmount
                        ? ` + ${money(l.variantAmount)} variant`
                        : ""}{" "}
                      per unit
                    </small>
                  </span>
                  <strong>{money(l.gross)}</strong>
                </div>
              ))}
              <div className="explanation-line">
                <span>
                  {i.discount_code
                    ? `${i.discount_code} saving`
                    : "No discount applied"}
                </span>
                <strong>−{money(i.discount)}</strong>
              </div>
              <div className="explanation-line">
                <span>Tax on the discounted amounts</span>
                <strong>+{money(i.tax)}</strong>
              </div>
              <p className="formula">
                {money(i.subtotal)} − {money(i.discount)} + {money(i.tax)} ={" "}
                <strong>{money(i.total)}</strong>
              </p>
              {i.previous ? (
                <div className="comparison">
                  <h4>Compared with {i.previous.number}</h4>
                  <p>
                    Total difference:{" "}
                    <strong>{money(i.total - i.previous.total)}</strong>
                  </p>
                  {(["subtotal", "discount", "tax"] as const).map((k) =>
                    i[k] !== i.previous![k] ? (
                      <p key={k}>
                        {label(k)} changed by {money(i[k] - i.previous![k])}.
                        This comparison uses the two invoice snapshots.
                      </p>
                    ) : null,
                  )}
                  {i.total === i.previous.total ? (
                    <p>
                      The invoice total is unchanged from the previous issued
                      cycle.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="muted">
                  This is the first issued billing cycle available for
                  comparison.
                </p>
              )}
            </div>
          ) : null}
          {i.payments.length ? (
            <>
              <h3 className="history-title">Payment history</h3>
              <div className="detail-lines">
                {i.payments.map((p) => (
                  <div key={p.id}>
                    <span className="record-icon">
                      <CheckCircle size={20} />
                    </span>
                    <div className="grow">
                      <strong>
                        {label(p.method)} · {prettyDate(p.paid_on)}
                        {p.reversed_at ? " · Reversed" : ""}
                      </strong>
                      <small>{String(p.note)}</small>
                    </div>
                    <strong className="money">{money(p.amount)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </Modal>
      {action ? (
        <ConfirmAction
          title={label(action) + " invoice"}
          description={
            action === "confirm"
              ? `Confirm the reviewed total of ${money(i.total)}. BillGuard will check it again, and the issued amounts will become immutable.`
              : action === "recalculate"
                ? "Replace this draft with a fresh calculation from its accepted agreement and effective rules. Review it again before confirmation."
                : "Cancel this unpaid invoice and retain its history. This billing cycle stays reserved; no replacement is created automatically."
          }
          onClose={() => setAction("")}
          onConfirm={async (reason) => {
            await api(`invoices/${id}`, { action, reason });
            refresh();
            notify(
              action === "confirm"
                ? "Invoice confirmed. Its pricing snapshot is now locked."
                : "Invoice updated.",
            );
          }}
        />
      ) : null}
      {pay ? (
        <Modal
          title="Record a payment"
          subtitle={`${i.number} · ${money(i.total - i.paid)} remaining`}
          onClose={() => setPay(false)}
        >
          <PaymentForm
            invoiceId={id}
            balance={i.total - i.paid}
            onClose={() => setPay(false)}
            onSaved={() => {
              setPay(false);
              refresh();
              notify("Payment recorded and invoice balance updated.");
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}
