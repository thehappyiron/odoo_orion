# Local performance evidence

Measured 2026-10-31T10:47:15.065Z.

Warm production HTTP response including complete body, 3 warmups + 30 sequential requests, loopback network. HTML timings measure server response, not browser rendering or user-perceived navigation. No concurrency/load test.

Dataset: 10,000 subscriptions, 60,000 invoices, 20,000 payments, 1,001 customer profiles in isolated PostgreSQL database brightloop_benchmark.

Environment: win32, 13th Gen Intel(R) Core(TM) i5-13420H, 16 GB RAM, Node v24.22.1, PostgreSQL 18.6 on x86_64-windows, compiled by msvc-19.44.35229, 64-bit.

| Endpoint | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|
| /api/v1/subscriptions | 13.73 | 15.07 | 19.35 |
| /api/v1/subscriptions?page=100 | 37.09 | 73.17 | 74.23 |
| /api/v1/invoices?status=OVERDUE | 69.74 | 161.06 | 162.97 |
| /api/v1/payments | 67.59 | 170.11 | 171.21 |
| /api/v1/dashboard | 111.77 | 198.33 | 198.89 |
| /subscriptions | 7.96 | 12.24 | 23.27 |
| /invoices | 7.54 | 10.09 | 12.44 |
| / | 7.48 | 12.9 | 14.83 |

Reproduce: npm run build, then npm run test:perf. Requires free port 3100 and local PostgreSQL. The script resets ONLY brightloop_benchmark. It does not modify the demo database. This is local response-time evidence, not a production SLA or a browser-navigation benchmark.
