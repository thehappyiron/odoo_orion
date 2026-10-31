import { one, rows, transaction } from "@/lib/db";
import type { Actor, Invoice, Subscription } from "@/lib/types";
import { staff, audit } from "./access";
import {
  invoiceIssues,
  invoiceSelect,
  invoiceAction,
  runBilling,
} from "./invoices";
import { subscriptionSelect } from "./subscriptions";
import { today, cycleEnd, addDays } from "./dates";
import { assert } from "@/lib/errors";
export async function scan(actor: Actor) {
  staff(actor);
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(824743)");
    const detected: {
      fingerprint: string;
      code: string;
      severity: string;
      entityId: string;
      title: string;
      evidence: unknown;
    }[] = [];
    const drafts = await rows<Invoice>(
      `${invoiceSelect} WHERE i.status='DRAFT' ORDER BY i.id LIMIT 500`,
      [],
      db,
    );
    for (const i of drafts) {
      const s = await one<Subscription>(
        `${subscriptionSelect} WHERE s.id=$1`,
        [i.subscription_id],
        db,
      );
      if (!s) continue;
      for (const issue of await invoiceIssues(i, s, db))
        detected.push({
          fingerprint: `${issue.code}:${i.id}`,
          code: issue.code,
          severity: "BLOCKER",
          entityId: i.id,
          title: issue.title,
          evidence: { ...issue, invoice: i.number, fixture: i.fixture },
        });
    }
    const due = await rows<Subscription>(
      `${subscriptionSelect} WHERE s.status='ACTIVE' AND s.next_billing_on<=$1 AND (s.expiry_on IS NULL OR s.next_billing_on<=s.expiry_on) ORDER BY s.next_billing_on,s.id LIMIT 500`,
      [today()],
      db,
    );
    for (const s of due) {
      const code = "BI-002_MISSING_DUE_INVOICE";
      const exists = await one(
        "SELECT id FROM invoices WHERE subscription_id=$1 AND period_start=$2",
        [s.id, s.next_billing_on],
        db,
      );
      if (!exists)
        detected.push({
          fingerprint: `${code}:${s.id}:${s.next_billing_on}`,
          code,
          severity: "WARNING",
          entityId: s.id,
          title: `${s.number} has a due cycle awaiting billing`,
          evidence: {
            subscription: s.number,
            period: s.next_billing_on,
            customer: s.company,
          },
        });
      const end = cycleEnd(
        s.next_billing_on,
        s.frequency,
        s.anchor_day,
        s.anchor_month,
      );
      if (s.expiry_on && end > addDays(s.expiry_on, 1))
        detected.push({
          fingerprint: `partial:${s.id}`,
          code: "BI-009_PARTIAL_PERIOD_REVIEW",
          severity: "BLOCKER",
          entityId: s.id,
          title: `${s.number} ends during its next billing period`,
          evidence: { expiry: s.expiry_on, periodEnd: end },
        });
    }
    const ledger = await rows<{
      id: string;
      number: string;
      paid: number;
      actual: number;
    }>(
      "SELECT i.id,i.number,i.paid,COALESCE(sum(p.amount) FILTER(WHERE p.reversed_at IS NULL),0)::bigint actual FROM invoices i LEFT JOIN payments p ON p.invoice_id=i.id GROUP BY i.id HAVING i.paid<>COALESCE(sum(p.amount) FILTER(WHERE p.reversed_at IS NULL),0) LIMIT 100",
      [],
      db,
    );
    for (const i of ledger)
      detected.push({
        fingerprint: `ledger:${i.id}`,
        code: "BI-008_PAYMENT_LEDGER_MISMATCH",
        severity: "BLOCKER",
        entityId: i.id,
        title: `${i.number} payment balance differs from the ledger`,
        evidence: { expected: i.actual, observed: i.paid },
      });
    // Only resolve findings included in this bounded scan; never resolve unseen rows.
    const scannedIds = [
      ...drafts.map((i) => i.id),
      ...due.map((s) => s.id),
      ...ledger.map((i) => i.id),
    ];
    await db.query(
      "UPDATE findings SET status='RESOLVED',updated_at=now() WHERE entity_id=ANY($1::text[]) AND fingerprint<>ALL($2::text[]) AND status='OPEN'",
      [scannedIds, detected.map((f) => f.fingerprint)],
    );
    await db.query(
      "UPDATE findings f SET status='RESOLVED',updated_at=now() WHERE status='OPEN' AND (code='BI-002_MISSING_DUE_INVOICE' AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.id::text=f.entity_id AND (s.next_billing_on>$1 OR s.status<>'ACTIVE'))) OR (status='OPEN' AND code IN ('BI-004_INVALID_DISCOUNT','BI-005_TOTAL_MISMATCH','BI-006_QUOTE_MISMATCH','BI-007_INVALID_TAX_CONFIGURATION') AND EXISTS(SELECT 1 FROM invoices i WHERE i.id::text=f.entity_id AND i.status<>'DRAFT'))",
      [today()],
    );
    for (const f of detected)
      await db.query(
        "INSERT INTO findings(fingerprint,code,severity,entity_id,title,evidence) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(fingerprint) DO UPDATE SET title=EXCLUDED.title,evidence=EXCLUDED.evidence,status='OPEN',updated_at=now()",
        [
          f.fingerprint,
          f.code,
          f.severity,
          f.entityId,
          f.title,
          JSON.stringify(f.evidence),
        ],
      );
    await audit(db, actor, "integrity.scanned", "billing", {
      findings: detected.length,
      scannedDrafts: drafts.length,
      scannedSubscriptions: due.length,
      limit: 500,
    });
    return {
      findings: detected.length,
      blockers: detected.filter((f) => f.severity === "BLOCKER").length,
      scanned: drafts.length + due.length,
      limited: drafts.length === 500 || due.length === 500,
    };
  });
}
export async function resolveFinding(actor: Actor, id: string, reason: string) {
  staff(actor);
  assert(reason.trim().length >= 3, "Provide a review reason.");
  const f = await one<{ code: string; entity_id: string; status: string }>(
    "SELECT * FROM findings WHERE id=$1",
    [id],
  );
  assert(f && f.status === "OPEN", "Open finding not found.");
  if (f.code === "BI-002_MISSING_DUE_INVOICE") await runBilling(actor);
  else if (
    [
      "BI-004_INVALID_DISCOUNT",
      "BI-005_TOTAL_MISMATCH",
      "BI-006_QUOTE_MISMATCH",
      "BI-007_INVALID_TAX_CONFIGURATION",
    ].includes(f.code)
  )
    await invoiceAction(actor, f.entity_id, "recalculate", reason);
  else
    assert(
      false,
      "Correct the underlying configuration or ledger before re-scanning. This finding cannot be dismissed.",
    );
  await scan(actor);
  return { id };
}
