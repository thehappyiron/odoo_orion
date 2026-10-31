# BRIGHTLOOP — CODEX PROJECT MASTER PLAN

> **Project:** Brightloop Subscription Management System  
> **Proposed product name:** Brightloop | Billing Integrity Studio  
> **Document purpose:** Single, self-contained product requirements document (PRD), technical design, implementation plan, and operating instructions for an AI coding agent such as Codex.  
> **Document version:** 1.0 — 31 October 2026  
> **Source of mandatory requirements:** `Subscription_Management_System.pdf`, four-page hackathon problem statement supplied by the project owner.  
> **Status:** Architecture and product proposal. **No claim is made that code, deployment, or integrations already exist.**

---

## 0. READ THIS FIRST — INSTRUCTIONS TO CODEX

You are implementing a real, demonstrable subscription management web application, **not** a static UI prototype. Treat this document as the product and engineering contract.

1. **Inspect the actual repository before coding.** Read `README`, `package.json`, source tree, existing configurations, migrations, tests, and git status. Do not overwrite valuable existing code. If the repo is empty, scaffold the architecture specified here. If a meaningful implementation already exists, reuse it and document only justified deviations.
2. **Mandatory PDF requirements take priority** over design preferences or differentiator features. The priority labels throughout this file are `P0` (required for an acceptable complete solution), `P1` (headline differentiator), and `P2` (optional extension). Do not replace P0 with cosmetic P1 work.
3. **Implement incrementally.** For each milestone: migrate schema, implement service logic, enforce permissions, add validation, add tests, create working UI, run checks, and record outcomes. Do not attempt a giant untested code dump.
4. **Financial integrity is non-negotiable.** Never use binary floating-point for currency calculation, never invent financial metrics, never double-bill, never trust a customer-controlled ID for authorization, and never change historical confirmed invoices silently.
5. **Do not hardcode data as if it were live.** Seeded demo data must be labeled demo data. Dashboards must query the database. All important buttons and workflows must perform genuine actions or be clearly disabled.
6. **No AI model is necessary for core billing.** All prices, discounts, taxes, billing dates, eligibility, anomaly classifications, and reconciliation must be deterministic, testable application logic. If an LLM is added later, it may only help phrase explanations or suggest follow-up actions, subject to approval; it must not be authoritative over charges.
7. **Security:** secrets in environment variables, no secrets committed, passwords hashed with an established authentication library, authorization enforced on the server, rate-limited auth endpoints, audit high-risk actions, and validate all input.
8. **Do not execute live payments, send mass emails, or run destructive migrations against production** without the owner's explicit authorization. Default to test/sandbox behavior and safe local development. Never silently enable scheduled billing against unknown data.
9. **Keep a progress ledger:** update `docs/IMPLEMENTATION_STATUS.md` as you go (milestone, completed items, commands run, tests passed/failed, open blockers). Keep this master plan intact; record architecture deviations in `docs/DECISIONS.md`.
10. **When work must stop or context is limited:** report exactly what was completed, what was not, test evidence, and the next concrete task. Do not claim a feature is complete merely because its UI exists.
11. **Definition of done:** the specified end-to-end flow must run against the real database and a scheduled/simulated billing job, with tests proving one invoice per subscription per cycle and customer data isolation.
12. **If conflicting implementation choices arise:** prefer (a) source PDF, (b) explicit decisions in this document, (c) existing repository conventions, (d) the simplest secure implementation. Record any material deviation and its reason. Do not stall on trivial implementation questions.

### First response Codex should give before modifying code

Summarize the detected repository state; map existing code to P0/P1/P2; identify any conflicts with this design; propose the smallest next milestone; then implement it. Do not start with a landing page when core data models/auth are missing.

---

## 1. EXECUTIVE OVERVIEW

### 1.1 Product problem

Brightloop Software sells business software on monthly/yearly subscriptions, with add-ons, product variants, different customer sizes, and reusable plans. Its present subscription data is fragmented across spreadsheets, manual invoices, memory-based renewals, manual payment matching, and delayed reports. The application must unify the business lifecycle:

`Customer registration → catalog/plan setup → quotation → subscription activation → recurring invoices → payment tracking → revenue reporting → expiry/renewal/closure`.

### 1.2 Product vision

Build a reliable, auditable **subscription operations system** with three experiences:

- **Admin console:** configuration, products/variants, plans, taxes, discounts, staff accounts, business oversight.
- **Staff workspace:** customers, quotations, subscriptions, invoices, recording payments, resolving exceptions, reporting.
- **Customer portal:** account profile, own subscription status, allowed subscription actions, own issued invoices, charge explanations.

### 1.3 Differentiator: Billing Integrity Studio

Rather than merely automating invoice creation, the system proactively protects invoice accuracy:

1. **BillGuard (P1 / first differentiator):** preflight scan detects missing invoices, duplicate attempts, invalid discounts, incorrect math, billing of paused/expired subscriptions, mismatches against accepted quotations, and unsafe billing changes. Findings have severity, evidence, explanation, affected amount where calculable, and approval-based resolutions.
2. **Explain My Bill (P1 / second differentiator):** deterministic itemized explanations of base plan, variant, quantities, discounts, tax, period, total, and changes vs. previous invoice. Must be accessible to the customer only for their own confirmed/paid invoices.
3. **Billing Time Machine (P1, after core correctness):** safe, read-only simulation of future cycles and optional pricing/retention scenarios; previews invoices, expiry, total projected bills, and exceptions without writing to live invoices/payments/subscriptions.
4. **Excel Rescue (P2):** optional guided import of messy customer/subscription spreadsheets with mapping, validation, duplicate checks, and preview.
5. **Recovery Action Center (P2):** prioritized overdue-invoice follow-up, with potential billing disputes separated from genuine nonpayment.

These are **integrated capabilities** built on a shared source of truth and billing rules, **not claims of worldwide novelty**. An integrated, reliable flow is the differentiation.

### 1.4 Success criteria

The demo must show a customer created, plan configured, quote accepted, subscription activated, a recurring bill generated by real logic, a valid discount applied, payment recorded, the dashboard updated, and another cycle generated without duplicates. On top of that, BillGuard must correctly flag a known anomalous draft or expected duplicate attempt, and Explain My Bill must show a mathematically consistent breakdown. The Time Machine is the next major win if time permits.

---

## 2. REQUIREMENT PROVENANCE AND SCOPE

**Legend:** `[PDF/P0]` means directly required by the provided hackathon PDF. `[DESIGN/P0]` means an implementation decision necessary to deliver it safely. `[DIFFERENTIATOR/P1]` is the team's proposed extra capability. `[OPTIONAL/P2]` is stretch scope. Do not describe P1/P2 as demanded by the PDF.

| ID | Required behavior from the PDF | Priority | Acceptance evidence |
|---|---|---|---|
| R-01 | Customer signup with unique email | PDF/P0 | Duplicate normalized email rejected |
| R-02 | Password more than eight characters with uppercase, lowercase, special character | PDF/P0 | Valid/invalid password tests; min length 9 |
| R-03 | Password reset link to registered email | PDF/P0 | One-time reset link flow demonstrated |
| R-04 | Admin / internal staff / customer roles; only admin creates staff | PDF/P0 | Server-side authorization tests |
| R-05 | Customers view/manage only their subscriptions and invoices | PDF/P0 | IDOR/tenant isolation tests |
| R-06 | Product: name, type, sales price, cost price, notes | PDF/P0 | Admin product CRUD |
| R-07 | Product variants with additive price adjustment (example Odoo +560) | PDF/P0 | Variant price calculation test |
| R-08 | Plan price, daily/weekly/monthly/yearly frequency, min quantity, availability dates | PDF/P0 | Plan CRUD and validations |
| R-09 | Per-plan controls for expiry/early closure/pause/renewal | PDF/P0 | Policy-enforced actions |
| R-10 | Quotation templates with plan, product lines, validity days | PDF/P0 | Create quote from template |
| R-11 | Unique subscription number, customer, plan, dates, payment terms, line items with tax/totals | PDF/P0 | Detailed subscription record |
| R-12 | Subscription stages Draft → Quotation → Confirmed → Active → Closed | PDF/P0 | Valid state transitions; history |
| R-13 | Automatically generate accurate invoices when subscriptions become due | PDF/P0 | Scheduled/triggered job makes invoices |
| R-14 | Admin-defined tax rules; invoice confirm/cancel/send/print | PDF/P0 | Invoice workflow and PDF/email |
| R-15 | Invoice stages Draft → Confirmed → Paid; no double billing or missing billing cycles | PDF/P0 | Billing idempotency/catch-up tests |
| R-16 | Admin-only fixed/percentage discount rules with thresholds, dates, usage limits and scope | PDF/P0 | Eligibility/expiry/cap tests |
| R-17 | Automatically reflect applicable discounts on the next invoice | PDF/P0 | Invoice calculation tests |
| R-18 | Record payment method, amount, date, note against invoice | PDF/P0 | Payment persistence/balance tests |
| R-19 | Track paid, outstanding and overdue invoices | PDF/P0 | Server-computed statuses and lists |
| R-20 | Dashboard of active subscriptions, revenue, payments, overdue invoices with filters | PDF/P0 | Live, query-backed dashboard |
| R-21 | Responsiveness under two seconds with thousands of subscriptions | PDF/P0 | Defined benchmark and measurements |
| X-01 | BillGuard integrity scan and guided resolutions | DIFFERENTIATOR/P1 | Planted anomaly detected with evidence |
| X-02 | Explain My Bill and previous-bill comparison | DIFFERENTIATOR/P1 | Exact audited breakdown |
| X-03 | Time Machine simulation | DIFFERENTIATOR/P1 | Forward simulation without ledger writes |
| X-04 | Intelligent spreadsheet onboarding | OPTIONAL/P2 | Preview + review + controlled import |
| X-05 | Recovery workflow | OPTIONAL/P2 | Ranked overdue actions |

### 2.1 Important gaps not specified by the PDF

The PDF **does not specify** framework, database, payment gateway, currency, tax jurisdiction, tax rate, exact discount stacking rules, proration policy, how a pause affects already-issued invoices, refund/credit notes, multi-tenancy, invoice numbering scheme, AI use, or deployment vendor. The choices below are **proposed project decisions**, not quotations from the PDF. Do not add compliance claims (GST-certified, accounting-compliant, SOC2-compliant, etc.) without actual validation.

### 2.2 Non-goals for the first complete version

- Processing real card/UPI payments or storing card numbers; manual payment recording suffices for the PDF.
- Full enterprise ERP/general ledger, official tax e-filing/GST e-invoicing, refund/chargeback accounting, revenue recognition under accounting standards, multi-currency conversion, multi-tenant white-label billing.
- Multi-organization SSO, public marketplace, mobile app, predictive ML trained on nonexistent data.
- Arbitrary mid-cycle proration with refunds in the first milestone; handle partial periods conservatively as described later.

---

## 3. USERS, ACCESS AND USE CASES

### 3.1 Roles

- **ADMIN:** full configuration rights, exclusive staff-account creation, exclusive tax/discount rule creation, oversight of billing and anomaly resolutions.
- **STAFF:** sales/operations/finance responsibilities using limited permissions; create quotations, manage customers/subscriptions, confirm/send/cancel allowed invoices, record payments, view dashboards, investigate errors. Cannot create staff or modify admin-only pricing/tax/discount policies.
- **CUSTOMER:** self-register; view/update own allowed profile fields, see only linked subscriptions and confirmed/paid invoices, request/perform policy-permitted pause/resume/early close/renewal, see billing explanations.

The PDF has exactly these three broad access classes. A distinct FINANCE role is not required; finance functions can be performed by STAFF/ADMIN. Permission granularity may later be expanded without inventing extra user-facing roles.

### 3.2 Permissions matrix

| Action | Admin | Staff | Customer |
|---|:---:|:---:|:---:|
| Create staff / change role | Yes | No | No |
| Create and edit product, variants, plans | Yes | No | No |
| Configure tax and discount rules | Yes | No | No |
| Browse customers | Yes | Yes | Own profile only |
| Create quotation/subscription | Yes | Yes | No (can sign up/request) |
| Confirm quote and activate subscription | Yes | Yes | No |
| Pause/resume/close/renew subscription | Yes | Yes, per plan | Own, per plan policy |
| View all subscriptions/invoices | Yes | Yes | No |
| View own confirmed/paid invoices | Yes | Yes | Yes |
| Confirm/cancel/send/print invoice | Yes | Yes | Print/download own issued invoice only |
| Record/reverse payment | Yes | Yes with audited controls | No |
| Scan billing integrity | Yes | Yes | No |
| Approve privileged integrity correction | Yes | Scoped staff actions only | No |
| View financial summary / Time Machine | Yes | Yes | No |
| Explain own invoice | Yes | Yes | Yes, own only |

### 3.3 Core user journeys

**Admin onboarding:** login → create product, Odoo variant (+560), tax rule, monthly/yearly plan with policy settings, discount rules → optional invite staff.

**Customer signup:** signup → email uniqueness/password validation → customer profile created → customer portal shows only linked records → forgot-password email works.

**Sales quotation:** staff chooses customer → reusable quotation template → fills plan, product variants, quantities, discount eligibility, payment terms, dates → creates subscription in DRAFT → sends/marks QUOTATION → confirms accepted quotation → activates subscription.

**Billing day:** authenticated scheduler finds all due active subscriptions → computes lines/tax/discount → applies hard invariants and duplicate protection → creates DRAFT invoices → staff bulk/singly confirms and sends them → next billing date advances safely.

**Payment:** staff records full/partial payment with method/date/note → balance computed → PAID only when fully settled → overdue filters update.

**End of term:** policy-controlled pause, resume, early close, expiry, renewal; no invoice outside eligible periods; audit every transition.

**Finance:** dashboard with date range/customer/plan/status filters, live revenue and outstanding, drill-down to underlying records, responsive at scale.

**Differentiator:** scan expected/draft bills → identify discrepancy → inspect exact evidence → suggest non-destructive correction → authorized approval → audit → recheck → customer views explanation.

---

## 4. TECHNOLOGY AND ARCHITECTURE

### 4.1 Recommended stack (one repo, one language)

| Layer | Decision | Reason |
|---|---|---|
| Web app/UI | **Next.js App Router + TypeScript** | Shared types, SSR, route handlers, deployable full-stack project |
| Components | **Tailwind CSS + accessible component system (e.g. shadcn/ui/Radix)** | Fast to build coherent admin UX |
| Validation | **Zod** | Client/server request and form validation |
| Data | **PostgreSQL** | Strong transactions, constraints, indexing, reliable money/event records |
| ORM | **Prisma** | Accessible schema/migrations/typed queries |
| Authentication | **Established email/password auth library compatible with this stack (prefer Better Auth after verifying current compatibility)** | Avoid home-grown password/session security |
| Financial arithmetic | **Prisma Decimal / decimal.js** | Exact decimal money; explicit rounding |
| Dates | **date-fns plus explicit business timezone support** | Date-only billing and calendar recurrence |
| Charts | **Recharts (or existing installed chart package)** | Lightweight operational dashboard |
| Tables/forms | Accessible table/form components | Filter/sort/paginate efficiently |
| Email | Provider adapter (e.g. Resend) plus development outbox | Test password reset and invoice delivery safely |
| PDF invoices | Server-generated PDF with durable snapshot | Download/print issued invoices |
| Background tasks | Protected billing job endpoint invoked by an external scheduler; manual dev/demo trigger | Idempotent jobs without fragile in-request loops |
| Test suite | Vitest, Testing Library, Playwright, PostgreSQL integration tests | Unit, service, RBAC, end-to-end |
| Quality | ESLint, TypeScript strict, formatting, CI | Stable incremental work |

**Versions:** Pin compatible current stable package versions **when bootstrapping**; do not assume a specific release/version without checking actual package compatibility. Prefer a stack already established in the repo if equivalent.

### 4.2 Logical architecture

```mermaid
flowchart TD
  A[Admin browser] --> UI[Next.js UI]
  S[Staff browser] --> UI
  C[Customer browser] --> UI
  UI --> API[Authenticated Route Handlers / Server Actions]
  API --> AUTH[Authentication & RBAC]
  API --> SERVICES[Domain Services]
  SERVICES --> DB[(PostgreSQL / Prisma)]
  SERVICES --> BILL[Pure Billing / Discount / Tax Engine]
  SERVICES --> AUDIT[Audit Service]
  SERVICES --> MAIL[Email Adapter]
  SERVICES --> DOC[Invoice PDF Generator]
  JOB[Authenticated Scheduler] --> WORKER[Billing Job Processor]
  WORKER --> SERVICES
  SCAN[Integrity Scan Service] --> BILL
  SIM[Time Machine Simulation] --> BILL
  SCAN --> DB
  SIM --> DB
```

### 4.3 Architectural boundaries

- UI components **never** perform authoritative monetary calculations or authorization decisions; they only preview service results.
- Route handlers perform authentication, RBAC, schema validation, input/output mapping, and delegate to domain services.
- Domain services own transactions, state transitions, audit events, and database effects.
- Pure engines accept snapshots + an `asOfDate`, return deterministic results and explanations, and do not access the DB. Reuse the same engine for real invoice generation, preflight checks, and Time Machine.
- Database has durable constraints for unique emails, subscription numbers, invoice numbers, billing-cycle idempotency, references, and immutability rules where feasible.
- No frontend route should directly use a database service-role credential.
- Worker authentication uses a secret/signed scheduler mechanism and internal allowlist/rate limit; never expose a public “run billing for everyone” endpoint.

### 4.4 Suggested repository layout

```text
brightloop/
  app/
    (auth)/login/ signup/ forgot-password/ reset-password/
    (admin)/admin/{dashboard,staff,products,plans,taxes,discounts}/
    (staff)/workspace/{dashboard,customers,templates,quotes,subscriptions,invoices,payments,integrity,simulator}/
    (customer)/portal/{overview,subscriptions,invoices,profile}/
    api/
      auth/[...all]/
      v1/{products,variants,plans,customers,quotation-templates,subscriptions,invoices,payments,dashboard,integrity,simulations}/
      internal/billing/run/
  components/
    ui/  layout/  data-table/  finance/  invoice/  integrity/  simulation/
  lib/
    auth/  db/  validation/  permissions/  money/  dates/  email/  errors/  observability/
  server/
    services/{catalog,plans,quotes,subscriptions,billing,invoices,payments,discounts,taxes,reporting,integrity,simulations}/
    repositories/
    jobs/
  domain/
    billing/{calculate,dates,discounts,taxes,proration,types,explanations}/
    lifecycle/{subscription-state,invoice-state}/
    integrity/{rules,types}/
  prisma/
    schema.prisma  migrations/  seed.ts
  tests/
    unit/  integration/  e2e/  performance/
  docs/
    IMPLEMENTATION_STATUS.md  DECISIONS.md  API.md  DEMO_SCRIPT.md
  .env.example
  package.json
  README.md
```

This is a **target** layout, not a requirement to rewrite an existing repo.

### 4.5 Deployment and operational assumptions

- Single business **Brightloop**, not a white-label multi-tenant SaaS in v1.
- Default currency `INR` for illustrative/demo data, configurable business setting but **no multi-currency conversion** in v1. The PDF itself does not specify currency or statutory tax rate.
- Default business timezone `Asia/Kolkata`, configurable at the business setting level; persist events as UTC timestamps and billing schedule as business-local dates. Currency/timezone in the demo are assumptions, not PDF requirements.
- Postgres in local Docker or hosted dev database. Migrations tracked in version control.
- External scheduler invokes the protected billing job at least daily (business-local early morning) and retries failures. Do not depend on open web requests or users visiting a page to run billing.
- Email adapter has dev/test “outbox” mode so forgotten-password and invoice emails are inspectable without real bulk delivery.
- Separate demo credentials only in a private fixture/readme or local seed output; no hard-coded shared default password in production code.

---

## 5. DATA MODEL — CANONICAL ENTITY SPECIFICATION

### 5.1 Conventions

- All primary keys: UUID or stable string ID with DB-generated default.
- All tables: `id`, `createdAt`, `updatedAt` where relevant.
- All prices and monetary totals: PostgreSQL `DECIMAL(18,2)` exposed as Decimal/string in JSON (never JS `number` as authority). Percentage rates: `DECIMAL(9,4)` or basis points; round only at designated points using **ROUND_HALF_UP** to currency minor units. Reject invalid negative monetary values unless a well-defined adjustment record supports them.
- All amount-bearing records have `currency` even if v1 permits only `INR`; reject mixing currencies in one invoice.
- Billing schedule fields (`startOn`, `expiryOn`, `nextBillingOn`, `periodStartOn`, `periodEndExclusive`) are **date-only**, business-local `YYYY-MM-DD`; audit timestamps `DateTime` UTC. Do not convert date-only business rules through browser-local time.
- Prefer `deletedAt`/`isArchived` for catalogs; never cascade-delete historical invoices, customers with invoices, payments, or audit records.
- Include optimistic concurrency version (`version`) on mutable subscriptions/quotes if appropriate.
- Database constraints and unique indexes are required in addition to application-side validation.

### 5.2 Entity inventory and minimum fields

**AuthUsers** (auth library-managed, extended): `id`, `email` (normalized unique), `passwordHash` or library-owned credentials, `role` (ADMIN|STAFF|CUSTOMER), `name`, `emailVerifiedAt` if enabled, `createdAt`, `updatedAt`, `disabledAt`. Auth-library session/account/reset tables maintained using the library schema. Never expose password hashes. Signup always creates CUSTOMER; only ADMIN may create STAFF via protected flow. ADMIN bootstrap created by an explicit secure seed/CLI procedure.

**CustomerProfiles:** `id`, `userId` (unique FK), `companyName`, `contactName`, `billingEmail`, `billingAddress` (optional structured fields), `taxIdentifier` (optional), `status`. A customer can own multiple subscriptions. For invited enterprise accounts, an authorized staff-created profile may be `INVITED`, then linked to a verified user. No multi-user company teams in v1.

**Products:** `id`, `sku` (unique), `name`, `type`, `salesPrice`, `costPrice`, `currency`, `notes`, `isActive`. Product prices are catalog defaults; historic pricing is snapshotted.

**ProductVariants:** `id`, `productId`, `attributeName` (e.g. brand), `value` (e.g. Odoo), `priceDelta` (positive, zero, or negative if intentionally supported), `isActive`, unique `(productId, attributeName, value)`. Example delta `560.00`.

**Plans:** `id`, `code` (unique), `name`, `baseProductId`, `recurringUnitPrice`, `currency`, `frequency` (DAILY|WEEKLY|MONTHLY|YEARLY), `intervalCount` (default 1; v1 UI supports 1), `minBaseQuantity` >=1, `availableFrom`, `availableUntil` (nullable, inclusive), `autoCloseAtExpiry` boolean, `allowEarlyClose` boolean, `allowPause` boolean, `allowRenew` boolean, `isActive`, `description`. **Important pricing decision:** plan recurring price is the base subscription-line price; do NOT bill both product catalog sales price and plan recurring price for the same base line. Product catalog sales price is a starting/reference price; plan price overrides for subscriptions on that plan. Variant deltas are additive. Add-on products use catalog price snapshotted on agreement.

**TaxRules:** `id`, `name`, `code`, `ratePct`, `effectiveFrom`, `effectiveUntil`, `isActive`, `scope` (e.g. all products or set of products), `createdByUserId`. Assume one applicable effective tax rule per line in v1; reject ambiguous overlapping rules and provide a per-line zero-tax/default choice. Avoid country-specific tax claims.

**DiscountRules:** `id`, `code`, `name`, `kind` (FIXED|PERCENT), `amountOrPercent`, `scope` (SUBSCRIPTION|PRODUCTS), `minPurchaseAmount` nullable, `minQuantity` nullable, `validFrom`, `validUntil`, `maxUses` nullable, `usesConsumed` integer default 0, `isActive`, `createdByUserId`. `DiscountRuleProducts` join table connects product-scoped rules to allowed products. Percent between 0 and 100, fixed >=0, validity dates consistent, `usesConsumed <= maxUses` when specified. Definition of "use": **one confirmed invoice consuming the rule**.

**QuotationTemplates:** `id`, `name`, `planId`, `validityDays` positive int, `defaultPaymentTermDays`, `notes`, `isActive`, `createdByUserId`. `QuotationTemplateLines`: `id`, `templateId`, `productId`, `variantId` nullable, `kind` (BASE|ADDON), `quantity`, `unitPriceOverride` nullable. Exactly one BASE line per actual subscription; template suggestions may be edited before quote is offered.

**Subscriptions:** `id`, `subscriptionNumber` unique (e.g. `SUB-2026-000123` via safe sequence), `customerId`, `planId`, `status` (DRAFT|QUOTATION|CONFIRMED|ACTIVE|PAUSED|CLOSED), `startOn`, `expiryOn` nullable (inclusive), `nextBillingOn`, `billingAnchorDay` nullable, `quoteIssuedOn`, `quoteValidUntil`, `confirmedAt`, `activatedAt`, `pausedAt`, `closedAt`, `closedReason`, `paymentTermDays`, `currency`, `acceptedQuoteSnapshotJson`, `createdByUserId`, `version`. **PAUSED is an extra operational status** to satisfy the PDF's pause capability; the five primary phases are those listed in the PDF. Archive cancellation/renewal events separately in audit logs.

**SubscriptionLines:** `id`, `subscriptionId`, `kind` (BASE|ADDON), `productId`, `variantId` nullable, `productNameSnapshot`, `variantNameSnapshot`, `quantity` integer >=1, `unitBasePriceSnapshot`, `variantDeltaSnapshot`, `unitPriceSnapshot`, `taxRuleId` nullable, `taxRateSnapshot` or live rule selection at invoice time, `isActive`. Store the agreed commercial price; catalog updates never silently reprice existing subscriptions. At least one BASE line, and base quantity >= plan minimum.

**Invoices:** `id`, `invoiceNumber` unique, `subscriptionId`, `customerId`, `status` (DRAFT|CONFIRMED|PAID|CANCELLED), `periodStartOn`, `periodEndExclusive`, `billingDate`, `issuedAt`, `dueOn`, `currency`, `subtotal`, `discountTotal`, `taxTotal`, `grandTotal`, `amountPaid`, `balanceDue`, `discountRuleId` nullable, `discountSnapshotJson`, `billingEngineVersion`, `calculationSnapshotJson`, `pdfStorageKey` nullable, `sentAt` nullable, `cancelledAt` nullable, `cancellationReason`, `createdAt`. Unique `(subscriptionId, periodStartOn)` **regardless of invoice status** to prevent duplicate historical charges; to replace a canceled invoice, require an explicit authorized replacement workflow with revision/supersession rather than silently inserting another same-cycle bill. MVP may disallow reissuing a canceled cycle until this workflow is implemented.

**InvoiceLines:** `id`, `invoiceId`, `subscriptionLineId` nullable, `descriptionSnapshot`, `quantity`, `baseUnitPriceSnapshot`, `variantDeltaSnapshot`, `effectiveUnitPrice`, `grossAmount`, `discountAllocated`, `taxableAmount`, `taxRateSnapshot`, `taxAmount`, `lineTotal`, `taxRuleId` nullable. Sum of line totals must equal invoice grand total; invoice header components must reconcile exactly.

**DiscountRedemptions:** `id`, `discountRuleId`, `invoiceId` unique, `consumedAt`, `amount`, `status` (ACTIVE|RELEASED), `releasedAt` nullable. Record a redemption **only on confirming an invoice**. A canceled unpaid confirmed invoice may release redemption as a separately audited action, subject to policy. Draft invoices show proposed discount without consuming its cap. Use a transactional lock/update when confirming invoices to enforce global max-use limits under concurrency.

**Payments:** `id`, `invoiceId`, `customerId`, `amount` positive Decimal, `currency`, `method` (UPI|BANK_TRANSFER|CARD|CASH|OTHER as informational record), `paidAt`, `note`, `externalReference` nullable, `recordedByUserId`, `isReversed` boolean, `reversedAt`, `reversalReason`. These are **payment records**, not actual gateway charges. Duplicate reference protection when a reference is present; don't count reversed payments. Never delete a payment that has been used in reporting.

**BillingRuns:** `id`, `trigger` (SCHEDULED|MANUAL|DEMO), `startedAt`, `finishedAt`, `status`, `asOfDate`, `scannedCount`, `createdCount`, `skippedCount`, `errorCount`, `initiatedByUserId` nullable, `summaryJson`, `errorSummary`. Log failed and successful processing. Consider a `BillingRunItems` table: `runId`, `subscriptionId`, `periodStartOn`, `outcome`, `errorCode`, `invoiceId`, for precise audit and debugging.

**AuditLogs:** `id`, `actorUserId` nullable, `actorType` (USER|SYSTEM), `action`, `entityType`, `entityId`, `beforeJson` redacted, `afterJson` redacted, `reason`, `correlationId`, `createdAt`. Append-only API policy. Do not store secrets, reset tokens, payment credentials, or unnecessary personal data.

**IntegrityScans:** `id`, `requestedBy`, `scopeJson`, `asOfDate`, `startedAt`, `finishedAt`, `status`, `findingCount`. **IntegrityFindings:** `id`, `scanId`, `ruleCode`, `severity` (INFO|WARNING|BLOCKER), `entityType`, `entityId`, `customerId` nullable, `invoiceId` nullable, `description`, `evidenceJson`, `suggestedAction`, `estimatedImpact` nullable, `status` (OPEN|ACKNOWLEDGED|RESOLVED|FALSE_POSITIVE), `resolutionAuditId` nullable.

**SimulationRuns (P1):** `id`, `requestedByUserId`, `createdAt`, `asOfDate`, `horizonMonths`, `scenarioJson`, `resultJson`, `status`. Simulation writes **only** to simulation metadata/result storage and audit; it does not create/edit real invoices, payments, subscription statuses, next-billing dates, or discount uses.

**EmailDeliveries:** `id`, `template`, `recipient`, `subject`, `entityId`, `status`, `providerMessageId`, `sentAt`, `lastError`; no password-reset token or sensitive body persisted in generic logs. Dev outbox can store safe test details separately.

**Optional imports (P2):** `ImportJobs` and `ImportRows` store spreadsheet headers, mapping, errors, proposed normalized records, decision history, and final commit outcome. Provide bounded retention.

### 5.3 Relationship sketch

```mermaid
erDiagram
  AUTH_USER ||--o| CUSTOMER_PROFILE : owns
  CUSTOMER_PROFILE ||--o{ SUBSCRIPTION : subscribes
  PLAN ||--o{ SUBSCRIPTION : selected_by
  PRODUCT ||--o{ PRODUCT_VARIANT : has
  PRODUCT ||--o{ SUBSCRIPTION_LINE : referenced_by
  SUBSCRIPTION ||--|{ SUBSCRIPTION_LINE : includes
  SUBSCRIPTION ||--o{ INVOICE : generates
  INVOICE ||--|{ INVOICE_LINE : contains
  INVOICE ||--o{ PAYMENT : receives
  DISCOUNT_RULE ||--o{ DISCOUNT_REDEMPTION : consumed_by
  INVOICE ||--o| DISCOUNT_REDEMPTION : redeems
  INTEGRITY_SCAN ||--o{ INTEGRITY_FINDING : identifies
```

### 5.4 Required DB constraints/indexes

- Unique normalized user email (`lower(trim(email))` semantics), product SKU, plan code, subscription number, invoice number, variant combination.
- Unique invoice `(subscriptionId, periodStartOn)`; unique redemption `invoiceId` in a single-discount MVP. The DB, not only the worker code, owns duplicate prevention.
- Index `subscriptions(status, nextBillingOn)`, `subscriptions(customerId, status)`, `subscriptions(planId, status)`, `invoices(customerId, status, dueOn)`, `invoices(subscriptionId, periodStartOn DESC)`, `payments(invoiceId, paidAt)`, `integrity_findings(status, severity)`, `audit_logs(entityType, entityId, createdAt)`.
- Foreign keys on all relationships; `NOT NULL` for essential fields; check nonnegative money and positive quantities; check `expiryOn >= startOn`, `availableUntil >= availableFrom`, `dueOn >= issued date` where relevant.
- Prevent mutable historical invoice money/line fields after confirmation using service-level restrictions and, if practical, DB guardrails. Alterations after issuing require a documented cancellation/replacement or adjustment workflow, not overwriting history.
- Paginate large queries server-side; no `findMany()` over every invoice/subscription for one dashboard page.

---

## 6. SUBSCRIPTION AND INVOICE STATE MACHINES

### 6.1 Subscription transitions

```text
DRAFT -> QUOTATION -> CONFIRMED -> ACTIVE -> CLOSED
           |             |          |  ^
           |             |          v  |
           |             +-------> PAUSED
           |                        |
           +-- expire offer        +-- resume to ACTIVE
```

Allowed actions:

- `createDraft`: ADMIN/STAFF creates draft, valid customer+plan+lines; no invoice yet.
- `issueQuotation`: DRAFT→QUOTATION; calculate offer, set validity. Do not activate expired quote.
- `confirmQuotation`: QUOTATION→CONFIRMED; capture immutable accepted commercial terms and actor/time. If quote expired, reissue/refresh before confirmation.
- `activate`: CONFIRMED→ACTIVE; validate start/expiry dates, plan availability at start, min quantity; initialize `nextBillingOn`/anchor. Only ACTIVE subscriptions are billable.
- `pause`: ACTIVE→PAUSED only if `plan.allowPause`, subject to authorization; stop future invoice generation; issued invoices remain outstanding and unchanged.
- `resume`: PAUSED→ACTIVE if permitted; **v1 decision:** resume starts a new billing cycle anchored on the resume date; skipped paused cycles are not billed retroactively. This policy must be shown in UI and audited.
- `closeEarly`: ACTIVE/PAUSED→CLOSED if `plan.allowEarlyClose`; stop future billing. Past confirmed invoices are unchanged; any refunds/credits are out of v1 scope and must not be fabricated.
- `renew`: ACTIVE/PAUSED/eligible expired subscription with `plan.allowRenew`; extend expiry and log previous/new terms; keep accepted price unless a new quote explicitly agrees to reprice.
- `expire`: scheduler stops billing at end of term (end exclusive). If `plan.autoCloseAtExpiry=true`, move to CLOSED. If false, keep an `expiredNeedsReview` derived flag and mark it non-billable; exclude expired records from active KPI until resolved. A renewal/closure action resolves it.
- CLOSED is terminal in v1. Reactivation requires a new subscription or an explicitly designed renewal workflow, not direct mutation of history.

**Plan availability vs subscription term:** `availableFrom/Until` restrict when the plan can be selected or newly activated; it does NOT retroactively terminate subscriptions already sold. `expiryOn` is the individual subscription's last covered calendar date. The PDF does not dictate this distinction; it is an explicit business decision.

### 6.2 Invoice transitions

```text
DRAFT -> CONFIRMED -> PAID
  |          |
  +------> CANCELLED
             (only if unpaid; otherwise audited exception process)
```

- Draft: previewable internally, editable only by regenerating from authorized data/service, not arbitrary client-supplied totals; customer portal hides drafts.
- Confirm: run current preflight on draft and atomic discount-cap check, freeze amounts/snapshots, assign `issuedAt`, compute due date, mark CONFIRMED, generate a stable PDF snapshot.
- Send: email a confirmed/paid invoice only. Sending is an audited delivery action, not a monetary status transition. Resend is safe/idempotent with delivery history.
- Print: render/download the same confirmed invoice PDF; draft preview must be visibly marked DRAFT.
- Payment: record payment transaction. If sum of valid payments equals invoice total, mark PAID; if between zero and total, remain CONFIRMED with `partiallyPaid=true` derived UI status; overpayment prohibited.
- Cancel: allow DRAFT or unpaid CONFIRMED cancellation with audit reason. Disallow cancellation if valid payment exists until a documented reversal/credit process completes. Cancellation does not erase history.
- Overdue is **derived**, not an invoice lifecycle state: `balanceDue > 0 AND dueOn < businessToday AND status=CONFIRMED`.

### 6.3 State-transition invariants

- A customer cannot self-grant staff privileges or change anyone else's subscription.
- Only ACTIVE, in-term, policy-eligible subscriptions receive new invoices.
- An already confirmed invoice is read-only as to money/period/line items.
- Each invoice period belongs to one subscription and does not overlap its previous billable periods (unless explicitly modeled correction/reissue).
- No invoice may be marked PAID except with matching non-reversed recorded payments. No overpayment allowed.
- State changes create an audit event with an actor and reason.

---

## 7. PRICING, TAXES, DISCOUNTS, RECURRENCE — EXACT RULES

### 7.1 Chosen pricing rules

1. The BASE subscription line uses `plan.recurringUnitPrice` times quantity, adjusted by the selected variant's `priceDelta` per unit. Example: plan price 1,000 and Odoo variant +560 ⇒ effective BASE unit price 1,560.
2. Additional ADDON lines use the product's catalog sales price at quotation creation unless an authorized quote-specific override is offered; freeze those unit prices upon agreement. A product variant adds its configured delta.
3. For recurring cycles, bill agreed subscription line snapshots, **not** the current mutable catalog/plan list prices.
4. Quantity is a positive integer. Base quantity must meet plan minimum. Add-ons may be switched on/off through an authorized effective-dated subscription change; future invoices use the changed snapshots, past invoices remain unchanged.
5. v1 pricing amounts are tax-exclusive, in INR; explicitly label this policy in the UI.
6. If the agreed pricing is intentionally changed, record effective date, reason, authorizing user, and old/new snapshots. Recalculate only billing periods starting on/after the effective date; existing confirmed invoices remain immutable.

### 7.2 Discount selection policy (explicit design decision)

The PDF mandates eligible fixed and percentage discounts, min purchase/quantity, validity window, usage cap, and scope but does **not** specify how multiple discounts stack.

**v1 policy: at most ONE discount rule per invoice.** Evaluate all eligible rules by the invoice's `periodStartOn` and subscription/line data, calculate the benefit against the appropriate eligible pre-tax subtotal, and choose the rule giving the largest valid reduction; stable tie-break: earliest created rule then lexicographic rule ID. Show which rule applied and why others did not. This avoids ambiguous stacking and makes demo math auditable. Later optionally implement configurable stacking with explicit ordering and tests.

Eligibility checks, in order:

- Rule active; period start within inclusive `validFrom`/`validUntil` if set.
- Applicable product(s) or entire subscription; for product rules, sum only eligible lines.
- `minPurchaseAmount`: threshold based on eligible **pre-discount, tax-exclusive** amount.
- `minQuantity`: threshold based on total eligible line quantity (not unrelated add-ons).
- Max-use remaining (counts confirmed invoice redemptions, not draft previews).
- Flat discount `min(flatAmount, eligibleSubtotal)`, percent discount `eligibleSubtotal × rate/100`, rounded HALF_UP to 2 decimals; never reduce invoice net below zero.
- After discount chosen, allocate the total discount across eligible invoice lines **proportionally by gross amounts**, using a deterministic largest-remainder method so allocated amounts sum exactly to the discount total. Tax each line on its discounted amount.
- If validity or max uses changes between DRAFT calculation and confirmation, revalidate and, if the proposal is no longer valid, **block confirmation with a clear reason and require recalculation/review**; do not silently bill a different amount.
- Confirm consumes a discount use in the **same DB transaction** as invoice confirmation with an atomic cap check. Concurrent confirmations must not exceed `maxUses`.
- A confirmed invoice keeps its original discount snapshot even after the rule later expires.

### 7.3 Taxes

- Admin may create effective-dated tax rules and assign them to product lines according to the configured scope.
- Tax is calculated **after discounts** per line using its applicable snapshotted rate for the billing date; round each line's calculated tax to 2 decimal places with HALF_UP.
- v1 allows **one effective tax rate per invoice line**; if multiple tax rules overlap a line, flag configuration as an integrity error rather than silently summing rates.
- Tax-free/zero-rate lines are supported. Do not hardcode 18% globally; 18% is an illustrative seed/demo value only.
- Invoice subtotal = sum of gross line amounts; discountTotal = sum allocated discounts; taxable total = subtotal − discountTotal; taxTotal = sum line tax; grandTotal = subtotal − discountTotal + taxTotal. All identities must reconcile exactly.

### 7.4 Worked example (illustrative INR only)

- BASE plan unit rate: ₹1,000; quantity 1.
- Odoo variant delta: +₹560; base gross ₹1,560.
- Eligible invoice discount: 10% ⇒ ₹156 reduction.
- Taxable amount: ₹1,404.
- Demo tax rule: 18% ⇒ ₹252.72.
- Invoice grand total: **₹1,656.72**.

No double-counting of catalog product price. The demo tax rate is not a legal determination.

### 7.5 Billing frequency and date arithmetic

- Bill **in advance** at the start of each billing period; `billingDate = periodStartOn`, independent of job execution date.
- Supported frequencies: DAILY = +1 calendar day, WEEKLY = +7 calendar days, MONTHLY = +1 calendar month, YEARLY = +1 calendar year. Respect `intervalCount` if implemented, otherwise 1.
- Set an **anchor day** from activation date so monthly starts on Jan 31 produce periods Jan 31→Feb 28→Mar 31→Apr 30, not Feb 28→Mar 28 drift. For yearly Feb 29, non-leap years end on Feb 28, and leap-year anchor restores Feb 29 when possible.
- Persist boundaries as local `DATE`; periods are half-open `[periodStartOn, periodEndExclusive)`. `expiryOn` is inclusive; coverage ends on `expiryOn + 1 day`.
- For a subscription whose renewal date falls on a partial final cycle, **P0 conservative policy**: do not silently charge for days beyond the expiry. If period boundary exceeds coverage and automatic proration has not been implemented, mark a `PARTIAL_FINAL_PERIOD_REVIEW` blocking finding; staff must align contract dates or use the approved proration implementation. **P1 enhancement:** prorate the truncated final cycle by covered local calendar days / normal period days, with deterministic rounding and tests; clearly document this policy on invoices.
- No backbilling of PAUSED intervals; new anchor at resume date (v1 decision). A paused subscription's pre-existing invoice remains payable.
- Catch-up processing: if scheduler was offline, process **every due eligible billing period** in ascending order until caught up, limited per worker batch but resumed safely. Do not advance `nextBillingOn` past a cycle unless its invoice was committed or an explicit audited skip decision exists. Avoid automatically invoicing dates where the subscription was historically paused/closed; use status-history/audit events or effective-dated records when needed.
- `nextBillingOn` is a scheduler cursor, not proof of payment. Invoice generation/confirmation/payment are independent events.
- Schedule at a defined business-local time, e.g. 00:05 Asia/Kolkata, and document timezone conversion.

### 7.6 Payment and reporting arithmetic

- Payments are manual **recording of received money**, not calls to a gateway.
- `amountPaid = sum(non-reversed payments)`; `balanceDue = max(0, grandTotal − amountPaid)`. Prefer recomputing inside transaction and keeping stored summaries synchronized; tests must detect discrepancies.
- Payment can be partial; reject amount <=0, wrong currency, invoice CANCELLED/DRAFT, and amount greater than remaining balance. Duplicate external reference against same payment source should be rejected (if supplied).
- `cashCollected` = sum valid payments received in the selected date interval (cash metric, **not** accrued accounting revenue).
- `invoicedNetRevenue` = sum confirmed/paid invoice taxable net **excluding tax** for the chosen invoice issue interval; clearly label it billed net revenue, not recognized revenue.
- `totalBilledWithTax` is a separate metric. `outstanding` = sum unpaid balances of CONFIRMED invoices. `overdue` = subset with due date before today. `activeSubscriptions` = status ACTIVE, not paused, startOn<=today, unexpired.
- **Optional MRR estimate** = active subscription monthly-equivalent net price before tax, using: monthly ×1; yearly ÷12; weekly ×52/12; daily ×365/12. Label it an estimate; avoid claiming GAAP-standard recognized revenue. Respect a subscription's locked pricing/active discounts only if calculable. For v1 prioritize exact required metrics over MRR.

---

## 8. RECURRING BILLING JOB — RELIABLE IMPLEMENTATION

### 8.1 High-level billing algorithm

```text
runBilling(asOfBusinessDate, trigger):
  authorize internal scheduler or authenticated admin demo action
  create billing_run record
  page through subscriptions with billable due dates <= asOfBusinessDate
  for each subscription, in a transaction/retry-safe unit:
    lock subscription or claim its due period
    recheck ACTIVE + term + pause history + nextBillingOn
    compute period boundary from unchanging anchor and expiry
    if partial unsupported: emit explicit blocking finding; do not advance cursor
    compute preview with pure billing engine
    preflight mandatory invariant checks
    INSERT invoice with unique(subscriptionId, periodStartOn)
      if conflict: fetch existing invoice and mark this attempt "already processed"
    on successful invoice insert, advance nextBillingOn to next cycle
    write audit event and billing_run_item
  finish with precise created/skipped/errors counters
  return summary; make it safe to call again with same asOf date
```

### 8.2 Transaction and concurrency rules

- **Primary idempotency key:** `(subscriptionId, periodStartOn)` with a unique DB constraint. Never rely solely on `if not exists` reads; race windows exist.
- Use DB row locking/conditional update or transaction isolation adequate for concurrent workers; handle unique violations by reading the winning row rather than treating it as a double charge.
- Only advance the schedule cursor after invoice creation commits. If a transaction fails, leave the due date for retry.
- Give individual subscriptions independent error handling, so one bad record does not stop hundreds of others. Log errors by subscription and rule.
- Use a bounded batch size, e.g. 100–250 subscriptions per claim, with resume/cursor/pagination strategy (avoid offset pagination for changing due sets).
- Job-run record and observability counters are necessary; an admin can see failures and retry safely.
- Worker should not send invoice email within the DB transaction. Sending is an outbox/after-commit operation with retries and delivery IDs.
- Never let a developer-facing manual trigger create *real* future bills; future dates go through Time Machine's pure simulator.

### 8.3 Crash and retry test cases

1. Call billing job twice same day; exactly one invoice per subscription/period.
2. Start two worker executions concurrently; no duplicate invoices, no skipped dates.
3. Throw before commit; cursor and invoice remain unchanged; retry succeeds.
4. Throw after invoice commit but before response; retry finds existing invoice.
5. Simulate scheduler outage spanning several cycles; catch-up generates all eligible periods exactly once.
6. Pause/resume and expiry boundaries do not generate invalid bills.
7. One malformed subscription appears as a finding/error; unrelated subscriptions still bill.
8. Re-running after invoice cancellation does not silently issue an unapproved replacement.

---
## 9. REST API / SERVER CONTRACTS

Use Next.js route handlers under `/api/v1` (or typed server actions for internal-only UI where appropriate) with an explicit service layer. Keep all authorization checks on the server. JSON response monetary amounts as decimal **strings**, not unsafe floating point numbers. Dates as `YYYY-MM-DD`; audit timestamps in ISO 8601 UTC.

### 9.1 Standard conventions

```json
{
  "data": { "id": "uuid", "grandTotal": "1656.72", "currency": "INR" },
  "meta": { "requestId": "uuid" }
}
```

```json
{
  "error": {
    "code": "BILLING_CYCLE_ALREADY_INVOICED",
    "message": "An invoice already exists for this subscription and billing period.",
    "details": { "subscriptionId": "uuid", "periodStartOn": "2026-11-01" },
    "requestId": "uuid"
  }
}
```

- Use correct HTTP errors: 400 bad request, 401 unauthenticated, 403 unauthorized, 404 not found/hidden resource, 409 business-state/uniqueness conflict, 422 invalid business input, 429 rate-limited, 500 unexpected server error.
- Pagination: `pageSize` max 100 (default 25), opaque cursor preferred for large data, sort options on indexed keys. Return `nextCursor`/count where cost-effective. Do not return all records for dashboards.
- Filters validated: date ranges, status, planId, customerId, due/overdue flags, search query with bounded length.
- Mutations use optimistic version checks or idempotency keys where needed; return stable machine-readable error codes.
- All business requests are scoped to authenticated role, and customer lookups derive `customerId` from the session (not an untrusted query field).
- Document actual implemented endpoints in `docs/API.md` and test their contracts.

### 9.2 Minimum endpoint inventory

| Method / path | Role | Purpose |
|---|---|---|
| `POST /api/v1/auth/signup` (or library route) | Public | Unique email, password policy, CUSTOMER creation |
| `POST /api/v1/auth/forgot-password` | Public | Generic response, enqueue one-time reset email |
| `POST /api/v1/auth/reset-password` | Token holder | Consume token and update password securely |
| `GET /api/v1/me` | All authenticated | Current role and scoped profile |
| `POST /api/v1/staff` | ADMIN | Create/invite STAFF; reject attempts to create ADMIN |
| `GET /api/v1/staff` | ADMIN | Staff directory |
| `GET,POST /api/v1/products` | ADMIN (write), STAFF (read) | Product list/create |
| `GET,PATCH /api/v1/products/:id` | ADMIN (write), STAFF (read) | Detail/update/archive |
| `POST /api/v1/products/:id/variants` | ADMIN | Variant with additive delta |
| `GET,POST /api/v1/plans` | ADMIN (write), STAFF (read), CUSTOMER (public active list if offered) | Plan catalog |
| `GET,PATCH /api/v1/plans/:id` | ADMIN (write) | Plan and policy changes |
| `GET,POST /api/v1/tax-rules` | ADMIN write; STAFF read | Tax configuration |
| `GET,POST /api/v1/discount-rules` | ADMIN write; STAFF read | Discount policy and caps |
| `GET,PATCH /api/v1/discount-rules/:id` | ADMIN write | Rules and validity |
| `GET,POST /api/v1/customers` | ADMIN/STAFF | Search and invite customer profiles |
| `GET /api/v1/customers/:id` | ADMIN/STAFF or owning CUSTOMER | Details with scoped data |
| `GET,POST /api/v1/quotation-templates` | ADMIN/STAFF | Reusable sales templates |
| `GET,POST /api/v1/subscriptions` | ADMIN/STAFF (customer can GET own through portal) | Create/list subscriptions |
| `GET /api/v1/subscriptions/:id` | ADMIN/STAFF or owner | Detail and history |
| `POST /api/v1/subscriptions/:id/issue-quote` | ADMIN/STAFF | DRAFT→QUOTATION |
| `POST /api/v1/subscriptions/:id/confirm` | ADMIN/STAFF | QUOTATION→CONFIRMED |
| `POST /api/v1/subscriptions/:id/activate` | ADMIN/STAFF | CONFIRMED→ACTIVE |
| `POST /api/v1/subscriptions/:id/pause` | ADMIN/STAFF or owner, policy | ACTIVE→PAUSED |
| `POST /api/v1/subscriptions/:id/resume` | ADMIN/STAFF or owner, policy | PAUSED→ACTIVE |
| `POST /api/v1/subscriptions/:id/close` | ADMIN/STAFF or owner, policy | Early close / policy decision |
| `POST /api/v1/subscriptions/:id/renew` | ADMIN/STAFF or owner, policy | Extend term; quote approval if repricing |
| `GET /api/v1/subscriptions/:id/quote-preview` | ADMIN/STAFF or owner | Read-only proposed calculation |
| `GET /api/v1/invoices` | ADMIN/STAFF; CUSTOMER own via scoped query | Invoice list and filters |
| `GET /api/v1/invoices/:id` | ADMIN/STAFF or owner | Invoice snapshot |
| `POST /api/v1/invoices/:id/confirm` | ADMIN/STAFF | Preflight and discount redemption |
| `POST /api/v1/invoices/:id/cancel` | ADMIN/STAFF | Unpaid cancellation with reason |
| `POST /api/v1/invoices/:id/send` | ADMIN/STAFF | Email issued invoice |
| `GET /api/v1/invoices/:id/pdf` | ADMIN/STAFF or owner if issued | Stable printable PDF |
| `GET /api/v1/invoices/:id/explanation` | ADMIN/STAFF or owner if issued | Charge breakdown and change reasons |
| `GET,POST /api/v1/payments` | ADMIN/STAFF (customer no write) | Payment list/record |
| `POST /api/v1/payments/:id/reverse` | ADMIN; STAFF only if explicitly permitted | Controlled audited reversal |
| `GET /api/v1/dashboard/summary` | ADMIN/STAFF | KPI data using filters |
| `GET /api/v1/dashboard/revenue-series` | ADMIN/STAFF | Time-bucketed payments/billed net |
| `GET /api/v1/dashboard/overdue` | ADMIN/STAFF | Drill-down paginated invoices |
| `POST /api/v1/integrity/scans` | ADMIN/STAFF | Create preflight scan |
| `GET /api/v1/integrity/scans/:id` | ADMIN/STAFF | Scan summary/findings |
| `GET /api/v1/integrity/findings` | ADMIN/STAFF | Filter findings |
| `POST /api/v1/integrity/findings/:id/resolve` | Authorized staff/admin | Approve safe remediation / mark handled |
| `POST /api/v1/simulations` | ADMIN/STAFF | Run side-effect-free what-if scenario |
| `GET /api/v1/simulations/:id` | ADMIN/STAFF | Scenario result and warnings |
| `GET /api/v1/billing-runs` | ADMIN/STAFF | Audit jobs, failures, batch counts |
| `POST /api/internal/billing/run` | Internal scheduler only | Authenticated job with controlled `asOfDate` |
| `POST /api/v1/demo/billing-run` | ADMIN, non-production demo mode only | Trigger billing for **today**, not arbitrary future date |

**Avoid endpoint proliferation if equivalent secure server actions are simpler.** The table is a functional contract, not a requirement to expose dozens of unrelated public APIs. Protected internal mutation routes must not be callable by customers.

### 9.3 Key request examples

**Create product**

```json
{
  "sku": "BUSINESS-SW",
  "name": "Business Software",
  "type": "SOFTWARE",
  "salesPrice": "1000.00",
  "costPrice": "400.00",
  "currency": "INR",
  "notes": "Illustrative SaaS product"
}
```

**Create plan**

```json
{
  "code": "MONTHLY-BUSINESS",
  "name": "Monthly Business",
  "baseProductId": "product-uuid",
  "recurringUnitPrice": "1000.00",
  "frequency": "MONTHLY",
  "minBaseQuantity": 1,
  "availableFrom": "2026-11-01",
  "availableUntil": null,
  "autoCloseAtExpiry": true,
  "allowEarlyClose": true,
  "allowPause": true,
  "allowRenew": true
}
```

**Create subscription from accepted quotation template**

```json
{
  "customerId": "customer-uuid",
  "planId": "plan-uuid",
  "quotationTemplateId": "template-uuid",
  "startOn": "2026-11-01",
  "expiryOn": "2027-10-31",
  "paymentTermDays": 7,
  "lines": [
    { "kind": "BASE", "productId": "product-uuid", "variantId": "variant-uuid", "quantity": 1 },
    { "kind": "ADDON", "productId": "addon-uuid", "quantity": 2 }
  ]
}
```

**Record payment**

```json
{
  "invoiceId": "invoice-uuid",
  "amount": "1656.72",
  "method": "UPI",
  "paidAt": "2026-11-05T10:45:00.000Z",
  "externalReference": "demo-payment-001",
  "note": "Manually verified receipt"
}
```

**Error security rule:** validation must reject client-provided `grandTotal`, `amountPaid`, `nextBillingOn`, `createdBy`, arbitrary customer ownership, or desired `status` in ordinary mutations. These are server-controlled.

---

## 10. USER INTERFACE SPECIFICATION

### 10.1 Global design

- Professional B2B financial workspace, not a marketing-only SaaS clone. Clear typography, restrained palette, consistent spacing, accessible contrast, meaningful empty/error/loading states, keyboard-accessible forms and data tables.
- Desktop-first admin/staff experience; fully usable responsive customer portal on mobile.
- Navigation: collapsible sidebar on desktop; mobile menu; breadcrumb/title/action header; role-specific links; avatar/profile/logout.
- Search, filter, paginate, sort without loading whole datasets; preserve filters in URL where possible.
- Money formatting with currency and locale, date formatting in configured business timezone, explicit tax-inclusive/exclusive labels.
- Confirmation dialogs for irreversible/high-impact actions; disabled controls explain why a role/policy forbids action.
- Financial status badges only for meaningful states: Active, Paused, Draft, Confirmed, Paid, Overdue, Cancelled, Blocked; do not rely on color alone.
- All writes provide success/failure feedback from the server. No decorative buttons masquerading as working features.

### 10.2 Route/page inventory and contents

**Public/auth**

- `/login`: email/password, validation, forgot password, signup link, generic invalid credentials errors.
- `/signup`: unique email, company/name, password strength requirements, customer creation.
- `/forgot-password`: email input with nondisclosing success response.
- `/reset-password`: signed token, validation, one-time redemption, expired-token feedback.
- `/403`, `/404`: accessible authorization and not-found pages.

**Admin**

- `/admin/dashboard`: finance KPIs, subscription status distribution, recent billing runs, open integrity findings, quick links.
- `/admin/staff`: staff list, invite/create, enable/disable, audit role changes.
- `/admin/products`: searchable catalog table (SKU, type, prices, variants, status), create/edit product, variant editor (`Odoo +₹560` demo).
- `/admin/plans`: plan cards/table, frequency, recurring unit price, minimum quantity, availability, pause/early-close/renew/auto-close policy toggles; plan preview.
- `/admin/taxes`: effective-dated tax rules, scope, conflict warnings.
- `/admin/discounts`: active/expired/capped rules, scoped products, threshold details, usage counter, eligibility preview.

**Staff operations**

- `/workspace/dashboard`: total active, cash collected, invoiced net revenue, outstanding, overdue count/amount, filters and interactive drill-down.
- `/workspace/customers`: search and filter customers, customer detail and linked subscriptions, invite flow.
- `/workspace/quotation-templates`: create/edit reusable default lines and validity.
- `/workspace/quotes`: list quotes, create from template, validity countdown, preview, issue, confirm; rejected/expired offer explanation.
- `/workspace/subscriptions`: paginated list with number, customer, plan, status, next billing, expiry; detail timeline; line items; authorized actions; next invoice preview.
- `/workspace/invoices`: Draft/Confirmed/Paid/Cancelled tabs; due/overdue filters; single and bulk confirmation with preflight; send/print/PDF actions; itemized detail/history.
- `/workspace/payments`: received payment table, record payment with invoice lookup, amount remaining, note, verified method; guarded reversal.
- `/workspace/billing-runs`: run history, counts, failed jobs, per-subscription errors, safe retry.
- `/workspace/integrity`: BillGuard scan controls, open blockers/risks, filters by rule/severity, details drawer with evidence, proposed correction, approve/recheck actions.
- `/workspace/simulator`: date horizon and scenario inputs, future invoice preview, monthly billed totals, exception list, exact "SIMULATION — no live records changed" banner.

**Customer**

- `/portal/overview`: current plan, next billing date/amount, status, recent confirmed bills, support context.
- `/portal/subscriptions`: own subscription list/detail, products/add-ons/discounts, terms, policy-controlled pause/resume/renew/early-close actions with transparent effects.
- `/portal/invoices`: only issued/paid invoices, due/paid status, PDF, Explain My Bill, compare prior cycle.
- `/portal/profile`: own name/company/contact/email where allowed; no role control.

### 10.3 Important UI interactions

**Plan form:** frequency dropdown, price Decimal string, date pickers, min quantity numeric input, explicit policy toggles; changing plan catalog pricing alerts that existing agreed subscriptions will not be silently repriced.

**Quote builder:** choose template, edit allowed lines and quantities, show variant deltas, eligible discounts, taxes, quote expiry, totals. Save, issue, confirm; cannot activate an expired quotation without explicit renewal.

**Subscription detail:** timeline (Draft/Quotation/Confirmed/Active/Paused/Closed), next billing and expiry, read-only accepted offer snapshot, itemized lines, lifecycle controls, payment term, invoice list.

**Invoice detail:** frozen header and bill-to snapshot, billing period, line math, discount rule snapshot, tax breakdown, paid/balance, payment ledger, send history, PDF, exact explanation, previous invoice comparison.

**Integrity finding drawer:** rule ID; severity; impacted entity/period; expected vs observed, reason and evidence; potential exposure only where defensibly calculable; one or more remediation options; permission check; audit history; re-scan result.

**Simulation results:** live-vs-simulated view, total projected bills by month, active/expired counts, blocked anomalies, list of hypothetical invoices; never mix hypothetical totals into live revenue charts.

### 10.4 Accessibility and UX requirements

- Labels, required-field messages, descriptive error text, ARIA for dialogs, keyboard navigation, focus management, not color-only indicators.
- Currency aligned numerically; inline explanation for every computed number.
- Loading/skeleton states for large lists; empty states describe next action.
- Confirmation screens for pause/close and financial adjustments; dates and monetary consequences visible before submission.

---

## 11. BILLGUARD — P1 DIFFERENTIATOR (DEEP SPEC)

### 11.1 Value proposition

BillGuard checks scheduled/preview/draft billing **before money claims reach the customer**, so errors are visible and correctable. It must be **rules-first**, with deterministic evidence and outcomes, not vague AI scoring. Show expected rule, observed mismatch, severity, and safe next action. Support on-demand full scan and per-invoice preflight.

### 11.2 Integrity rule catalog

| Rule code | Severity | Trigger / deterministic detection | Action |
|---|---|---|---|
| `BI-001_DUPLICATE_CYCLE` | BLOCKER | Existing invoice for `(subscriptionId, periodStartOn)` or attempted duplicate creation | Reject new bill; surface existing invoice and event |
| `BI-002_MISSING_DUE_INVOICE` | WARNING | Eligible period due by `asOfDate`, but no invoice and no approved skip | Queue safe catch-up; log reason if blocked |
| `BI-003_NONBILLABLE_SUBSCRIPTION` | BLOCKER | Billing attempted for paused, closed, pre-start, or expired subscription | Block; show lifecycle evidence |
| `BI-004_INVALID_DISCOUNT` | BLOCKER | Draft includes discount invalid on period date, out of scope, below threshold, or exhausted | Request draft recalculation/review |
| `BI-005_TOTAL_MISMATCH` | BLOCKER | Header subtotal, discount, tax, total do not reconcile to line math under snapshotted rules | Block confirmation; recompute using pure engine |
| `BI-006_QUOTE_MISMATCH` | BLOCKER | Draft/first invoice product, quantity, agreed unit price, or effective variant differs from accepted quotation without approved effective-dated change | Require staff-approved agreement correction |
| `BI-007_INVALID_TAX_CONFIGURATION` | BLOCKER | Overlapping tax rules, missing mandatory selection, or a line's rate differs from valid rule snapshot | Fix configuration or inspect snapshot policy |
| `BI-008_PAYMENT_LEDGER_MISMATCH` | WARNING/BLOCKER | Payment sums differ from stored paid/balance or paid invoice has nonzero balance | Investigate transaction; never edit silently |
| `BI-009_PARTIAL_PERIOD_REVIEW` | BLOCKER | Final bill period extends beyond subscription term and no approved proration/terms policy exists | Correct expiry/activate proration flow |
| `BI-010_UNEXPECTED_PRICE_CHANGE` | WARNING | Draft pricing changed from last agreed rate without approved agreement amendment | Review and approve only future effect |
| `BI-011_DISCOUNT_CAP_RACE` | BLOCKER | Rule was eligible in preview but max uses reached before confirmation | Recalculate draft or choose authorized alternative |
| `BI-012_EXPIRED_QUOTE` | BLOCKER | Attempt to confirm an expired quotation | Reissue quote with new validity |

**Nuance:** a price change can be legitimate if an approved effective-dated amendment exists; a payment-record reversal can legitimately change balances. The engine must consider documented events before labeling a mismatch.

### 11.3 Scan lifecycle

1. User selects all due / plan / customer / billing cycle or a specific invoice.
2. Scan reads a consistent snapshot of relevant records; job stores `started`, `finished`, and rule version.
3. Pure rule functions produce findings with: unique fingerprint (`ruleCode`, entity, cycle), current status, evidence (observed/expected), impact estimate if exact, recommended resolution.
4. Deduplicate existing open findings by fingerprint; re-scan can mark resolved when conditions no longer exist. Never rewrite historical findings without retaining history.
5. BLOCKER prevents issuing/confirming affected draft. WARNING requires acknowledgment or staff follow-up depending on policy. INFO is advisory only.
6. Resolutions: `ACKNOWLEDGE`, `RECALCULATE_DRAFT`, `RETRY_MISSING_CYCLE`, `REVIEW_AGREEMENT`, `CORRECT_PLAN_CONFIG`, `MARK_FALSE_POSITIVE`. Authorize each action separately. Rescan after any proposed fix.
7. Never automatically alter a confirmed invoice or a customer's accepted contract. Audit approved changes and retain before/after.

### 11.4 Important integrity limitations

- Some anomalies are only detectable if the data contains the right evidence. Do not claim AI detected a bad charge when no approved benchmark exists.
- Estimate money at risk only when the exact alternate amount is calculable; otherwise show “impact not quantifiable” rather than an invented total.
- An immutable unique invoice index may prevent duplicate invoices before they exist; demo this as an intercepted duplicate **attempt** with an audit event, not as two actual persisted invoices.
- Seed intentionally inconsistent **draft** test fixtures to demonstrate anomaly detection; do not create production APIs that bypass financial constraints to fake findings.

### 11.5 BillGuard acceptance tests

- Given two simultaneous jobs for one cycle, one invoice exists, duplicate attempt safely logged.
- Given due ACTIVE subscription with no invoice, missing-cycle finding and safe retry.
- Given a paused subscription, no new invoices and block on forced attempt.
- Given expired discount in an intentionally malformed draft, `BI-004` fires and amount is recomputed for comparison.
- Given altered draft quantity relative to accepted quote, `BI-006` flags exact difference.
- Given correct invoice, no false blocker.
- Given a BLOCKER, confirmation is rejected by backend even if UI hides the scan.
- Given customer credentials, scans and finding data are inaccessible.

---

## 12. EXPLAIN MY BILL — P1 DIFFERENTIATOR

### 12.1 Must answer these questions

- What subscription/period am I paying for?
- Which products/variants, unit prices, quantities, and add-ons are included?
- Which discount applied, why did it qualify, and how much was saved?
- How was tax computed and what rate was used?
- Why is this invoice different from the previous invoice?
- What amount remains unpaid? When is it due?

### 12.2 Explanation generation

Generate an immutable, deterministic explanation from the **issued invoice's snapshots** (not today's editable catalog/tax rules). Include a sequence of structured explanation entries:

```json
{
  "invoiceId": "uuid",
  "period": { "start": "2026-11-01", "endExclusive": "2026-12-01" },
  "currency": "INR",
  "entries": [
    { "kind": "BASE_PLAN", "label": "Monthly Business, 1 seat", "amount": "1000.00" },
    { "kind": "VARIANT", "label": "Odoo brand adjustment", "amount": "560.00" },
    { "kind": "DISCOUNT", "label": "Eligible 10% plan discount", "amount": "-156.00" },
    { "kind": "TAX", "label": "Demo tax at 18%", "amount": "252.72" }
  ],
  "subtotal": "1560.00",
  "discount": "156.00",
  "tax": "252.72",
  "total": "1656.72",
  "comparisonToPrevious": { "hasPrevious": false, "changes": [] }
}
```

The API returns structured amounts and authored explanatory text; clients render it with a readable arithmetic breakdown. An optional future LLM may **paraphrase** the explanation but must preserve all verified values, and the application must work with AI disabled.

### 12.3 Previous-cycle comparison

Compare previous and current issued invoices for the same subscription, aligning individual product/variant identifiers and displaying changes due to: quantity, added/removed add-ons, approved unit-price changes, discount start/expiry, tax-rule changes, or partial period adjustments. Highlight the delta for each component, with a link to the authorizing event where available. Do not simply attribute all changes to “price increase” if the cause is unknown. If cause cannot be determined, say “difference detected; manual review needed.”

### 12.4 Acceptance

- Invoice breakdown sums exactly to stored grand total.
- Customer sees their issued invoice only; another customer's ID returns 404/403 without data leak.
- Modifying catalog prices after issuance does not change the explanation or PDF for historic invoices.
- Comparison attributes demonstrable differences accurately; no fabricated reason.

---

## 13. BILLING TIME MACHINE — P1 DIFFERENTIATOR

### 13.1 Functionality

Allow ADMIN/STAFF to ask, “What would happen to Brightloop's subscriptions and invoices by a future date or over the next N months?” This **does not** advance real billing state, consume discounts, mark actual invoices paid, or send emails.

**Inputs:** simulation start/as-of date, horizon (e.g. 1–12 months), optional subset (all/plan/customer), scenario changes (proposed plan-price increase on future **renewals**, assumed churn percentage, optional additional seats), toggles for including applicable discounts/taxes.

**Outputs:** projected invoice count/amount by month, invoice-level preview, active/expired/paused counts, discount consumption projection if relevant, upcoming subscription expiries, anomaly findings, scenario differences vs baseline, assumptions and limitations.

### 13.2 Exact rules

- Build an in-memory/read-only set of subscription snapshots and schedule forward via the same recurrence and money calculator.
- A hypothetical price change **never silently reprices already-accepted contracts**. Apply it only to simulated future renewals/amendments under a clearly stated assumption, or keep it out of basic forecast.
- A churn slider is an **assumption**, not a learned prediction. Label projected values accordingly. For deterministic results, either select an explicitly documented deterministic subset of customers or use expected-value aggregate modeling; never assert exactly which real customers will churn without evidence.
- Discount usage limits in scenarios must be simulated on a separate temporary counter/state, not live `usesConsumed`.
- Simulated taxes reflect effective-dated rules when known. If the future contains unknown tax changes, preserve current settings and state this assumption.
- Run within bounded workload/time; start with a small/medium dataset and a maximum 12-month horizon. For very large simulations, batch/queue server-side and show progress; never freeze the normal request path.
- Persist optional `SimulationRun` summary and reproducible assumptions, **never** live invoice/payment data.

### 13.3 Safety tests

1. Snapshot counts and money before run; afterward confirm zero changes in real subscription, invoice, payment and discount-redemption tables.
2. Baseline preview for next cycle equals the actual billing engine's computed invoice when run with the same as-of date/rules.
3. Hypothetical churn/price values appear only in simulations, never finance dashboard actuals.
4. Scenarios past expiry never generate active bills; pause and policy rules apply.
5. Calling the same deterministic scenario with the same snapshot produces the same output.

---

## 14. EXCEL RESCUE — OPTIONAL P2

Brightloop currently tracks customers/subscriptions in spreadsheets, so safe migration provides a useful story. Do this only after P0 and priority P1 are demonstrably working.

- Accept CSV or XLSX (bounded size; server validates MIME, extensions, rows).
- Provide mapping UI for email, customer name/company, product, plan, start/expiry date, next billing, price and status.
- Normalize whitespace/casing and explicitly ask user to disambiguate date formats; never silently reinterpret `01/02/2026`.
- Validate unique normalized emails, customer/subscription collisions, supported plan names, allowed dates, currency, missing required columns, invalid payment status.
- Support dry run with row-level errors, conflict grouping, duplicate candidates, and a computed sample next invoice.
- Require a review/approval screen before committing. For dangerous duplicates, hold the row; never silently merge two customers or overwrite issued invoices.
- Commit in bounded transactions with per-row result logs and a clear rollback/reimport strategy; imported historical paid invoices need a separate explicitly designed process, not synthetic payment generation.
- Prevent import-triggered backbilling until a staff member reviews `nextBillingOn` and the cutover date. Audit import actions.

---

## 15. CUSTOMER, AUTHENTICATION AND SECURITY DESIGN

### 15.1 Identity/auth

- Email normalization and uniqueness handled both in validation and DB. Store normalized email consistently; guard races by unique constraint.
- Password policy from PDF: **length >8** (minimum 9), one uppercase, one lowercase, one special character. No numeric character requirement specified. Display requirements clearly, validate on server and client.
- Use maintained auth library/password hash scheme such as Argon2id via compatible configuration; do not implement hashing/session cookies from scratch.
- Secure HTTP-only session cookie with appropriate SameSite and Secure configuration for deployment; rotate/invalidate sessions after password reset as supported.
- Password reset tokens: cryptographically random, single use, short expiry (proposed 30 minutes), hash at rest, linked to user, generic success on “email sent” whether account exists, rate limit by IP/email; never log raw token. Use authorized email provider and dev outbox.
- First administrator bootstrapped by secure one-time CLI/seed based on environment-supplied credentials or local dev-only fixtures; do not allow public ADMIN signup. Staff created only by ADMIN.

### 15.2 Authorization and privacy

- Central permission guard per action; roles checked server-side, not only hidden UI nav.
- Customer ownership check via user→customerProfile→subscription/invoice relationship. **Never** accept a path/query `customerId` as authorization.
- Consistent 404 or 403 for inaccessible records; no enumeration via detail/search endpoints.
- Audit sensitive configuration changes, role changes, invoice confirmations/cancellations, discount redemptions, manual payments/reversals, simulated billing requests, and exception resolutions.
- Validate/cap all list filters and query input; avoid mass assignment by explicit request schemas.
- Protect forms/mutations with CSRF strategy appropriate to authentication library, restrictive CORS, and safe cookie settings.
- Sanitize printable invoice content and uploaded data; do not render unsanitized user HTML.
- Rate-limit auth and high-cost scan/simulation endpoints; use bounded input limits and job cancellation/timeouts.
- Logs redact sensitive personal information; never store API keys, auth tokens, or passwords in audit JSON.
- Use least-privilege database and email credentials. `.env.example` has placeholder names only, and `.env` is gitignored.

### 15.3 Payments and compliance boundary

The payment module **records** payments received by UPI/bank/card/cash/other methods. It does **not** store card PAN, CVV, bank login credentials, or initiate transfers. Any future gateway integration must verify signed webhooks, deduplicate gateway events, and comply with that provider's security requirements. Do not label manually recorded payments as independently gateway-verified.

### 15.4 Required negative tests

- Customer cannot access invoice/subscription belonging to another customer by guessing IDs.
- Customer cannot create STAFF or ADMIN, edit plans/taxes/discounts, call internal billing endpoint, approve admin findings, or view all-customer revenue.
- STAFF cannot create other staff or mutate admin-only discount/tax rules.
- Password reset token reuse and expired token are rejected; forgot-password endpoint does not leak registered emails.
- Invalid request bodies cannot overwrite server-controlled invoice totals, ownership, payment status or lifecycle state.
- Invoice PDF/explanation endpoints enforce the same authorization as invoice detail.

---

## 16. PERFORMANCE, RELIABILITY AND OBSERVABILITY

### 16.1 Performance acceptance from PDF

The PDF requires pages to respond in **under two seconds even with thousands of subscriptions**. Record performance as a verifiable demo benchmark, not an unsupported guarantee. Test with **at least 10,000 seeded subscriptions**, realistic spread of statuses, and representative invoices/payments (e.g. 60,000 invoices if generation costs remain reasonable). Use a documented test environment and measure representative user-perceived navigation/TTFB and API p50/p95. Target **p95 under 2.0 seconds for core list/detail/dashboard interactions** on the chosen benchmark setup; explicitly disclose deviations and test conditions.

### 16.2 Techniques

- Indexed filters, keyset/cursor pagination, bounded page size, select only required columns, prevent N+1 ORM loops.
- Aggregate in SQL / materialized views or cached derived reporting (with invalidation policy) rather than scanning full payments/invoices into Node memory.
- Avoid running large integrity scans, billing runs, simulations, PDF renders, or CSV imports inline in the critical request path.
- Render initial page skeleton then hydrate server-filtered tables; cache non-sensitive public/catalog data sensibly; ensure mutations invalidate stale dashboard data.
- Lazy-load expensive charts and detail drawers when appropriate; cap chart data points and aggregate server-side.
- Design billing jobs to be safe with thousands of due subscriptions; bounded batches and retries.

### 16.3 Reliability and metrics

- Structured logs: requestId, actorId where appropriate, event type, entity ID, billingRunId, scanId, duration, outcome; never include secrets.
- Admin-visible billing run summary: due, generated, skipped-duplicate, blocked, failed, recovered.
- Metrics: invoice generation throughput, duplicate-prevention count, missed-cycle findings, blocked confirmations, outstanding totals, API latency p95, failed email jobs.
- Alerts (optional): consecutive job failures or missed expected billing window, repeated constraint errors, email delivery backlog.
- Startup health checks for app/db; migration status; provider configuration validation; backups and restore instructions for DB.

---

## 17. TESTING STRATEGY (REQUIRED, NOT OPTIONAL)

### 17.1 Unit tests for pure functions

- Currency math and HALF_UP rounding (including multi-line sum consistency).
- Variant adjustments, quantity changes, no double count between product and plan price.
- Fixed vs percentage discount; thresholds, product scope vs subscription scope, expiry, zero/max cap, upper bounds, tie-break, proportional allocation including remainder pennies.
- Tax on discounted net line, zero-tax, overlapping-rule error, boundary effective dates.
- Daily/weekly/monthly/yearly schedule; leap day, Jan 31, Feb 28/29, expiry boundary, no monthly drift.
- Valid and invalid subscription/invoice state transitions and plan policy flags.
- Explanation components exactly match invoice amount; previous-period delta breakdown.
- Every BillGuard rule with positive and negative cases.

### 17.2 Integration tests with real Postgres

- Unique normalized email despite concurrent signup attempts.
- DB unique period key prevents two invoices for same subscription in concurrent jobs.
- Invoice creation and schedule cursor transaction commits/rolls back together.
- Discount redemptions respect global max use under concurrent confirmations.
- Confirmed invoice remains immutable after admin edits product/tax catalog.
- Payment partial, full, overpayment rejection, reversal, balance updates.
- Role isolation enforced for route handlers and PDFs.
- Dashboard aggregates match SQL fixture expected totals.
- Catch-up billing after simulated outage does not skip cycles or bill paused periods.
- Unsafe cancellation/reissue and duplicate payment references blocked.

### 17.3 End-to-end Playwright flows

**E2E-01** Admin logs in, creates product, Odoo variant +560, tax, plan, discount.  
**E2E-02** Customer signs up, cannot see someone else's data.  
**E2E-03** Staff makes quote from template, confirms, activates.  
**E2E-04** Billing job creates draft invoice with correct components; rerun is idempotent.  
**E2E-05** Staff confirms, sends dev-outbox email, downloads/prints PDF.  
**E2E-06** Staff records partial then remaining payment; invoice transitions to Paid.  
**E2E-07** Dashboard reflects actual cash/billed/outstanding/overdue numbers.  
**E2E-08** BillGuard detects planted invalid draft and blocks confirmation.  
**E2E-09** Customer opens Explain My Bill; previous-cycle comparison accurate.  
**E2E-10** Time Machine results do not alter ledger rows.  
**E2E-11** Staff-created account attempts and customer IDOR denied.  
**E2E-12** Plan pause/renew/close permission and invoice effects match policy.

### 17.4 Security and reliability test matrix

| Test | Expected outcome |
|---|---|
| Public staff-signup attempt | Denied |
| Invalid password (8 chars, no special, no uppercase, no lowercase) | Rejected |
| Same email with different case | Conflict, not duplicate account |
| Customer guesses invoice ID | No foreign data returned |
| Two simultaneous billing workers | One invoice, zero duplicate charges |
| Two concurrent last-use discount redemptions | At most one succeeds |
| Scheduler fails after commit | Retry no duplicate |
| Invalid/expired discount at confirmation | Block and request recalculation |
| Paused subscription due | Not billed |
| Annual Jan/Feb leap edge cases | Correct anchored period dates |
| Paid invoice cancellation | Rejected unless defined reversal process |
| Large 10k-record fixture | Core pages benchmarked against 2s target |
| Simulation runs | Actual ledger and balances unchanged |

### 17.5 CI quality gate

On each PR/meaningful milestone run: `typecheck`, `lint`, `unit tests`, `integration tests` against test Postgres, and critical Playwright smoke tests where infrastructure permits. `git diff --check`, no committed secrets, migration validation. Do not report green tests without actually running them. Log verified commands in implementation status.

---

## 18. SEED DATA AND LIVE DEMONSTRATION

### 18.1 Deterministic seed strategy

Create a reproducible `seed.ts` with dedicated **development/test-only** datasets, isolated from production:

- 1 admin, 2 staff users (sales and finance), 3 named demo customers; additional synthetic customers for scale testing.
- Base “Business Management Software” product, Odoo variant `+560.00` (amount from PDF; currency chosen for demo), 1–2 addon products.
- Monthly, yearly, weekly and daily plans, with varied pause/renew/early-close/expiry policies.
- Example tax rule 18% (illustrative, not prescribed), discount rule 10% for threshold quantity and fixed amount for threshold purchase.
- Accepted monthly quotation/subscription, a second subscription with an upcoming due date, active/paused/closed examples.
- A handful of confirmed/paid/partially paid/overdue invoices with actual payment records and balanced totals.
- Controlled anomalous **draft fixtures**: stale/invalid discount, quote mismatch, incorrect preview total; plus a missing due cycle to detect. Never bypass confirmed ledger or unique constraints.
- Billing demo dates relative to the configured current business date or a fixed documented demo snapshot date. For future demonstrations use the simulator; don't backdate the real production clock.
- Separate **performance seed** creates 10k subscriptions and appropriate related records without polluting the normal demo dataset; realistic indexed distribution.

### 18.2 Demo script (target 6–10 minutes, adjustable)

1. Show Admin catalog: base product, Odoo +560 variant, monthly plan, tax and a discount rule.
2. Log in as Staff; use quotation template to sell plan to customer. Show quote validity, accepted snapshot, and subscription becoming ACTIVE.
3. Trigger today's authorized billing run; show newly generated DRAFT invoice with mathematically correct totals. Run it again; show **no duplicate**, with billing-run record.
4. Confirm the invoice, generate PDF, send to development email outbox; customer sees issued bill and **Explain My Bill**.
5. Record a partial payment then full settlement; refresh live dashboard to show cash received and outstanding change.
6. Open BillGuard; scan intentionally faulty **draft** examples (invalid discount, accepted-quote mismatch) and a missing-cycle subscription. Show evidence and a safe correction/re-scan.
7. Open Time Machine; simulate +3 months with renewals/expiries, compare projection with baseline, and show no actual invoice or payment rows were created.
8. Explain the end-to-end value and show measured latency at a 10k-subscription dataset, if validated in the test environment.

### 18.3 Demo credibility rules

- All output metrics should be derived from records, not hard-coded chart constants.
- Label intentionally planted anomalies as seed/demo fixtures; don't pretend they arose naturally in a deployed customer environment.
- Do not claim real money was collected; manually recorded demo payments are simulated records.
- Do not claim the product uses AI unless AI is genuinely integrated and its role is accurate.
- Do not claim the platform outperforms Stripe/Chargebee or is unprecedented; differentiate on workflow and demonstrable quality.

---
## 19. DEVELOPMENT ROADMAP — EXECUTE IN THIS ORDER

**Principle:** Deliver a vertical slice of real application behavior before adding more screens. Every phase has a measurable gate. P0 is the floor; P1 creates differentiation. Do not interpret estimated effort as a delivery promise.

### M0 — Repository assessment and environment

**Tasks:**

- Examine existing repo; report current structure, existing stack, working/failing scripts, and reusable features.
- Establish Next.js+TypeScript/Postgres/Prisma stack if project is new; setup local DB, lint/typecheck/formatter, test runner, `.env.example`, safe `.gitignore`.
- Define local run commands, migrations, seed, test script; create `README`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`.
- Agree on money precision, date-only behavior, currency/timezone configuration, and auth provider compatibility.
- Configure CI for at least typecheck, lint, unit tests; add health route or startup diagnostics.

**Gate:** A new developer can run app+DB locally following the README; blank UI renders; DB migration applies; verification scripts execute.

### M1 — Authentication, profiles, RBAC

**Tasks:**

- Wire email/password signup and login, sessions, logout, unique normalized email and exact password policy.
- Configure password reset tokens and email adapter with safe dev outbox.
- Create secure admin bootstrap; admin-only staff create/invite, staff/customer role permissions.
- Guard admin/staff/customer layouts and API handlers; create customer profile on signup; implement ownership checks and tests.

**Gate:** customer signup/login/reset works; staff create denied to non-admin; customer cannot access a foreign customer's subscription or invoice endpoint.

### M2 — Catalog, variants, plans, tax, discounts

**Tasks:**

- Prisma tables, migrations, DB constraints; server validators and services.
- Product CRUD, variant +delta, plan CRUD and policy flags, availability dates/frequency/min quantity.
- Admin-only tax/discount rule creation; overlap and cap validation; reusable pure pricing/discount/tax calculators with unit tests.
- Build admin forms, list/detail pages and proper authorization; seed product/variant/plan example.

**Gate:** Odoo +560 is calculated correctly; a plan bills its own recurring base price without catalog-price duplication; discount/tax numerical tests pass.

### M3 — Quotation templates and subscription lifecycle

**Tasks:**

- Template and template-line CRUD.
- Quote builder from template, validity period, edited lines, quote/confirmed snapshots.
- Create unique subscription numbering, status transitions, start/expiry/payment term controls.
- Pause/resume/early close/renew policy guards, lifecycle/audit events, and customer-scoped controls.
- Subscription search/detail/timeline, own portal list.

**Gate:** draft→quote→confirmed→active works; quote expiry guard works; unauthorized transitions rejected; plan policy drives pause/renew/close.

### M4 — Billing engine, invoice operations, background job

**Tasks:**

- Pure recurrence calculator and invoice calculator with Decimal math; exact tax/discount allocation; proper day/month/year boundaries.
- Invoice schema, line snapshots, `(subscription, cycle)` unique index and transactional cursor advancement.
- Billing job, retries, run/item logs, protected scheduler route, admin dev trigger; catch-up and concurrency tests.
- Invoice list/detail/status/confirm/cancel; atomic discount-cap redemption, customer visibility, due-date handling.
- PDF generation and email sending through adapter/outbox; printable issued document with stable snapshot.

**Gate:** three subscriptions bill correctly, a second job call produces no duplicate, backlogged due periods catch up, invoice totals reconcile, staff can confirm/send/print, customer sees only issued bills.

### M5 — Payments and dashboard (complete all PDF P0)

**Tasks:**

- Record manual payments and full/partial settlement with immutable history and protected reversal.
- Derived outstanding/overdue, paid state, filtering by date/status/customer/plan.
- Finance dashboard calculations over SQL aggregates, charts and drill-down; customer invoice listing/PDF.
- Server-side pagination and indexing; benchmark with thousands of records; optimize slow endpoints.
- Run comprehensive E2E P0 suite and fix all blocking issues.

**Gate:** complete PDF journey works against DB, no known P0 gaps, core pages measured against <2s benchmark on defined dataset.

### M6 — BillGuard preflight (primary differentiator)

**Tasks:**

- Implement priority rules `BI-001` through at least `BI-007` plus `BI-009` as needed; all rules defined and tested.
- Finding fingerprints/severity/evidence lifecycle, scan service and API, list/details UI.
- Hard-block on critical errors at invoice confirmation, admin-visible exception actions and audit.
- Seed controlled faulty drafts and missing cycle for a credible demonstration.

**Gate:** at least four distinct real issues are detected with accurate evidence; a clean invoice produces no blocker; critical invoice cannot be confirmed by bypassing UI; correction and re-scan are recorded.

### M7 — Explain My Bill (customer differentiator)

**Tasks:**

- Structured component explanation from issued snapshots, line/variant/discount/tax breakdown, comparison with previous cycle.
- Secure customer invoice explanation route, invoice detail “Why this amount?” panel.
- Exact reconciliation tests and privacy/immutable-history tests.

**Gate:** numerical explanation matches invoice/PDF; customer sees own only; prior comparison finds a seeded change with evidence.

### M8 — Time Machine (if P0 + BillGuard solid)

**Tasks:**

- Side-effect-free period projection using same pure engine and read-only snapshots.
- Scenario form (horizon, subset, assumptions), projection summary, per-cycle invoice previews, baseline comparison, assumptions labeling.
- Optional future renewal price-change/churn assumptions, no live mutation, bounded workloads, integration checks.

**Gate:** 3/6/12-month forecasts available; live ledger row hash/counts unchanged; same scenario deterministic; simulation banners unambiguous.

### M9 — Optional polish and extensions

**Tasks:** Excel Rescue, overdue recovery action center, advanced proration/amendments, improved finance export, hardening email retries, broader accessibility, richer PDF styling, automated performance monitoring, deployment workflow, screenshots/demo recording if requested.

**Gate:** optional work does not break P0/P1; all tests remain green.

### Phase priority if time is short

`M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9`

If the deadline approaches, ship **P0 + a trustworthy BillGuard** instead of an incomplete collection of AI features, charts, and placeholders. In particular, do not sacrifice billing-job idempotency, correct calculations, or customer isolation to make the Time Machine look impressive.

---

## 20. WORK BREAKDOWN / TRACKABLE BACKLOG

Use a task tracker or `docs/IMPLEMENTATION_STATUS.md` checklist. The following work-item IDs support precise progress reporting.

| ID | Deliverable | Dependency | Required proof |
|---|---|---|---|
| INF-01 | Local Postgres + env + migrations | M0 | Clean local startup |
| INF-02 | CI + test scripts | INF-01 | Green example tests |
| AUT-01 | Signup/login/role sessions | INF-01 | Auth integration tests |
| AUT-02 | Password reset email/outbox | AUT-01 | Token lifecycle tests |
| AUT-03 | Ownership + staff provisioning | AUT-01 | Unauthorized access tests |
| CAT-01 | Product + variant CRUD | AUT-03 | Odoo delta fixture |
| CAT-02 | Plan + policy CRUD | CAT-01 | Frequency/min qty tests |
| CAT-03 | Tax and discount rules | CAT-01 | Formula/eligibility tests |
| SAL-01 | Quote templates | CAT-02 | Template persistence |
| SAL-02 | Quote preview + accepted snapshot | SAL-01 | Validity/pricing tests |
| SUB-01 | Subscription lifecycle | SAL-02 | State-machine tests |
| SUB-02 | Pause/resume/renew/close | SUB-01 | Policy and time tests |
| BIL-01 | Pure dates + money engine | CAT-03, SUB-01 | Boundary/unit tests |
| BIL-02 | Invoice persistence | BIL-01 | Reconciliation + uniqueness |
| BIL-03 | Worker + idempotent catch-up | BIL-02 | Concurrent job tests |
| BIL-04 | Invoice confirmation/discount cap | BIL-02 | Concurrent redemption tests |
| BIL-05 | Issued PDF and email | BIL-04 | Saved PDF/outbox proof |
| PAY-01 | Record payment and balance | BIL-04 | Partial/full/reversal tests |
| RPT-01 | Dashboard aggregates, filters | PAY-01 | SQL fixture reconciliation |
| PERF-01 | 10k subscription load tests | RPT-01 | Latency report |
| INT-01 | BillGuard detection rules | BIL-01, BIL-02 | Rule positive/negative cases |
| INT-02 | Findings UI + approval/recheck | INT-01 | Audited resolution flow |
| EXPL-01 | Explain My Bill | BIL-04 | Exact sum/privacy tests |
| EXPL-02 | Previous bill comparison | EXPL-01 | Change-attribution fixture |
| SIM-01 | Read-only forward simulator | BIL-01, SUB-01 | No mutation assertions |
| SIM-02 | Simulator UI + scenarios | SIM-01 | Reproducible forecast |
| IMP-01 | CSV/XLSX import | P0 complete | Validation/dry-run tests |
| DEM-01 | End-to-end judge demo | Core + chosen P1 | Repeatable scripted walkthrough |

---

## 21. ENVIRONMENT, DEVELOPMENT COMMANDS AND DELIVERY

### 21.1 Suggested `.env.example`

```dotenv
# Database
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/brightloop?schema=public"

# Authentication (actual names depend on chosen provider)
AUTH_SECRET="REPLACE_WITH_RANDOM_SECRET"
APP_BASE_URL="http://localhost:3000"

# Business settings for demo
DEFAULT_CURRENCY="INR"
BUSINESS_TIMEZONE="Asia/Kolkata"

# Email provider, test behavior default
EMAIL_MODE="outbox"
EMAIL_API_KEY=""
EMAIL_FROM="billing@example.invalid"

# Scheduler secret (no arbitrary external production triggering)
BILLING_CRON_SECRET="REPLACE_WITH_RANDOM_SECRET"

# Safe development/demo flags. Never expose future real billing mode.
ALLOW_LOCAL_DEMO_ACTIONS="false"
NODE_ENV="development"
```

The auth library may require different secret/environment keys; align these names to verified actual dependencies. Do not commit populated `.env` or copy these placeholder secrets into deployment.

### 21.2 Suggested `package.json` scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:perf": "node scripts/benchmark.mjs"
  }
}
```

Treat these as a starting convention: actual commands must match chosen packages and configuration. Integration tests need a test DB and clean isolated fixtures. `db:seed` must refuse to write fake data to production by default.

### 21.3 README must contain

1. Prerequisites and initial setup (Node/package manager, Docker or hosted Postgres, env variables).
2. Running database migrations and seed safely.
3. Starting Next.js and viewing dev outbox.
4. Test and lint/typecheck commands.
5. Local safe billing-job test instructions and Time Machine vs real job distinction.
6. Demo user roles and ways to create local credentials securely (without publishing sensitive passwords).
7. Deployment requirements and scheduler configuration.
8. Known limitations vs PDF requirements (preferably none by P0 completion).
9. Source provenance: hackathon PDF vs project-defined policies.

### 21.4 Deployment readiness checklist

- No example/dev reset tokens or test admin credentials enabled in prod.
- Env secrets configured by deployment secret manager, session/cookie settings correct.
- Postgres migration applied and backups considered.
- Protected cron configured and observed, idempotency regression tested under concurrent invocations.
- Email provider/domain tested; unverified sender/domain failures visible in outbox/jobs.
- PDF download authorization verified.
- Error monitoring structured logs contain no secrets.
- Core routes/queries benchmarked at expected dataset size.
- Explicit sign-off before enabling any real recurring invoice sends or mass notifications.

---

## 22. EDGE CASES AND BUSINESS DECISION REGISTER

This table prevents agents from improvising inconsistent policies while coding. For cases the PDF does not decide, implement the proposed safe behavior or document a justified alternative.

| Case | Decision for this project |
|---|---|
| Email difference only in case/whitespace | Same account; normalize and unique constrain |
| Password is exactly 8 characters | Reject; PDF says **more than 8** |
| Staff creation by ordinary staff/customer | Reject at API and DB/service layers |
| Product catalog price changes | Existing accepted subscription prices remain snapshotted |
| Plan availableUntil passes | Stop new sales; existing subscription contract not silently canceled |
| Odoo variant on base plan | Plan base price + delta, never catalog price + plan price |
| Multiple discounts qualify | Choose single largest eligible amount; deterministic tie-break; show selected rule |
| Discount capped when draft was generated | Stop confirmation and request review, don't silently change amount |
| Discount expired now but valid at billed period start | Apply per period-start eligibility; preserve issued historic snapshot |
| Tax rule overlap | Block ambiguous draft and require admin correction |
| No applicable tax | Apply zero tax only when explicitly permitted/configured, not as an accidental fallback |
| Two workers bill same cycle | DB unique key allows one invoice; second reports existing record |
| Job was offline for three months | Catch up eligible cycles without duplicating or silently skipping |
| Subscription paused during cycle | No future bills during pause; issued invoice unaffected; resume new anchor |
| Expiry in middle of final billing period | Block pending review until a defined approved proration/term correction; never bill beyond expiry silently |
| Quote validity expired | Must refresh/reissue before confirming |
| Discount maxUses exhausted concurrently | Atomic transaction allows no use past cap |
| Partial payment received | Invoice remains CONFIRMED, derived Partially Paid, balance reduces |
| Invoice fully paid | Status PAID; balance zero |
| Overpayment | Reject rather than store negative balance |
| Payment reversed | Audited reversal, recompute paid/balance; status adjusts safely |
| Cancel confirmed invoice with payment | Reject until authorized reversal/credit process |
| Cancelled invoice cycle | Reserved history; require explicit approved replacement flow, no silent duplicate reissue |
| Backdated historical imports | Dry run and manual cutover review to prevent accidental mass billing |
| Future quote price rise in Time Machine | Apply only to assumed renewals/amendments, not historical agreement |
| User changes locale/timezone | Business billing dates stay anchored in configured business timezone |
| Customer accesses admin scan | Forbidden |
| Invoice numbers reused after cancellation | Never reused |
| Staff edits issued invoice total | Forbidden; use documented adjustment/reissue route |
| Unverified payment method in manual ledger | Record method for reference, no claim of provider verification |

### 22.1 High-risk items to document in decisions as implementation matures

1. **Quote acceptance:** how a staff member records the customer's acceptance, and whether customer self-approval is added. For v1, staff marks acceptance and stores actor/time/notes; don't pretend cryptographic e-signature exists.
2. **Proration:** if implemented, specify calendar-day vs second-based formula, tax rounding, and handling of already-paid periods. Do not present P1 proration as a PDF mandate.
3. **Customer-initiated renewal/close:** make the authorization policy explicit; some actions may create an approval request rather than mutate financial commitments immediately, provided the portal clearly exposes management and the workflow completes.
4. **External email sending:** define test-mode behavior, replay, failed deliveries, and what `sent` means.
5. **Account billing addresses and identifiers:** determine region-specific fields only after verifying applicable law; source PDF leaves these unspecified.
6. **Multi-customer company access:** excluded in v1; one customer profile per customer login prevents data-leak ambiguity.

---

## 23. TRACEABILITY: FROM PDF SCENE TO WORKING FEATURE

| PDF scene | Implemented in | Verification |
|---|---|---|
| A new customer signs up | Auth/profile + role guards + reset | Signup, unique email, policy, reset, isolation tests |
| Launching a new plan | Catalog, variants, plan policy, tax & discounts | Admin CRUD and pricing tests |
| Turning a quote into a subscription | Templates, accepted snapshot, lifecycle | Full quote-to-active E2E |
| Billing day | Pure engine, invoice ledger, protected billing job | Calculations, duplicate and catch-up integration tests |
| A customer asks for a better price | Discount rules, eligible invoice application | Fixed/percent/threshold/date/cap tests |
| The money comes in | Payment record, unpaid/paid/overdue ledger | Full and partial payment E2E |
| Finance at month-end | Real SQL KPIs, filters, reports | Reconciled fixture values, latency tests |
| Added project differentiation | Integrity Studio, explanation, simulator | Demo anomalies; no mutation in simulator |

---

## 24. FINAL ACCEPTANCE CHECKLIST / DEFINITION OF DONE

### 24.1 Mandatory hackathon completion (all checked before claiming P0 complete)

- [ ] User signup with unique normalized email and exact password constraints.
- [ ] Secure login/logout and working one-time password reset by email/outbox.
- [ ] ADMIN, STAFF, CUSTOMER enforced on server; only admin creates staff.
- [ ] Customer cannot access anyone else's subscription/invoice or issued PDF.
- [ ] Products with fields, variants, and +560 variant demonstration.
- [ ] Plans with four frequencies, price, minimum quantity, availability, auto-close/early-close/pause/renew policy settings.
- [ ] Admin tax and discount rules with dates, thresholds, scope, and usage cap.
- [ ] Quotation templates, quote validity, accepted quote snapshot.
- [ ] Unique subscription number, terms, line items, and required state lifecycle.
- [ ] Pause/resume/close/renew policy enforced, status observable by staff.
- [ ] Automatic scheduled/manual-test due invoice generation, detailed taxes and totals.
- [ ] Invoice Draft/Confirmed/Paid (+cancel path), PDF/print/send working.
- [ ] Concurrent worker/retry tests prove no duplicate same-period invoice.
- [ ] Catch-up paths prevent eligible due periods from silently disappearing.
- [ ] Discount eligibility and cap at confirmation are transaction-safe.
- [ ] Full/partial payment records with method, amount, date, note, outstanding and overdue calculations.
- [ ] Dashboard uses real DB counts/money with date/filter controls.
- [ ] 10k-subscription realistic benchmark and evidence for <2-second target (or transparent report of deviations).
- [ ] No secret exposure, insecure test bypass, fake live numbers or uncontrolled future billing.
- [ ] Core E2E and unit/integration suites pass with recorded commands.

### 24.2 Differentiator acceptance

- [ ] BillGuard real scan detects at least four known problems with deterministic evidence.
- [ ] Critical findings prevent unsafe invoice confirmation on the server.
- [ ] Resolution/acknowledgment is permission-controlled, audited, and followed by re-scan.
- [ ] Explain My Bill reconciles exactly with issued invoice and is customer-isolated.
- [ ] Previous-cycle change explanation is based on snapshots, not invented causes.
- [ ] Time Machine reuses billing rules and never writes to real billing/payment tables.
- [ ] All scenario outputs distinguish hypothetical from actual financial metrics.

### 24.3 Deliverable package

- [ ] Working source repo with meaningful code and completed migrations.
- [ ] `.env.example`, reproducible seed and deployment instructions.
- [ ] `README.md` explaining features, startup, security, demo, limitations.
- [ ] `docs/IMPLEMENTATION_STATUS.md` with accurate milestone state/evidence.
- [ ] `docs/DECISIONS.md` recording real design deviations and decisions.
- [ ] Unit, integration and E2E tests; benchmark instructions/results.
- [ ] `docs/DEMO_SCRIPT.md` with exact demo steps and setup.
- [ ] No stale TODO buttons presented as functioning features.

---

## 25. STARTER TASK FOR CODEX (COPY INTO THE FIRST MESSAGE)

```text
Read CODEX_PROJECT_MASTER_PLAN.md in full. This is the canonical source of truth
for Brightloop's Subscription Management System and Billing Integrity Studio.

Before changing code, inspect the current repository and identify existing work.
Create or update docs/IMPLEMENTATION_STATUS.md with a P0/P1/P2 gap analysis.
Then implement milestone M0 (repository/environment setup) and proceed to M1
(authentication/RBAC) if M0 is already complete. Do not implement decorative
screens ahead of data models, security and service logic.

Use the architectural decisions, acceptance tests, state machines, API contracts,
data model and source requirement matrix in the plan. Keep all currency arithmetic
exact, keep historical invoices immutable, and build an idempotent billing engine.

For every milestone: write tests, execute available verification commands, update
the progress ledger, and state remaining blockers. If a documented assumption is
unsafe or conflicts with working repo constraints, record an explicit decision
before deviating. Do not claim untested features are complete.

Start by reporting the repo state and the concrete implementation plan for M0/M1,
then execute the smallest useful change immediately.
```

---

## 26. NOTES FOR FUTURE CONTRIBUTORS

- The supplied PDF is the definitive source for **what** the system must do. This file contains implementation choices for **how** to do it. A choice not specified by the PDF remains a design assumption.
- The product's success depends more on correct database transactions, billing schedules, accurate financial snapshots, and permission enforcement than on AI usage or dashboard aesthetics.
- Billing Integrity Studio is the distinct product story: **simulate safely, detect mistakes before issuance, explain every charge, resolve with an audit trail**.
- An MVP can be strong without a live gateway. Claiming payment gateway integration or advanced accounting without code is worse than honestly demonstrating correct manual payment reconciliation.
- Add an AI assistant only after the deterministic engine, validation and audit trails are reliable. If introduced, prevent fabricated figures and ensure users can inspect the underlying calculations.
- During implementation, continuously map features to the requirement table and verify end-to-end behavior rather than checking boxes based only on UI presence.

**End of master plan.**
