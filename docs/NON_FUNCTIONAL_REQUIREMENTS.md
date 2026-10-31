# Non-functional requirements: NF-001–NF-004

This document describes the performance and availability targets, privacy controls, and reusable load-testing tools. Targets are not claims of measured production performance or availability. Report actual results only from completed tests and operational monitoring.

## NF-001 — Performance

### Target and measurement

The target is a p95 response time of no more than 3,000 ms for each operation:

- Authentication (`POST /api/v1/auth/login`)
- Event search/listing (`GET /api/v1/events`)
- Event details (`GET /api/v1/events/:id`)
- Registration (`POST /api/v1/events/:id/register`)

The k6 scenario in `load-tests/event-management.js` records an operation-specific duration trend and enforces `p(95)<=3000`. It also enforces HTTP request failure and unexpected-response rates below 1%. A virtual user authenticates once, then reuses its bearer token; first logins are staggered by 100 ms per VU. Registration is attempted once per VU to avoid duplicate-registration responses in later iterations.

k6 exports a native JSON summary. Generate a Markdown report from that summary with `load-tests/report-performance.js`; the report contains aggregate requests per second, request/error rates, and endpoint p95 values. Preserve the JSON and Markdown outputs with the stage, duration, application version, environment, test-data profile, and resource observations. Do not infer measurements from source code or incomplete summaries.

Example PowerShell commands for one isolated test stage:

```powershell
$env:API_BASE_URL = "https://<non-production-host>/api/v1"
$env:LOAD_TEST_CONFIRM_NON_PRODUCTION = "true"
$env:LOAD_EVENT_ID = "<dedicated event ID>"
$env:LOAD_USER_PREFIX = "<generated attendee prefix>"
$env:LOAD_USER_DOMAIN = "<test email domain>"
$env:LOAD_USER_PASSWORD = "<shared test account password from a local secret source>"
$env:LOAD_MAX_VUS = "50"
$env:LOAD_DURATION = "5m"
k6 run --summary-export performance-50-vus.json load-tests/event-management.js
node load-tests/report-performance.js performance-50-vus.json performance-50-vus.md
```

The script permits HTTP only for loopback development; non-loopback targets must use HTTPS. It requires the explicit non-production opt-in and does not print passwords, tokens, or response bodies. Keep credentials in the local process environment or approved secret store, not in source files or reports.

## NF-002 — Availability

The monthly availability target is **at least 99.5%**. It is a target, not a measured availability claim.

Use an external monitor outside the application host/network:

- Probe `GET /api/health` every minute with a 5-second timeout.
- Every five minutes, run a dependency-backed synthetic check that authenticates with a dedicated least-privilege monitoring account and performs a read-only event listing. The health endpoint alone does not establish database availability.
- Treat two consecutive failed or timed-out checks as an outage, starting at the first failed probe. Close an incident after two consecutive successes and alert the on-call contact.
- Retain timestamped probe results, status, latency, incidents, and monitoring gaps. Missing data is not uptime; report gaps separately.

Calculate monthly availability as:

`(total calendar minutes - unavailable minutes) / total calendar minutes * 100`

For a 30-day month, 43,200 total minutes with 180 unavailable minutes yields 99.5833%. The 99.5% target allows at most 216 unavailable minutes in that month. Use the actual number of calendar minutes for each month.

Count planned maintenance and service interruptions as unavailable time whenever the monitored user journey is unavailable. Label maintenance separately, but do not exclude it from the target calculation. A month with unresolved monitoring gaps cannot be certified against the target.

## NF-003 — Privacy and data protection

- **Passwords:** Registration stores bcrypt hashes using cost factor 12. Login compares the submitted password with the stored hash. Passwords and hashes are excluded from authentication responses and application logs.
- **Authentication and authorization:** Protected routes validate bearer tokens and role-based access. Account status is checked against MySQL for authenticated requests. Tokens expire after one hour.
- **Sensitive payment data:** The application records payment status and registration references; it does not collect or persist raw card credentials. Use provider-hosted or tokenized payment collection if payment processing is added. Never log card numbers, security codes, or equivalent credentials.
- **Input and database handling:** Authentication, event, and registration inputs are validated server-side; SQL values are parameterized. Invalid requests receive client errors without exposing internal exception details.
- **Token storage:** The frontend currently stores bearer tokens in `localStorage`, where same-origin JavaScript can read them. A staged migration should add `Secure`, `HttpOnly`, appropriately `SameSite` cookies while continuing to accept bearer headers; then introduce credentialed requests and CSRF/origin protections, verify in staging, and require a fresh sign-in before removing the old localStorage path. Do not copy existing localStorage tokens into cookies with migration JavaScript.
- **Deployment transport:** Configure the deployed frontend and API for HTTPS with TLS 1.2 or newer, managed certificates, HTTP-to-HTTPS redirection, and HSTS at the trusted ingress. Set frontend/API origins explicitly and trust forwarded-protocol headers only from the controlled proxy. Keep JWT secrets out of source control and frontend bundles.

`test/nonFunctionalSecurity.test.js` covers password hashing and exposure, token handling, expired-token rejection, role authorization, and sensitive payment fields. The tests use mocks where applicable; they do not prove deployed TLS or production data handling.

## NF-004 — Scalability

`load-tests/event-management.js` supports staged constant-VU runs at **50, 100, 250, and 500 VUs**. These configurations provide a repeatable test plan; they do not establish that the service supports 500 concurrent users. Report capacity only when a completed run has actual measurements and satisfies the configured thresholds.

Run stages against an isolated non-production deployment with dedicated test accounts and events. Each account must be unused for its stage event, registration must be open, and event capacity must meet or exceed the VU count. Registration records persist; use a distinct dataset/event for each stage or perform the scoped cleanup procedure before reuse.

Before and during each stage, monitor load-generator CPU/network, API CPU/memory/restarts/request queueing/connection-pool saturation, and database CPU/memory/connections/query latency/lock waits. Capture resource samples at least every 30 seconds with timestamps corresponding to the k6 run. Stop escalation if the service becomes unstable or configured thresholds fail.

### Isolated test-data utilities

`load-tests/prepare-isolated-database.js` applies the repository schema and migrations to the dedicated `event_management_system_loadtest` database. `load-tests/prepare-test-data.js` prepares deterministic attendee accounts and a dedicated event using the application's bcrypt cost factor 12. Both utilities enforce isolated-database safeguards; review their command-line requirements before use. They do not authorize use of production or shared databases.

The data-preparation utility requires an empty dedicated test database, loopback database host, explicit non-production and create/cleanup confirmations, a dataset ID, stage size, test email domain, and a local test-account password. Database credentials are loaded from the local backend configuration or process environment. Never print or commit credentials. Cleanup is limited to matching deterministic dataset markers and refuses unexpected external references; keep application/load-test writers stopped while cleaning.

The k6 test and reporting utilities are covered by `test/loadTestScript.test.js`, `test/loadTestDataSetup.test.js`, and `test/performanceReport.test.js`. The isolated schema preparation utility is covered by `test/isolatedDatabaseSetup.test.js`.
