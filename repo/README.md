# OmniStock

**Project type: fullstack**

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
   `docker-compose up`
   Or with a fresh build:
   `docker-compose up --build`
2. Open the frontend:
   `http://localhost`
3. Authenticated API health check:
   first obtain a token from `/api/auth/login`, then call `GET /api/health` with `Authorization: Bearer <token>`

`docker-compose up` is self-contained: it creates runtime secrets automatically through `omnistock-secrets-init` and stores them in the named volume `runtime-secrets`.
No checked-in static fallback secrets are used.
If you are switching from an older local setup and see database authentication errors, reset local state once with:
`docker-compose down -v --remove-orphans`

## Demo credentials

Demo users are seeded when `SEED_DEMO_USERS=1` is set in the environment before bootstrap. The Docker Compose stack enables this by default via the `.env` file or by exporting `SEED_DEMO_USERS=1` before running `docker-compose up`.

| Role             | Username          | Password            | Login URL                                |
|------------------|-------------------|---------------------|------------------------------------------|
| Administrator    | admin             | ChangeMeNow!123     | `http://localhost/login/administrator`   |
| Manager          | manager.demo      | ManagerDemo!123     | `http://localhost/login/manager`         |
| Moderator        | moderator.demo    | ModeratorDemo!123   | `http://localhost/login/moderator`       |
| Catalog Editor   | catalog.demo      | CatalogDemo!123     | `http://localhost/login/catalog-editor`  |
| Warehouse Clerk  | clerk.demo        | ClerkDemo!123       | `http://localhost/login/warehouse-clerk` |

The administrator account is always created during bootstrap. The four demo role accounts require `SEED_DEMO_USERS=1`.

Bootstrap provisioning enforces the shared password policy. Weak `DEFAULT_ADMIN_PASSWORD` values, or weak seeded demo passwords when `SEED_DEMO_USERS=1`, fail the bootstrap command before any users are written.

For production or on-prem deployment:
- provide organization-managed secrets explicitly
- remove `ALLOW_INSECURE_DEV_COOKIES`
- set `TRUST_PROXY` deliberately for your real reverse-proxy topology
- do not reuse the helper-generated local `.env` as a deployment secret source
- replace the local compose-generated runtime secrets with managed secret injection

## Local bootstrap helper

The repository also includes `scripts/bootstrap-local-dev.mjs` for generating non-static local development secrets and env files when maintainers need them outside the main Docker startup path.
The supported startup, verification, and test workflow in this README remains the Docker Compose path documented above.

## Browser verification

### Mocked browser verification

Fast, deterministic coverage that does not require the backend:

- `docker-compose exec omnistock-web npm run test:ui`

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

### Docker-backed live smoke

Browser smoke against the Docker-served stack:

- `docker-compose exec omnistock-web sh -c "OMNISTOCK_E2E_USERNAME=admin OMNISTOCK_E2E_PASSWORD='ChangeMeNow!123' npm run test:ui:live"`

The full live smoke defaults to the administrator actor because it is the smallest single role that can exercise search, inventory, document, moderation, and inbox flows end-to-end. Override `OMNISTOCK_E2E_ACTOR` only when you intentionally want narrower role-specific smoke coverage.

## Demo user scopes

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
  `docker-compose exec omnistock-api npm run jobs:run-once`
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
  `docker-compose exec omnistock-api sh -c 'RUN_DB_TESTS=1 npm run test:integration'`

The encryption coverage proves all of the following:

- encrypted-at-rest storage does not contain the plaintext secret or contact value
- server-side decryption still allows integration HMAC validation to work
- admin-facing responses do not leak encrypted or decrypted sensitive values

## Structure

- `apps/api`: Fastify REST API, migrations, services, and tests
- `apps/web`: Angular standalone-component app shell
- `run_tests.sh`: minimal test entrypoint

## Test Commands

All tests run inside Docker or against the Docker-served stack.

- Docker end-to-end API test run:
  `./run_tests.sh`
- Frontend unit + browser suite (inside container):
  `docker-compose exec omnistock-web npm test`
- Frontend unit tests only:
  `docker-compose exec omnistock-web npm run test:unit`
- Frontend Playwright browser suite only:
  `docker-compose exec omnistock-web npm run test:ui`
- Frontend live stack smoke against the running Docker deployment:
  `docker-compose exec omnistock-web sh -c "OMNISTOCK_E2E_USERNAME=admin OMNISTOCK_E2E_PASSWORD='ChangeMeNow!123' npm run test:ui:live"`
- API unit suite (inside container):
  `docker-compose exec omnistock-api npm test`
- API security-focused unit suite:
  `docker-compose exec omnistock-api npm run test:security`
- API DB-backed integration suite:
  `docker-compose exec omnistock-api sh -c 'RUN_DB_TESTS=1 npm run test:integration'`

`npm test` in the API container is intentionally non-DB and deterministic. It includes security-critical tests for CAPTCHA lockout progression and password-history reuse enforcement.

The API integration suite is DB-backed, gated behind `RUN_DB_TESTS=1`, and requires a reachable PostgreSQL database (provided by the Docker Compose stack).

`npm run test:integration` performs:
1. migrations
2. admin + demo bootstrap (`SEED_DEMO_USERS=1`)
3. integration test execution

## Verification notes

- `./run_tests.sh` verifies the Docker-backed API build plus unit/integration coverage.
- `docker-compose exec omnistock-web npm test` builds the Angular app and runs the Playwright browser verification suite.
- `docker-compose exec omnistock-web npm run test:unit` runs unit tests for frontend auth/search/camera helpers.
- Playwright starts a built-preview server automatically and runs against `http://127.0.0.1:4173` unless `PLAYWRIGHT_BASE_URL` is overridden.
- Frontend browser tests use mocked API routes so they remain runnable without the Fastify server.
- `npm run test:ui:live` is the non-mock verification path. It checks the real Docker-served frontend shell and logs into the real Fastify API through a Docker-backed smoke script.

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
