# Judge demo (6–10 minutes)

1. Start PostgreSQL and the app using README. Use the admin login from `.local/demo-credentials.txt`. The seeded data and deliberately faulty drafts are labelled demo data.
2. In Products, show Business Management Suite and the Odoo variant with a +560 adjustment in Settings → Product variants. Show the Essentials plan price of INR 1,000 and the effective demo tax/discount rules.
3. In Subscriptions, create a draft for a demo customer using **Essentials + Odoo**. Choose today as the start and leave expiry open. Show the base price of INR 1,560. Issue quotation, record customer acceptance with a note, then activate it.
4. Open Invoices → Run due billing. Open the newest draft for the new agreement. Its subtotal is INR 1,560, saving INR 156, tax INR 252.72, total **INR 1,656.72**. Run billing again to demonstrate no duplicate cycle.
5. Confirm the invoice. Print/PDF it, send it to the **local outbox**, and open Explain my bill. No external email or real payment is initiated.
6. Record INR 500 as a demo receipt, then the remaining INR 1,156.72. Show the outstanding balance reaching zero and the Paid status. Return to Overview to see cash collected update from the ledger.
7. Open BillGuard and run a scan. Review the labelled faulty draft evidence: wrong totals, changed quantity/agreement, invalid discount/tax. Try confirmation to show the backend rejection. Approve recalculation with a note, then re-scan. Issued bills cannot be overwritten.
8. Open Time Machine and preview three months. Explain that these are projected bills from current agreements, not predicted payments. Live invoice rows and discount counters are unchanged. The integration suite verifies this in a PostgreSQL read-only transaction.
9. Sign in as a demo customer in a separate browser session. Show own issued invoices, explanation and allowed subscription actions. Internal catalog, other customer data, scans and financial administration are unavailable.
10. Show docs/PERFORMANCE.md: 10,000 subscriptions, 60,000 invoices, isolated local HTTP response benchmark. State its machine, warm-response conditions and absence of a concurrent-load/browser-render SLA.

Optional: approve a recurring add-on change on an active subscription and show its next-cycle effective date. Show its audit note and the unchanged issued invoice. Policy changes and catalog prices do not silently rewrite already-issued charges.
