# Implementation decisions

- PostgreSQL 18 is installed on this machine. Use an isolated local cluster on 127.0.0.1:55432; do not alter the existing Windows service. PostgreSQL is the only application database.
- Next.js App Router, TypeScript, Better Auth and parameterized node-postgres queries. SQL migrations replace the proposed Prisma ORM, keeping transaction locking, constraints and reporting queries explicit.
- INR, Asia/Kolkata, tax-exclusive agreed prices. Money uses bounded integer paise and BigInt intermediate arithmetic, never floating-point arithmetic for billing. API amount fields are integer paise (documented contract).
- No external APIs, ML, payment gateway, remote fonts or email provider. Development outbox stores local invoice messages and reset links; it does not claim external delivery.
- One best eligible discount per invoice; proportional largest-remainder allocation, HALF_UP tax per line. Uses consumed at confirmation under a row lock.
- Advance billing. Monthly/yearly anchors restore after short months. Partial final periods block for review. Resume starts a new cycle today and does not backbill paused time. Closed subscriptions are terminal; renewal extends an open agreement.
- Local hackathon implementation; no hosted publication or live payment processing is part of this task.
- Receivia supplies visual direction only: navy surfaces, rounded navigation, peach/blue atmospheric accents. No repository code is copied.
- Recurring add-on changes are staff-approved and effective at the next unbilled cycle, with before/after history. Existing unit prices stay agreed; new add-ons use catalog prices. There is no mid-cycle proration.
- Pause/closure require due cycles to be generated first. Resume starts at the later of today and the latest billed coverage boundary to prevent overlapping periods. Automatic expiry also closes paused agreements when their plan requires it.
- Renewal extends an existing finite expiry; open-ended agreements do not require renewal and cannot be silently shortened through the renewal action.
- Issued PDF financial terms come from frozen invoice snapshots; status and paid/balance reflect the current ledger at print time. Separate archival of PDF bytes is deferred.
- List pagination uses bounded 25-row pages and indexed filters; selectors cap at 500 records. BillGuard caps at 500 drafts/500 due subscriptions. Simulation caps at 1,000 active subscriptions and 20,000 projected cycles.
- Auth library schema migrations are generated programmatically through Better Auth's documented `getMigrations`; versioned application SQL files are applied once under an advisory transaction lock.
- Tests use dedicated PostgreSQL databases. Browser tests run a separate production server because this installed Next.js version prevents two development servers in one checkout.
- Customer profiles are created by a PostgreSQL trigger in the identity insert transaction. A conflicting staff-managed email rolls back the user insert, preventing orphan identities or unverified profile claims. Auth options are separate from auth initialization so first-run migrations do not race startup schema validation.
