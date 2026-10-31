"use client";
import Link from "next/link";
import {
  ArrowRight,
  Package,
  FileText,
  ArrowsClockwise,
  ShieldCheck,
  CreditCard,
  ChartLine,
  CheckCircle,
} from "@phosphor-icons/react";
import { useActor } from "./shell";
const steps = [
  {
    title: "Build your catalog",
    text: "Add products, variants and recurring plans. Set the billing frequency, tax rules, discounts and which lifecycle actions each plan allows.",
    icon: Package,
    href: "/products",
    link: "Explore products",
  },
  {
    title: "Make a clear agreement",
    text: "Start with a quotation template, choose the customer and product lines, then record acceptance. Activation makes the subscription eligible for billing.",
    icon: FileText,
    href: "/subscriptions",
    link: "View subscriptions",
  },
  {
    title: "Let each cycle create its bill",
    text: "Run due billing or start the local billing worker. It catches up missed cycles, calculates eligible savings and taxes, and protects against duplicate invoices.",
    icon: ArrowsClockwise,
    href: "/invoices",
    link: "Explore invoices",
  },
  {
    title: "Check before you charge",
    text: "BillGuard compares draft arithmetic, agreed prices, discounts and tax rules. Review the evidence, repair a draft, and confirm only when its checks pass.",
    icon: ShieldCheck,
    href: "/integrity",
    link: "Open BillGuard",
  },
  {
    title: "Record what comes in",
    text: "Record a received payment against its invoice. Partial payments reduce the balance; full settlement marks it Paid. This records receipts without moving real money.",
    icon: CreditCard,
    href: "/payments",
    link: "View payments",
  },
  {
    title: "See today. Preview tomorrow.",
    text: "The overview reflects your database records. Time Machine projects future billing from current agreements in a read-only transaction, without changing the live ledger.",
    icon: ChartLine,
    href: "/simulator",
    link: "Try Time Machine",
  },
];
export function HowItWorks() {
  const internal = useActor().role !== "CUSTOMER";
  return (
    <div className="page guide-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">A QUICK TOUR OF BRIGHTLOOP</p>
          <h1>
            How it works<span className="peach-text">.</span>
          </h1>
          <p className="page-description">
            From a clear agreement to a paid invoice. Here’s how it all
            connects.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Back to overview
          <ArrowRight size={18} />
        </Link>
      </div>
      <section className="guide-hero">
        <div>
          <span className="eyebrow">EVERY CYCLE, ACCOUNTED FOR</span>
          <h2>
            One connected flow.
            <br />
            Fewer billing surprises.
          </h2>
          <p>
            Set up your terms once, keep every charge explainable, and give
            customers a clear view of their subscriptions.
          </p>
          <Link className="button hero-button" href="/subscriptions">
            {internal ? "Explore demo subscriptions" : "My subscriptions"}
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="guide-example">
          <span className="eyebrow">WORKED EXAMPLE · ILLUSTRATIVE INR</span>
          <h3>A bill you can follow.</h3>
          <dl>
            <div>
              <dt>Monthly plan</dt>
              <dd>₹1,000.00</dd>
            </div>
            <div>
              <dt>Odoo variant</dt>
              <dd>+ ₹560.00</dd>
            </div>
            <div>
              <dt>Eligible 10% saving</dt>
              <dd>− ₹156.00</dd>
            </div>
            <div>
              <dt>18% example tax, after saving</dt>
              <dd>+ ₹252.72</dd>
            </div>
            <div className="guide-example-total">
              <dt>Invoice total</dt>
              <dd>₹1,656.72</dd>
            </div>
          </dl>
          <p>
            This explains the calculation; it is not a live invoice or a
            prescribed tax rate.
          </p>
        </div>
      </section>
      {internal ? (
        <>
          <div className="guide-section-heading">
            <p className="eyebrow">THE WORKFLOW</p>
            <h2>Six steps. One source of truth.</h2>
          </div>
          <div className="guide-steps">
            {steps.map((s, i) => (
              <article className="panel guide-step" key={s.title}>
                <div className="guide-step-top">
                  <span className="guide-step-icon">
                    <s.icon size={24} />
                  </span>
                  <span>0{i + 1}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <Link className="text-button" href={s.href}>
                  {s.link}
                  <ArrowRight size={17} />
                </Link>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="panel guide-customer">
          <h2>Your account, at a glance.</h2>
          <p>
            View your own subscriptions, inspect issued invoices, download a PDF
            and open “Explain my bill” for the exact breakdown. Pause, resume,
            renew or close a subscription when its plan permits it.
          </p>
          <p>
            The internal team manages quotations, invoice confirmation and
            payment recording. You can never see another customer’s records.
          </p>
          <Link className="button primary" href="/invoices">
            Explore my invoices
            <ArrowRight size={18} />
          </Link>
        </section>
      )}
      <section className="panel guide-demo">
        <div>
          <span className="eyebrow">EXPLORE THE LOCAL DEMO</span>
          <h2>Real workflows. Sample records.</h2>
          <p>
            Demo plans are labelled “Demo”. Explore paid, partially paid and
            overdue invoices, quotation stages and subscriptions with different
            lifecycle states. Amounts on the dashboard are calculated from these
            PostgreSQL records.
          </p>
          <p>
            Newly registered accounts start empty. The demo-data command can
            populate currently empty customer accounts with clearly named sample
            subscriptions. The full operations workspace is available to admin
            and staff accounts.
          </p>
        </div>
        <ul>
          {[
            "Received payments are sample ledger entries",
            "Invoice messages and reset links stay in the local outbox",
            "BillGuard’s planted faulty drafts are labelled separately",
            "No external APIs, ML or real payment processing",
          ].map((t) => (
            <li key={t}>
              <CheckCircle size={19} />
              {t}
            </li>
          ))}
        </ul>
      </section>
      <section className="guide-faq">
        <h2>A few useful details.</h2>
        <details>
          <summary>What do the subscription stages mean?</summary>
          <p>
            Draft → Quotation → Confirmed → Active → Closed. A confirmed
            quotation records acceptance; Active enables recurring billing.
            Paused is an additional operational state that stops future billing.
          </p>
        </details>
        <details>
          <summary>Why can’t I confirm a draft invoice?</summary>
          <p>
            BillGuard checks it on the server. Changed discounts, invalid taxes,
            mismatched agreed prices or inconsistent totals can block
            confirmation. Review its evidence and recalculate the draft before
            trying again.
          </p>
        </details>
        <details>
          <summary>Does “Send” deliver a real email?</summary>
          <p>
            No. It stores an invoice message in the administrator’s Local
            outbox. Password resets also use this outbox. No external email
            provider is connected.
          </p>
        </details>
        <details>
          <summary>Does pausing erase an issued bill?</summary>
          <p>
            No. Issued invoices remain payable. Due cycles must be generated
            before pausing or closing. Resume starts after any existing billed
            coverage, without backbilling paused intervals.
          </p>
        </details>
        <details>
          <summary>Are Time Machine amounts predicted collections?</summary>
          <p>
            No. They are hypothetical invoice amounts from existing agreements
            and configured billing rules. The simulation does not predict when
            customers will pay and does not write live invoices or consume live
            discounts.
          </p>
        </details>
      </section>
    </div>
  );
}
