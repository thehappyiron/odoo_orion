# Implementation status

Repository assessment: initially an empty Git checkout, without source, migrations, dependencies or tests. Initial P0/P1/P2 coverage: none. No existing implementation was overwritten.

## Delivered local scope

| Milestone | Implemented behavior                                                                                                                  | Evidence                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| M0        | Next.js/TypeScript, isolated PostgreSQL 18 cluster, migrations, safe local seed, CI definition                                        | Setup and health check run locally; CI not executed remotely                    |
| M1        | Better Auth, exact password policy, local reset outbox, RBAC, customer ownership and profile                                          | Integration tests; customer browser test                                        |
| M2        | Products/variants, four plan frequencies, policies, effective taxes, fixed/percentage scoped/capped discounts                         | Money tests, role tests, catalog browser creation                               |
| M3        | Templates, quotation acceptance snapshots, lifecycle, pause/resume/renew/close, future approved add-on amendments                     | Service tests and quote-to-active browser flow                                  |
| M4        | Anchored recurrence, catch-up, transaction rollback, concurrent unique cycles, cap locking, confirmation/cancellation, PDF and outbox | Concurrent worker/discount tests and browser invoice flow                       |
| M5        | Partial/full receipts, audited reversal, SQL dashboard and paginated/filterable lists                                                 | Ledger reconciliation, payment browser flow and 10k benchmark                   |
| M6        | Bounded BillGuard scan, evidence, blockers and safe draft repairs                                                                     | Seeded total/discount/tax/agreement anomalies; confirmation blocked server-side |
| M7        | Snapshot explanation and previous issued subtotal/discount/tax/total comparison                                                       | Exact formula and portal browser flow                                           |
| M8        | Bounded, baseline-only Time Machine with PostgreSQL read-only transaction                                                             | Determinism and ledger immutability tests; browser projection                   |

## Verified on 31 October 2026

- `npm run setup`: local cluster startup, idempotent migrations, existing demo data retained.
- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings after removing unused imports and fixing state/navigation patterns.
- `npm test`: **47 passed**, including real PostgreSQL integration, concurrency, retry rollback, fixed/percentage calculations, anchored dates, discount caps, payment integrity, role/ownership guards, CSRF, reset expiry/reuse, add-on changes and auto-expiry of paused agreements.
- `npm run test:e2e`: production build plus **9 browser flows passed** on Chrome/Windows. The final run includes public signup and the full local reset-link flow.
- `npm run test:perf`: 10,000 subscriptions, 60,000 invoices, 20,000 payments in a separate PostgreSQL database. Dashboard API p95 **198.33 ms** under documented warm sequential local conditions; see PERFORMANCE.md. Browser-render latency and concurrent production load were not benchmarked.
- Manual browser: template quotation → acceptance → activation → billing → exact INR 1,656.72 invoice → local outbox → INR 500 partial and INR 1,156.72 final receipt → Paid/zero balance. Explain My Bill and mobile overview inspected.

## Issues found and corrected

- Dashboard SQL alias syntax: corrected and the real data rendered.
- Windows `pg_ctl` inherited pipe handles held startup open: detached command output from the persistent server process.
- Mobile table accessibility helper escaped its scroll container: positioned that container; measured viewport and document width both 390px afterward.
- Notifications inside the page became hidden to assistive technology during modal dialogs: moved notifications into an explicit live-region portal.
- Pausing/closing an unbilled due agreement could skip a cycle on resume: now requires due billing first.
- Approved add-on changes were initially absent: added effective next-cycle amendment history, preserving initial agreement and issued charges.
- Paused agreements needed an automatic expiry sweep: added and tested without generating additional charges.

## Scope limits

P0 scenes are implemented for the local demonstration. This is not a claim of production readiness or every detail of the proposal being complete. External delivery is replaced by a local outbox per the user's no-external-API constraint. There is no verified invitation linking, staff disable/reactivation, archived PDF byte storage, backup/restore automation, distributed queue, arbitrary proration/refund flow, or browser/concurrent-load SLA validation.

P1 BillGuard and simulation are bounded; full-scale queued scans, all proposed BI rule presentation variants and detailed per-product prior-bill attribution remain extensions. The Time Machine supports existing-agreement baseline projection, not hypothetical churn/price scenarios. P2 spreadsheet import and recovery-center workflows are deferred. See README and DECISIONS.md for explicit limits.
