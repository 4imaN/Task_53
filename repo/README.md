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
- Audited image export downloads
- Signed webhook delivery attempts persisted in `webhook_deliveries`

## Delivered role workspaces

- Warehouse Clerk: scan-first inventory work, assigned warehouse scope, document execution, search, inbox, profile
- Catalog Editor: catalog content, reviews/Q&A, favorites/history, bulk catalog import/export, search, inbox, profile
- Moderator: moderation queue, case status updates, inbox, search, profile
- Manager: operations dashboards, metrics, warehouse overview, bin timeline, search, bulk jobs, inbox, profile
- Administrator: user management, RBAC and attribute rules, security/session controls, integrations, audit visibility

## Quick start

1. Start the stack:
   `docker compose up --build`
2. Open the frontend:
   `http://localhost`
3. API health check:
   `http://localhost/api/health`

No manual `.env` editing is required for local startup. The Compose file includes local fallback values for:
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `DEFAULT_ADMIN_PASSWORD`

For production/on-prem deployment, explicitly set these values to organization-managed secrets.

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

Before running non-Docker API commands in a clean shell (one-time setup):

1. Create local API env overrides:
   `cd apps/api && cp .env.example .env.local`
2. Generate required secrets:
   ```bash
   cd apps/api
   cat > .env.local <<EOF
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
DEFAULT_ADMIN_PASSWORD=ChangeMeNow!123
# Optional DB override if localhost defaults do not match your machine:
# DATABASE_URL=postgres://$USER@localhost:5432/postgres
EOF
   ```

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
- search filters, time range, sorting, pagination, and saved views
- inventory keyboard scan and camera fallback states
- bulk pre-check/import/export flows
- warehouse setup UI flow
- admin access-control flow
- catalog, moderation, documents, profile/session, inbox, and logout flows

This suite uses Playwright route interception on purpose. It is for broad UI behavior coverage, not backend proof.

### 2. Real local non-Docker browser smoke

Small real integration proof against the actual local frontend and API without Docker:

1. Start PostgreSQL locally and make it reachable to the API.
2. Start the API locally:
   `cd apps/api && cp .env.example .env.local`
   ```bash
   cd apps/api
   cat > .env.local <<EOF
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
DEFAULT_ADMIN_PASSWORD=ChangeMeNow!123
# DATABASE_URL=postgres://$USER@localhost:5432/postgres
EOF
   ```
   `cd apps/api && npm install && npm run migrate && npm run bootstrap:admin && npm run dev`
3. Start the frontend locally:
   `cd apps/web && npm install && npm start`
4. Run the local real smoke:
   `cd apps/web && OMNISTOCK_E2E_ACTOR=warehouse-clerk OMNISTOCK_E2E_USERNAME='<username>' OMNISTOCK_E2E_PASSWORD='<password>' npm run test:ui:local`

What it verifies:

- real login against the local Fastify API
- cookie-based session establishment through the actual frontend
- protected-route access after login
- one real data-backed search page load

This command does not use Playwright API mocks and does not require Docker. It assumes the local frontend and API are already running.
It fails fast with actionable messages when:

- the Angular dev server is not reachable
- the API is not reachable through the frontend proxy
- the actor route is invalid or unavailable
- the required smoke credentials are missing

### Docker-backed live smoke

If you want the browser smoke against the Docker-served stack instead:

- `cd apps/web && OMNISTOCK_E2E_USERNAME=admin OMNISTOCK_E2E_PASSWORD='<your password>' npm run test:ui:live`

## Default admin bootstrap

The API bootstrap creates or updates the default administrator from environment values:

- username: `DEFAULT_ADMIN_USERNAME`
- password: `DEFAULT_ADMIN_PASSWORD`

Demo users are not seeded unless explicitly enabled.

- default: admin only
- enable demo users: set `SEED_DEMO_USERS=1` before running `npm run bootstrap:admin`

## Role-specific login pages

Dedicated actor entry routes:

- `http://localhost/login/administrator`
- `http://localhost/login/manager`
- `http://localhost/login/moderator`
- `http://localhost/login/catalog-editor`
- `http://localhost/login/warehouse-clerk`

`/login` does not expose any actor picker UI. It redirects to `/login/warehouse-clerk`.

The UI does not expose seeded credentials. Passwords are not shipped in frontend source or built frontend assets.

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
  `cd apps/web && OMNISTOCK_E2E_ACTOR=warehouse-clerk OMNISTOCK_E2E_USERNAME='<username>' OMNISTOCK_E2E_PASSWORD='<password>' npm run test:ui:local`
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
- ensure `apps/api/.env.local` contains:
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
- `npm run test:ui:local` is the real non-Docker frontend/API verification path. It expects the Angular dev server on `http://127.0.0.1:4200` and a local API reachable through `/api/health`.
- `npm run test:ui:live` is the non-mock verification path. It checks the real Docker-served frontend shell and logs into the real Fastify API through a Docker-backed smoke script.
- In this Codex sandbox, `npm test` still hit an environment-level `listen EPERM` when the preview server was started through the top-level npm lifecycle, while `npm run test:ui` and `npm run test:unit` both completed successfully. Treat that as a local shell/sandbox boundary, not as a stubbed test setup.

## Frontend feature notes

- Global search:
  combined filters for item, lot, warehouse, document status, and time range, with per-user saved views, sortable columns, pagination, and loading/error/empty feedback.
- Inventory scanning:
  USB keyboard-wedge input remains supported; camera scanning uses `getUserMedia` plus browser barcode detection when available, with unsupported, denied, failure, and cancel handling.
- CAPTCHA:
  the login page keeps the local CAPTCHA flow, but renders the challenge through a safe SVG data-image source instead of trusting raw HTML.
- Bulk processing:
  template download, pre-check validation, fix-and-reupload workflow, transactional import confirmation, per-row result reporting, and CSV/XLSX export initiation with in-flight protection.
  Bulk SQL paths now enforce department ABAC, and `/api/bulk/jobs` plus `/api/bulk/jobs/:jobId/results` are scoped by owner-or-department overlap for non-global roles.
- Access control UI:
  dedicated admin user management and scope assignment screens, plus role-specific workspaces and guarded routes.
- Catalog management:
  catalog editors and administrators can update existing item details inline from the catalog workspace with server-side authorization.
- Integrations:
  inbound HMAC routes enforce timestamp freshness and replay rejection, and configured webhook callbacks are signed, retried with backoff, and recorded in `webhook_deliveries`.

## Delivery scope

This repository is a minimally professional 0-to-1 deliverable for the OmniStock prompt, not a mocked prototype.
It implements the core warehouse, catalog, moderation, search, bulk-processing, auth/security, scheduler, and
integration paths needed for an offline on-prem deployment, with automated verification around the highest-risk
authorization and scheduler flows.
