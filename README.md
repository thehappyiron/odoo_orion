# Brightloop

A local subscription operations workspace for the Brightloop hackathon problem: catalog → quotation → subscription → recurring invoice → payment → reporting.

Built with Next.js App Router, TypeScript, PostgreSQL and Better Auth. Receivia informed the navy surfaces, rounded navigation and peach accents; its application code was not copied. No external runtime APIs, ML, hosted database, remote fonts, email provider or payment gateway are used.

## Run locally

Prerequisites: Node.js 24, npm, and PostgreSQL 18 binaries. The development database is a separate cluster bound to **127.0.0.1:55432**. The setup script does not alter an existing PostgreSQL Windows service.

```powershell
npm ci
npm run setup
npm run dev
```

Open **http://127.0.0.1:3000**. Setup creates `.env.local` with random secrets and a local demo password. Admin, staff and customer login details are saved in **`.local/demo-credentials.txt`**, which is excluded from Git. New public signups always create customers.

On this Windows machine PostgreSQL is at `C:/Program Files/PostgreSQL/18/bin`. Elsewhere set `PG_BIN` to the installed binary directory before setup. On Linux/macOS the scripts use PostgreSQL binaries on `PATH` and must run as a regular user who can initialize a cluster.

If you already manage a PostgreSQL server, copy `.env.example` to `.env.local`, set `DATABASE_URL`, generate real random auth/scheduler secrets, and supply `DEMO_PASSWORD` only if local demo seeding is wanted. Run `npm run db:migrate` and, in explicit local demo mode, `npm run db:seed`. The seed retains existing data rather than resetting it. PostgreSQL extensions or cloud accounts are not needed.

Subsequent starts:

```powershell
npm run db:start
npm run dev
```

Stop the project-owned cluster with `npm run db:stop`. Close the dev terminal with Ctrl+C.

## What works

- Email/password registration, login/logout and one-time password resets; admin, staff and customer roles checked on the server. Customers see their own subscriptions and issued invoices.
- Products with sales/cost prices and notes, additive variants (including Odoo +560), four billing frequencies, minimum quantities, availability dates and lifecycle policy switches.
- Reusable quotation templates and editable initial product lines. Draft → Quotation → Confirmed → Active → Closed, plus pause/resume, renewal and audited future add-on amendments.
- Advance billing, anchored month/year recurrence, missed-cycle catch-up, unique subscription/cycle constraints and transactional schedule advancement.
- Fixed/percentage discounts with scope, thresholds, dates and usage caps. One best rule per invoice, exact allocation and tax on discounted amounts.
- Draft preflight, invoice confirmation/cancellation, PDF printing and idempotent local outbox delivery. Issued monetary snapshots are immutable.
- Manually recorded partial/full receipts, duplicate-reference protection, overpayment rejection and admin-only audited reversals.
- Database-backed dashboard, date/customer/plan filters, overdue balances, search and paginated records.
- BillGuard findings with evidence and safe draft repairs; exact invoice explanations and comparison to the previous issued bill.
- A deterministic Time Machine for 1/3/6/12-month baseline projections. PostgreSQL enforces a read-only transaction for simulation.

## Billing worker and email outbox

The **Run due billing** button is admin-only and generates drafts for today. It never creates future real invoices. Running it again cannot duplicate a cycle.

For recurring operation without an open browser, run this in a separate terminal:

```powershell
npm run billing:watch
```

The local worker checks due subscriptions every 60 seconds. `npm run billing:run` runs one bounded batch. A protected `POST /api/internal/billing` endpoint accepts `Authorization: Bearer <BILLING_CRON_SECRET>` for a separately configured scheduler. No OS service or external cron is installed automatically.

Invoice emails and password-reset messages stay in **Settings → Local outbox**. No email leaves the computer. For a forgotten admin password, read the local outbox from the terminal:

```powershell
npm run outbox -- admin@brightloop.local
```

Reset links expire in 30 minutes and work once. Existing staff-created customer profiles cannot be claimed by registering their email; verified account linking is intentionally outside this local version.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:perf
```

- **47 unit/integration tests** use a separate `brightloop_test` PostgreSQL database. Tests reset only that named database's public schema.
- **9 browser tests** build the app, reset only `brightloop_e2e`, and serve a separate production instance on port 3101. Chrome is used on Windows. For Chromium elsewhere, run `npx playwright install chromium` first. Set `PW_CHANNEL` to choose another installed channel.
- The benchmark resets only `brightloop_benchmark`, requires a current production build and free port 3100, and measures complete HTTP responses using 10,000 subscriptions and 60,000 invoices. The measured local dashboard API p95 was **198.33 ms**. See [performance conditions and results](docs/PERFORMANCE.md); browser rendering and concurrent load are not included in that measurement.

Do not point these fixture scripts at a production server. They check the exact isolated database names before resetting a schema. The default demo database is never reset by the test suite.

## Project layout

```text
src/app/          Routes, protected layout, authentication pages and CSS
src/components/  Workspace, forms, details and accessible dialogs
src/domain/      Billing, recurrence, lifecycle, rules, reporting and access
src/lib/         Auth configuration, database transactions, types and validation
migrations/      Versioned PostgreSQL schema and ledger guardrails
scripts/         Local database setup, migration, seed, worker and benchmarks
tests/           Unit, PostgreSQL integration and browser flows
docs/source/     Original master plan and hackathon PDF, retained unchanged
```

Financial amounts in the application API are integer **paise**, with BigInt intermediates and explicit HALF_UP rounding. This differs from the proposal's decimal-string API; see [decisions](docs/DECISIONS.md). Billing dates are date-only values in Asia/Kolkata.

## Deliberate limits

This is a local hackathon build. External email delivery, online payments and ML are absent by request. Spreadsheet import and the optional recovery center are deferred. Partial final periods block for review rather than charging beyond expiry. Closing is terminal; extension applies to open agreements. Add-on changes are internal, approved actions at the next unbilled cycle; no mid-cycle proration or refunds are fabricated.

BillGuard scans are bounded to 500 drafts and 500 due subscriptions; they are suitable for a demonstration, not a queued all-ledger audit service. Simulation is limited to 1,000 active subscriptions and 20,000 cycles. Selectors show the first 500 catalog/customer records, while list pages remain paginated. Customer password resets are local outbox flows, not externally delivered email. Invoice PDFs preserve issued financial snapshots while showing current payment status/balance at print time; PDF bytes are not separately archived.

Production deployment, verified invitation linking, staff disable/reactivation, automated backup/restore, distributed job orchestration, multi-tenant organizations, persistent issued PDF files and a full browser/concurrent-load performance study remain future work. No production compliance certification or deployment is claimed.

See [demo steps](docs/DEMO_SCRIPT.md), [API contract](docs/API.md), [implementation evidence](docs/IMPLEMENTATION_STATUS.md) and [architecture decisions](docs/DECISIONS.md).
