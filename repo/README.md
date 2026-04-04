# OmniStock

Offline warehouse and catalog management system for district-scale operations running on a closed local network.

## Included in this repo

- Angular 19 application shell in `apps/web`
- Fastify + TypeScript API implementation in `apps/api`
- PostgreSQL schema and seed migrations for the OmniStock domain
- Docker Compose topology with Nginx frontend reverse-proxying `/api/*`
- Core security implementation for:
  - local username/password auth
  - password complexity and history checks
  - CAPTCHA generation/verification
  - session persistence and revocation
  - RBAC and warehouse-scoped attribute filtering
  - immutable audit logging
  - HMAC-verified internal integrations with department isolation, per-client rate limiting, timestamp freshness, and replay protection
- Local nightly scheduler for operational metrics and archival
- Strict positive-quantity validation on inventory receive/move/pick flows
- Catalog item detail editing for catalog editors and administrators
- Review image uploads stored with server-generated filenames after MIME validation inside the configured upload root
- Audited image export downloads
- Signed webhook delivery attempts persisted in `webhook_deliveries`

## Delivered role workspaces

- Warehouse Clerk: scan-first inventory work, assigned warehouse scope, document execution, warehouse-scoped search, inbox, profile
- Catalog Editor: catalog content, reviews/Q&A, favorites/history, bulk catalog import/export, department-scoped search, inbox, profile
- Moderator: moderation queue, case status updates, inbox, department-scoped search, profile
- Manager: operations dashboards, metrics, warehouse overview, bin timeline, search, bulk jobs, inbox, profile
- Administrator: user management, RBAC and attribute rules, security/session controls, integrations, audit visibility

## Quick start

1. Start the stack:
   `docker compose up --build`
2. Open the frontend:
   `http://localhost`
3. Authenticated API health check:
   first obtain a token from `/api/auth/login`, then call `GET /api/health` with `Authorization: Bearer <token>`

`docker compose up` is self-contained: it creates runtime secrets automatically through `omnistock-secrets-init` and stores them in the named volume `runtime-secrets`.
No checked-in static fallback secrets are used.
If you are switching from an older local setup and see database authentication errors, reset local state once with:
`docker compose down -v --remove-orphans`

Optional local helper for non-Docker commands:
- `node scripts/bootstrap-local-dev.mjs`
- writes `./.env` and `apps/api/.env.local`
- useful when running API scripts directly on the host instead of inside compose

For production or on-prem deployment:
- provide organization-managed secrets explicitly
- remove `ALLOW_INSECURE_DEV_COOKIES`
- set `TRUST_PROXY` deliberately for your real reverse-proxy topology
- do not reuse the helper-generated local `.env` as a deployment secret source
- replace the local compose-generated runtime secrets with managed secret injection

## Frontend development without Docker

This path is for local frontend development and verification. It does not require Docker.

1. Install frontend dependencies:
   `cd apps/web && npm install`
2. Start the Angular dev server:
   `npm start`
3. Build the frontend locally:
   `npm run build`
4. Run the full frontend test suite:
   `npm test`
5. Preview the built frontend bundle:
   `npm run preview`

Local frontend server:
- `http://127.0.0.1:4200`

Local built preview server:
- `http://127.0.0.1:4173`

What works frontend-only:
- local build
- unit tests
- Playwright browser verification with mocked API responses
- responsive/layout verification
- auth/guard/route handling verification
- login precheck/CAPTCHA failure handling verification

If `npm test` is blocked by a restrictive local shell or sandbox policy while starting the preview server, run the two underlying commands directly:
- `npm run test:ui`
- `npm run test:unit`

What requires the local API:
- real login against Fastify/PostgreSQL
- live inventory, search, warehouse, admin, moderation, and bulk-processing data flows

Before running non-Docker API commands:

1. Generate local env files:
   `node scripts/bootstrap-local-dev.mjs`
2. If your local PostgreSQL role/database is not the default localhost fallback, edit `apps/api/.env.local` and set `DATABASE_URL`.

If you want live API-backed frontend verification without Docker:
- API:
  `cd apps/api && npm install && npm run migrate && npm run bootstrap:admin && npm run dev`
- Frontend:
  `cd apps/web && npm start`

The Angular dev server proxies `/api` to the Fastify API through `proxy.conf.json`.

## Browser verification modes

Two frontend browser verification modes are supported and both should exist:

### 1. Mocked browser verification

Fast, deterministic coverage that does not require the backend:

- `cd apps/web && npm run test:ui`

What it verifies:

- auth guard and role guard redirects
- login failure, login-hints failure, and CAPTCHA load failure handling
- topbar command search and quick-link interaction
- search filters, time range, sorting, pagination, saved-view quota handling, and saved views
- inventory keyboard scan, first-receipt scan, multi-lot disambiguation, and camera fallback states
- bulk pre-check/import/export flows
- warehouse setup UI flow
- admin access-control flow
- catalog, moderation, documents, profile/session, inbox, and logout flows

This suite uses Playwright route interception on purpose. It is for broad UI behavior coverage, not backend proof.

### 2. Real local non-Docker browser smoke

Small real integration proof against the actual local frontend and API without Docker:

1. Generate local env files:
   `node scripts/bootstrap-local-dev.mjs`
2. Start PostgreSQL locally and make it reachable to the API. If needed, set `DATABASE_URL` in `apps/api/.env.local`.
3. Start the API locally:
   `cd apps/api && npm install && npm run migrate && npm run bootstrap:admin && npm run dev`
4. Start the frontend locally:
   `cd apps/web && npm install && npm start`
5. Run the local real smoke:
   `cd apps/web && OMNISTOCK_E2E_USERNAME='<username>' OMNISTOCK_E2E_PASSWORD='<password>' npm run test:ui:local`

What it verifies:

- real login against the local Fastify API
- cookie-based session establishment through the actual frontend
- protected-route access after login
- one real data-backed search page load
- one real inventory receive flow
- one real document transition and execution flow
- one real moderation status update and reporter inbox notification flow

This command does not use Playwright API mocks and does not require Docker. It assumes the local frontend and API are already running.
It fails fast with actionable messages when:

- the Angular dev server is not reachable
- the API is not reachable through the frontend proxy
- the actor route is invalid or unavailable
- the required smoke credentials are missing

The full live smoke defaults to the administrator actor because it is the smallest single role that can exercise search, inventory, document, moderation, and inbox flows end-to-end. Override `OMNISTOCK_E2E_ACTOR` only when you intentionally want narrower role-specific smoke coverage.

### Docker-backed live smoke

If you want the browser smoke against the Docker-served stack instead:

- `cd apps/web && OMNISTOCK_E2E_USERNAME=admin OMNISTOCK_E2E_PASSWORD='<your password>' npm run test:ui:live`

## Default admin bootstrap

The API bootstrap creates or updates the default administrator from environment values:

- username: `DEFAULT_ADMIN_USERNAME`
- password: `DEFAULT_ADMIN_PASSWORD`

Demo users are not seeded unless explicitly enabled.

Bootstrap provisioning now enforces the same shared password policy used by runtime account creation and password changes. Weak `DEFAULT_ADMIN_PASSWORD` values, or weak seeded demo passwords when `SEED_DEMO_USERS=1`, fail the bootstrap command before any users are written.

- default: admin only
- enable demo users: set `SEED_DEMO_USERS=1` before running `npm run bootstrap:admin`

The seeded demo scopes are intentional:
- `moderator.demo` and `catalog.demo` receive department-backed scope so their search and moderation workspaces are usable
- `clerk.demo` remains warehouse-scoped
- manager and administrator stay global

Inventory workflow permissions are now intent-specific:
- `inventory.scan` for scan/lookup
- `inventory.receive` for receiving documents and receiving execution
- `inventory.pick` for shipping documents and shipping execution
- `inventory.move` for transfer documents and transfer execution
- `inventory.count` for cycle count document creation
- `inventory.adjust` for adjustment document creation

## Role-specific login pages

Dedicated actor entry routes:

- `http://localhost/login/administrator`
- `http://localhost/login/manager`
- `http://localhost/login/moderator`
- `http://localhost/login/catalog-editor`
- `http://localhost/login/warehouse-clerk`

`/login` does not expose any actor picker UI. It redirects to `/login/warehouse-clerk`.

The UI does not expose seeded credentials. Passwords are not shipped in frontend source or built frontend assets.

## Scope model

Search and moderation visibility now follow explicit role semantics instead of treating every non-admin role as warehouse-scoped:

- Administrator and Manager: global search visibility
- Warehouse Clerk: assigned-warehouse search visibility
- Moderator: assigned-department moderation queue and department-scoped search visibility
- Catalog Editor: assigned-department search visibility

Moderation report creation validates the target type and target existence before writing, and moderators only see queue items for departments they are authorized to govern.
Active abuse-report submission is idempotent per reporter and target, so duplicate open reports do not inflate the moderation queue or SLA metrics.

## Temperature taxonomy

Temperature bands are canonicalized to:

- `ambient`
- `chilled`
- `frozen`

The API normalizes legacy `cold` inputs to `chilled` during import/update flows, and migrations normalize persisted legacy rows before enforcing DB-level allowed values for `items.temperature_band` and `bins.temperature_band`.

## Cookie and Proxy Security

Session cookies are secure by default. Local plaintext HTTP only works when `ALLOW_INSECURE_DEV_COOKIES=1` is set in a development environment.

`TRUST_PROXY` is explicit. Set it only when the API is actually behind a trusted reverse proxy that is responsible for client IP forwarding. The generated local Docker Compose env enables it because the frontend Nginx container proxies requests to the API on the internal network.

Global API rate-limit localhost bypass is no longer always on. It can only be enabled through `ALLOW_DEV_RATE_LIMIT_LOCALHOST_BYPASS=1`, and only in development mode.

`/api/auth/login-hints` is intentionally low-signal and does not disclose account lock/captcha state for specific usernames. It is also separately throttled through:

- `LOGIN_HINTS_RATE_LIMIT_MAX` (default `15`)
- `LOGIN_HINTS_RATE_LIMIT_WINDOW_MS` (default `60000`)

`/api/auth/login` has dedicated route throttling in addition to the global API rate limit:

- `LOGIN_RATE_LIMIT_MAX` (default `100`)
- `LOGIN_RATE_LIMIT_WINDOW_MS` (default `60000`)

Session rotation is explicit through `POST /api/auth/sessions/rotate`. The route atomically creates a new active session, invalidates the previous session id, and returns the replacement session payload/token. The first-party Angular shell uses that route during authenticated bootstrap so browser sessions do not rely on the original login token for their full lifetime.

## Internal webhook target policy

Integration webhook targets now use a deny-by-default internal trust boundary:

- URL must be `http` or `https` with no embedded credentials.
- Literal IP targets must be private/internal.
- Hostname targets must be explicitly allowlisted (`WEBHOOK_ALLOWED_HOSTNAMES`) or match an allowlisted suffix (`WEBHOOK_ALLOWED_DOMAIN_SUFFIXES`).
- Hostnames are DNS-resolved and every resolved A/AAAA record must remain private/internal; mixed public/private resolution is rejected.
- Bare single-label hostnames are rejected unless they are explicitly listed in `WEBHOOK_ALLOWED_HOSTNAMES`.

Loopback webhook targets are only for local development and test:

- `ALLOW_DEV_WEBHOOK_LOOPBACK=1` is allowed in `APP_ENV=development`/`test`
- production rejects this flag

## Nightly scheduler

The API process runs a local scheduler and computes the next run for `02:00` server-local time.

Nightly jobs do all of the following:

- compute `put_away_time`
- compute `pick_accuracy`
- compute `review_resolution_sla`
- persist results in `operational_metrics`
- archive completed documents older than 365 days into `archived_documents`
- update the source document state to `archived`
- write `batch_jobs` trace rows
- write immutable audit rows for completed or failed scheduler jobs

### Scheduler verification

With the stack running:

- Run the job once manually:
  `docker compose exec omnistock-api npm run jobs:run-once`
- Inspect metrics:
  `http://localhost/api/metrics/summary`
- Inspect archived documents and batch jobs from PostgreSQL or through the admin/audit surfaces

## PostgreSQL encryption at rest

OmniStock uses PostgreSQL `pgcrypto` functions for selected high-risk fields. These values are encrypted in SQL before they are stored:

- `integration_clients.hmac_secret`
- `users.phone_number`
- `users.personal_email`

The backend decrypts these values server-side only when operationally required:

- integration HMAC verification decrypts `integration_clients.hmac_secret` inside the API process
- user contact fields are not returned by the admin list APIs

Required environment variable:

- `ENCRYPTION_KEY`

This key is loaded by the API config and also injected into the migration runner so legacy rows can be migrated safely with PostgreSQL encryption functions.

### Encryption verification

With PostgreSQL running and the schema applied:

- Run the API integration suite:
  `cd apps/api && RUN_DB_TESTS=1 npm run test:integration`

The encryption coverage proves all of the following:

- encrypted-at-rest storage does not contain the plaintext secret or contact value
- server-side decryption still allows integration HMAC validation to work
- admin-facing responses do not leak encrypted or decrypted sensitive values

## Structure

- `apps/api`: Fastify REST API, migrations, services, and tests
- `apps/web`: Angular standalone-component app shell
- `run_tests.sh`: minimal test entrypoint

## Test Commands

- Frontend unit + browser suite:
  `cd apps/web && npm test`
- Frontend unit tests only:
  `cd apps/web && npm run test:unit`
- Frontend Playwright browser suite only:
  `cd apps/web && npm run test:ui`
- Frontend Playwright local real smoke against a locally running frontend + API:
  `cd apps/web && OMNISTOCK_E2E_USERNAME='<username>' OMNISTOCK_E2E_PASSWORD='<password>' npm run test:ui:local`
- Frontend live stack smoke against the running Docker deployment:
  `cd apps/web && OMNISTOCK_E2E_USERNAME=admin OMNISTOCK_E2E_PASSWORD='<your password>' npm run test:ui:live`
- Frontend local preview:
  `cd apps/web && npm run preview`
- API unit suite:
  `cd apps/api && npm test`
- API security-focused unit suite:
  `cd apps/api && npm run test:security`
- API DB-backed integration suite:
  `cd apps/api && RUN_DB_TESTS=1 npm run test:integration`
- Docker end-to-end API test run:
  `./run_tests.sh`

`cd apps/api && npm test` is intentionally non-DB and deterministic. It now includes security-critical tests for CAPTCHA lockout progression and password-history reuse enforcement.

The API integration suite is DB-backed, gated behind `RUN_DB_TESTS=1`, and requires a reachable PostgreSQL database.

`npm run test:integration` now performs:
1. migrations
2. admin + demo bootstrap (`SEED_DEMO_USERS=1`)
3. integration test execution

Local API integration prep:
- run:
  `node scripts/bootstrap-local-dev.mjs`
- ensure `apps/api/.env.local` contains secure values for:
  - `JWT_SECRET`
  - `ENCRYPTION_KEY`
  - `DEFAULT_ADMIN_PASSWORD`
- ensure `DATABASE_URL` points to a PostgreSQL role and database that actually exist (or leave it unset to use the localhost fallback)
- then run:
  `cd apps/api && RUN_DB_TESTS=1 npm run test:integration`

If your machine does not have a local PostgreSQL role/database matching the default `DATABASE_URL`, export a working local `DATABASE_URL` first.

## Verification notes

- `./run_tests.sh` verifies the Docker-backed API build plus unit/integration coverage.
- `cd apps/web && npm test` builds the Angular app and runs the real Playwright browser verification suite.
- `cd apps/web && npm run test:unit` runs local unit tests for frontend auth/search/camera helpers.
- Playwright starts a local built-preview server automatically and runs against `http://127.0.0.1:4173` unless `PLAYWRIGHT_BASE_URL` is overridden.
- Frontend browser tests use mocked API routes so they remain runnable without the Fastify server.
- `npm run test:ui:local` is the real non-Docker frontend/API verification path. It expects the Angular dev server on `http://127.0.0.1:4200`, valid API login credentials in `OMNISTOCK_E2E_USERNAME` / `OMNISTOCK_E2E_PASSWORD`, and an authenticated local API health check through `/api/health`.
- `npm run test:ui:live` is the non-mock verification path. It checks the real Docker-served frontend shell and logs into the real Fastify API through a Docker-backed smoke script.
- In this Codex sandbox, `npm test` still hit an environment-level `listen EPERM` when the preview server was started through the top-level npm lifecycle, while `npm run test:ui` and `npm run test:unit` both completed successfully. Treat that as a local shell/sandbox boundary, not as a stubbed test setup.

## Frontend feature notes

- Global search:
  combined filters for item, lot, warehouse, document status, and time range, with per-user saved views, sortable columns, pagination, loading/error/empty feedback, a hard cap of 50 saved views per user, and a typed conflict response when the cap is reached for new names.
  Search rows are emitted as unique logical item/lot/warehouse results, so multi-barcode items do not inflate totals, duplicate rows, or break page boundaries.
- Inventory scanning:
  USB keyboard-wedge input remains supported; camera scanning uses `getUserMedia` plus browser barcode detection when available, with unsupported, denied, failure, and cancel handling.
  `/api/inventory/scan` now returns an explicit typed result:
  item-only match for first receipt, single visible lot/bin match, multiple visible lot/bin matches that require operator disambiguation, or no-match. The UI never silently picks `visible[0]`.
- CAPTCHA:
  the login page keeps the local CAPTCHA flow, but renders the challenge through a safe SVG data-image source instead of trusting raw HTML.
- Bulk processing:
  template download, pre-check validation, fix-and-reupload workflow, transactional import confirmation, per-row result reporting, and CSV/XLSX export initiation with in-flight protection.
  Bulk SQL paths now enforce department ABAC, `/api/bulk/jobs` plus `/api/bulk/jobs/:jobId/results` are scoped by owner-or-department overlap for non-global roles, and pre-check uniqueness results now match the real global SKU/barcode constraints even when the conflicting record lives outside the caller's visible department scope.
  If an import fails after pre-check has already passed, catalog mutations are still rolled back, but the failed `batch_job` and its row/message diagnostics remain durable for troubleshooting.
- Access control UI:
  dedicated admin user management and scope assignment screens, plus role-specific workspaces and guarded routes.
- Catalog management:
  catalog editors and administrators can update existing item details inline from the catalog workspace with server-side authorization.
- Integrations:
  inbound HMAC routes enforce timestamp freshness and replay rejection, per-client rate limits are persisted in PostgreSQL so they survive restarts and multi-instance deployments, and configured webhook callbacks are signed, retried with backoff, recorded in `webhook_deliveries` with minimized stored payload summaries, and purged after the configurable `WEBHOOK_DELIVERY_RETENTION_DAYS` window.
- Process logging:
  startup, migration, bootstrap, and nightly-job fatal errors now use the same secret-redacting log sanitizer as request-path error logging, so DSNs, bearer tokens, and secret-like key/value material are not emitted raw on stderr.

## Delivery scope

This repository is a minimally professional 0-to-1 deliverable for the OmniStock prompt, not a mocked prototype.
It implements the core warehouse, catalog, moderation, search, bulk-processing, auth/security, scheduler, and
integration paths needed for an offline on-prem deployment, with automated verification around the highest-risk
authorization and scheduler flows.
