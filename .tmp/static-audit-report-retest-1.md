# OmniStock Static Delivery Acceptance and Architecture Audit (Retest 2026-04-04)

## 1. Verdict
- Overall conclusion: **Partial Pass**
- Rationale: The repository is a real full-stack OmniStock implementation with strong module separation, substantial security work, and broad test assets, but one prompt-central clerk flow is still materially weakened: barcode lookup only works safely when there is exactly one visible warehouse-backed lot. Additional medium-severity issues remain around deterministic `404` handling for well-formed nonexistent IDs and saved-view quota behavior.

## 2. Scope and Static Verification Boundary
- What was reviewed:
  - Documentation, config, scripts, and manifests: `README.md:34`, `.env.example:1`, `apps/api/package.json:6`, `apps/web/package.json:6`, `scripts/bootstrap-local-dev.mjs:58`
  - Backend entry points, plugins, routes, services, and schema: `apps/api/src/server.ts:42`, `apps/api/src/routes/auth.ts:55`, `apps/api/src/routes/inventory.ts:52`, `apps/api/src/routes/search.ts:31`, `apps/api/src/routes/warehouses.ts:317`, `apps/api/src/routes/catalog.ts:162`, `apps/api/src/db/migrations/001_init.sql:26`
  - Frontend workspaces and feature pages: `apps/web/src/app/app.routes.ts:25`, `apps/web/src/app/features/search/search-page.component.ts:27`, `apps/web/src/app/features/inventory/inventory-page.component.ts:14`
  - Unit, integration, and browser test sources: `apps/api/test/api-auth.integration.test.ts:43`, `apps/api/test/api-security.integration.test.ts:67`, `apps/api/test/api-inventory.integration.test.ts:7`, `apps/web/playwright/ui-smoke.spec.ts:22`, `apps/web/playwright/ui-local-smoke.spec.ts:28`
- What was not reviewed:
  - Live runtime behavior under real startup, browser, network, Docker, PostgreSQL, USB scanner, or camera conditions.
- What was intentionally not executed:
  - Project startup, Docker, tests, migrations, browser automation, or any external/integration calls.
- Claims requiring manual verification:
  - Real keyboard-wedge scanner behavior and camera compatibility.
  - Real nightly scheduler firing at deployment-local 02:00.
  - Real webhook reachability and DNS behavior in the target offline network.
  - Real end-to-end flows that depend on infrastructure rather than static code evidence.

## 3. Repository / Requirement Mapping Summary
- Prompt core business goal: offline warehouse and catalog governance for district-style organizations, with fast multi-role workspaces, inventory location control, bulk file processing, moderation/inbox workflows, secure local auth, RBAC plus attribute scoping, immutable auditing, and on-prem signed integrations.
- Main implementation areas mapped to that goal:
  - Fastify API registration and plugins: `apps/api/src/server.ts:71`
  - Warehouse, inventory, catalog, moderation, bulk, admin, search, integration, and scheduler services/routes: `apps/api/src/routes/inventory.ts:55`, `apps/api/src/routes/bulk.ts:49`, `apps/api/src/routes/catalog.ts:218`, `apps/api/src/routes/moderation.ts:106`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/services/scheduler.service.ts:45`
  - Angular role workspaces and task pages: `apps/web/src/app/app.routes.ts:33`
  - PostgreSQL schema for inventory, content, audit, sessions, integrations, and batch jobs: `apps/api/src/db/migrations/001_init.sql:89`, `apps/api/src/db/migrations/001_init.sql:137`, `apps/api/src/db/migrations/001_init.sql:288`, `apps/api/src/db/migrations/001_init.sql:313`, `apps/api/src/db/migrations/001_init.sql:345`, `apps/api/src/db/migrations/001_init.sql:411`

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 4.1.1 Documentation and static verifiability
- Conclusion: **Pass**
- Rationale: The repository provides coherent startup/config/test instructions and the documented API/web entry points align with the actual project structure.
- Evidence: `README.md:34`, `README.md:65`, `README.md:116`, `README.md:180`, `.env.example:1`, `apps/api/package.json:6`, `apps/web/package.json:6`
- Manual verification note: Runtime success still requires manual execution because this audit stayed static-only.

#### 4.1.2 Material deviation from Prompt
- Conclusion: **Partial Pass**
- Rationale: The codebase is clearly centered on the OmniStock prompt, but the scan-first clerk workflow materially deviates from the requirement because barcode lookup only returns one visible warehouse-backed lot row. It cannot represent item-only first receipt and does not safely disambiguate multi-lot matches.
- Evidence: `apps/api/src/services/inventory.service.ts:67`, `apps/api/src/services/inventory.service.ts:100`, `apps/api/src/services/inventory.service.ts:105`, `apps/api/src/services/access-control.service.ts:108`, `apps/web/src/app/features/inventory/inventory-page.component.ts:62`, `apps/web/src/app/features/inventory/inventory-page.component.ts:181`, `apps/web/src/app/features/inventory/inventory-page.component.ts:268`, `apps/api/src/db/migrations/001_init.sql:166`, `apps/api/src/db/migrations/001_init.sql:178`
- Manual verification note: Real scanner/device behavior is manual, but this prompt-fit gap is statically evident from the lookup and UI contracts.

### 4.2 Delivery Completeness

#### 4.2.1 Core explicit requirements coverage
- Conclusion: **Partial Pass**
- Rationale: Most explicit prompt requirements are implemented: local auth, CAPTCHA and lockout, RBAC/ABAC, immutable audit log, search workspace, inventory/location management, bin timeline, bulk CSV/XLSX flows, catalog reviews/Q&A/images, moderation inbox updates, signed integrations, and scheduled metrics/archive jobs. The remaining material gap is the scan-first receiving workflow, plus a degraded saved-view edge path in an explicit search feature.
- Evidence: `apps/api/src/routes/auth.ts:82`, `apps/api/src/services/auth.service.ts:82`, `apps/api/src/routes/search.ts:34`, `apps/api/src/routes/search.ts:53`, `apps/api/src/routes/inventory.ts:55`, `apps/api/src/routes/warehouses.ts:612`, `apps/api/src/routes/warehouses.ts:688`, `apps/api/src/routes/bulk.ts:49`, `apps/api/src/services/bulk-import.service.ts:73`, `apps/api/src/services/bulk-import.service.ts:187`, `apps/api/src/routes/catalog.ts:218`, `apps/api/src/services/moderation.service.ts:42`, `apps/api/src/routes/moderation.ts:106`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/services/integration-security.service.ts:48`, `apps/api/src/services/scheduler.service.ts:45`, `apps/api/src/db/migrations/001_init.sql:429`, `apps/api/src/services/search.service.ts:185`
- Manual verification note: Hardware scan and real nightly execution remain manual.

#### 4.2.2 0-to-1 end-to-end deliverable shape
- Conclusion: **Pass**
- Rationale: This is a complete application delivery, not a fragment or teaching sample: it includes schema, seeds, backend, frontend, admin/security surfaces, and test assets.
- Evidence: `apps/api/src/server.ts:78`, `apps/web/src/app/app.routes.ts:25`, `apps/api/src/db/migrations/001_init.sql:26`, `README.md:5`

### 4.3 Engineering and Architecture Quality

#### 4.3.1 Structure and module decomposition
- Conclusion: **Pass**
- Rationale: Responsibilities are sensibly split across Fastify plugins, route modules, domain services, migrations, Angular feature pages, and test suites.
- Evidence: `apps/api/src/server.ts:71`, `apps/api/src/plugins/auth.ts:8`, `apps/api/src/plugins/rbac.ts:3`, `apps/api/src/services/access-control.service.ts:33`, `apps/api/src/services/integration-security.service.ts:35`, `apps/web/src/app/app.routes.ts:25`

#### 4.3.2 Maintainability and extensibility
- Conclusion: **Partial Pass**
- Rationale: The overall codebase is maintainable, but two cross-cutting design choices already create drift across multiple surfaces: global-role access helpers skip existence resolution on some resource checks, and saved-view quota handling is hardcoded as an untyped generic error before the upsert path. Both patterns make future behavior less predictable.
- Evidence: `apps/api/src/services/access-control.service.ts:193`, `apps/api/src/services/access-control.service.ts:235`, `apps/api/src/routes/warehouses.ts:317`, `apps/api/src/routes/warehouses.ts:612`, `apps/api/src/routes/catalog.ts:359`, `apps/api/src/routes/catalog.ts:548`, `apps/api/src/services/search.service.ts:185`, `apps/api/src/services/search.service.ts:195`

### 4.4 Engineering Details and Professionalism

#### 4.4.1 Error handling, logging, validation, and API design
- Conclusion: **Partial Pass**
- Rationale: Request validation and centralized error handling are generally strong, but several well-formed nonexistent-ID paths still return misleading `200`/empty responses or fall through to generic `500`s, the saved-view quota path also degrades to a generic `500`, and startup/maintenance scripts bypass the request-log sanitization helper.
- Evidence: `apps/api/src/server.ts:93`, `apps/api/src/server.ts:129`, `apps/api/src/routes/warehouses.ts:620`, `apps/api/src/routes/catalog.ts:372`, `apps/api/src/routes/catalog.ts:407`, `apps/api/src/routes/catalog.ts:496`, `apps/api/src/routes/catalog.ts:529`, `apps/api/src/routes/catalog.ts:575`, `apps/api/src/services/search.service.ts:191`, `apps/api/src/index.ts:15`, `apps/api/src/db/migrate.ts:56`, `apps/api/src/db/bootstrap-admin.ts:210`, `apps/api/src/scripts/run-nightly-jobs.ts:22`

#### 4.4.2 Product/service maturity vs demo
- Conclusion: **Pass**
- Rationale: The deliverable looks like a real service: auth/session rotation, ABAC, audit logging, encrypted fields, webhook delivery persistence, scoped bulk jobs, and scheduled operational jobs are all product-grade concerns rather than demo-only behavior.
- Evidence: `apps/api/src/services/auth.service.ts:131`, `apps/api/src/plugins/audit.ts:4`, `apps/api/src/routes/admin.ts:279`, `apps/api/src/routes/admin.ts:653`, `apps/api/src/services/webhook-delivery.service.ts:53`, `apps/api/src/services/scheduler.service.ts:82`, `apps/api/test/api-security.integration.test.ts:712`

### 4.5 Prompt Understanding and Requirement Fit

#### 4.5.1 Business goal and implicit constraints fit
- Conclusion: **Partial Pass**
- Rationale: The repository understands the offline, multi-role, security-heavy warehouse/catalog scenario well. The main remaining semantic miss is that the barcode workflow is implemented as a single existing-lot lookup instead of a robust item-or-lot entry point for receiving, moving, and picking.
- Evidence: `README.md:3`, `README.md:26`, `apps/web/src/app/app.routes.ts:34`, `apps/api/src/services/inventory.service.ts:67`, `apps/web/src/app/features/inventory/inventory-page.component.ts:64`, `apps/web/src/app/features/inventory/inventory-page.component.ts:182`

### 4.6 Aesthetics (Frontend)

#### 4.6.1 Visual and interaction quality
- Conclusion: **Pass**
- Rationale: The frontend has clear workspace hierarchy, distinct panels, pagination/sort controls, inline status feedback, camera fallback states, and verified interaction affordances in the mocked browser suite.
- Evidence: `apps/web/src/app/features/search/search-page.component.ts:27`, `apps/web/src/app/features/search/search-page.component.ts:72`, `apps/web/src/app/features/inventory/inventory-page.component.ts:23`, `apps/web/src/app/features/inventory/inventory-page.component.ts:41`, `apps/web/playwright/ui-smoke.spec.ts:83`, `apps/web/playwright/ui-smoke.spec.ts:140`, `apps/web/playwright/ui-smoke.spec.ts:187`
- Manual verification note: Final cross-browser rendering quality still requires manual browser review.

## 5. Issues / Suggestions (Severity-Rated)

### 1) High
- Severity: **High**
- Title: **Scan-first barcode lookup cannot safely support item-level receiving or multi-lot matches**
- Conclusion: **Fail**
- Evidence: `apps/api/src/services/inventory.service.ts:67`, `apps/api/src/services/inventory.service.ts:100`, `apps/api/src/services/inventory.service.ts:105`, `apps/api/src/services/access-control.service.ts:108`, `apps/web/src/app/features/inventory/inventory-page.component.ts:62`, `apps/web/src/app/features/inventory/inventory-page.component.ts:181`, `apps/web/src/app/features/inventory/inventory-page.component.ts:268`, `apps/api/test/api-inventory.integration.test.ts:33`, `apps/web/playwright/ui-local-smoke.spec.ts:36`, `apps/api/src/db/migrations/001_init.sql:166`, `apps/api/src/db/migrations/001_init.sql:178`
- Impact:
  - A barcode for a catalog item with no existing lot/warehouse row is filtered out and returns `404`, so the prompt’s scan-first receiving flow is not available for first receipt.
  - When a barcode or SKU matches more than one visible lot/bin, the service returns `visible[0]` without deterministic ordering or operator disambiguation, so pick/move/receive actions can target an arbitrary lot.
- Minimum actionable fix:
  - Change `/api/inventory/scan` to return a typed result that distinguishes item-only matches from lot/bin matches.
  - Add a disambiguation path when multiple lots or bins are visible for the same code.
  - Update the Angular inventory page to handle item-only receipt by letting the user choose warehouse/bin before first receipt.
  - Add API and UI tests for item-only barcode receipt and multi-lot match handling.

### 2) Medium
- Severity: **Medium**
- Title: **Several routes still handle well-formed nonexistent resource IDs inconsistently**
- Conclusion: **Fail**
- Evidence: `apps/api/src/services/access-control.service.ts:193`, `apps/api/src/services/access-control.service.ts:235`, `apps/api/src/routes/warehouses.ts:317`, `apps/api/src/routes/warehouses.ts:612`, `apps/api/src/routes/catalog.ts:359`, `apps/api/src/routes/catalog.ts:396`, `apps/api/src/routes/catalog.ts:485`, `apps/api/src/routes/catalog.ts:515`, `apps/api/src/routes/catalog.ts:548`, `apps/api/src/server.ts:129`
- Impact:
  - Global-role users can hit generic `500`s from foreign-key failures on favorite/review/question/answer writes instead of deterministic `404`s.
  - Some reads return misleading success payloads such as empty warehouse trees or `{ item: null }` rather than a proper not-found response.
  - This weakens API professionalism and makes operator/admin troubleshooting harder.
- Minimum actionable fix:
  - Resolve resource existence before global-role short-circuits return from `ensureItemAccess` and `ensureQuestionAccess`, or add explicit route-level existence checks before inserts/reads.
  - Add integration coverage for well-formed nonexistent UUIDs on the affected catalog and warehouse routes.

### 3) Medium
- Severity: **Medium**
- Title: **Saved-view quota returns a generic `500` and blocks updates once the cap is reached**
- Conclusion: **Fail**
- Evidence: `apps/api/src/services/search.service.ts:185`, `apps/api/src/services/search.service.ts:191`, `apps/api/src/services/search.service.ts:195`, `apps/api/src/routes/search.ts:59`, `apps/api/src/server.ts:129`, `apps/web/playwright/ui-smoke.spec.ts:83`, `apps/web/playwright/support/mock-api.ts:473`
- Impact:
  - A core search feature degrades into an opaque server error instead of a typed user-facing validation/conflict response.
  - Existing saved views cannot be updated once a user reaches the quota because the count check happens before the upsert conflict path.
- Minimum actionable fix:
  - Replace the generic `Error` with a typed `409` or `422`.
  - Exempt updates of an existing `(user_id, view_name)` record from the cap check.
  - Add API integration tests for create-at-limit and update-at-limit behavior.

### 4) Low
- Severity: **Low**
- Title: **Startup and maintenance scripts bypass structured error redaction**
- Conclusion: **Partial Fail**
- Evidence: `apps/api/src/index.ts:15`, `apps/api/src/db/migrate.ts:56`, `apps/api/src/db/bootstrap-admin.ts:210`, `apps/api/src/scripts/run-nightly-jobs.ts:22`, `apps/api/src/server.ts:27`, `apps/api/test/error-sanitization.test.ts:75`
- Impact:
  - If uncaught startup or maintenance errors contain DSNs, tokens, or secret-like material, those paths write raw errors to stderr rather than the sanitized request logging path.
- Minimum actionable fix:
  - Route these catch blocks through a shared redaction helper such as `sanitizeErrorForLog`, or move them onto the same structured logger used by request handling.

## 6. Security Review Summary

- Authentication entry points: **Pass**
  - Evidence: `apps/api/src/routes/auth.ts:82`, `apps/api/src/plugins/auth.ts:18`, `apps/api/src/services/auth.service.ts:82`, `apps/api/src/services/auth.service.ts:131`, `apps/api/src/services/auth.service.ts:280`, `apps/api/test/api-auth.integration.test.ts:46`, `apps/api/test/api-auth.integration.test.ts:319`
  - Reasoning: Local username/password auth, CAPTCHA escalation, lockout, password history, cookie plus bearer session handling, and revocation/rotation are all implemented.

- Route-level authorization: **Pass**
  - Evidence: `apps/api/src/plugins/rbac.ts:4`, `apps/api/src/routes/search.ts:34`, `apps/api/src/routes/inventory.ts:55`, `apps/api/src/routes/warehouses.ts:317`, `apps/api/src/routes/admin.ts:227`, `apps/api/test/api-security.integration.test.ts:70`
  - Reasoning: Sensitive routes consistently use authentication plus permission checks; unauthorized access paths are explicitly tested.

- Object-level authorization: **Partial Pass**
  - Evidence: `apps/api/src/services/access-control.service.ts:74`, `apps/api/src/services/access-control.service.ts:120`, `apps/api/src/services/access-control.service.ts:193`, `apps/api/src/services/moderation.service.ts:147`, `apps/api/test/api-security.integration.test.ts:166`, `apps/api/test/api-moderation.integration.test.ts:92`
  - Reasoning: Warehouse and department scoping are implemented across search, catalog, moderation, and bulk features. The remaining weakness is that some global-role paths skip existence resolution and therefore do not produce consistent resource-level responses.

- Function-level authorization: **Pass**
  - Evidence: `apps/api/src/services/access-control.service.ts:288`, `apps/api/src/routes/catalog.ts:521`, `apps/api/src/routes/admin.ts:121`, `apps/api/test/api-security.integration.test.ts:131`
  - Reasoning: High-risk functions such as catalog answers and admin access-control changes have explicit role/function gates.

- Tenant / user data isolation: **Pass**
  - Evidence: `apps/api/src/services/access-control.service.ts:44`, `apps/api/src/services/access-control.service.ts:74`, `apps/api/src/services/integration-security.service.ts:101`, `apps/api/src/services/bulk-import.service.ts:832`, `apps/api/test/api-search.integration.test.ts:146`, `apps/api/test/api-security.integration.test.ts:246`
  - Reasoning: Department and warehouse scoping are enforced in search, bulk jobs/results, catalog visibility, moderation, and integration payload isolation.

- Admin / internal / debug protection: **Pass**
  - Evidence: `apps/api/src/routes/admin.ts:121`, `apps/api/src/routes/admin.ts:227`, `apps/api/src/routes/health.ts:4`, `apps/api/src/routes/integrations.ts:12`, `apps/api/test/runtime-security.test.ts:110`
  - Reasoning: Admin endpoints are admin-only, `/api/health` is authenticated, no unprotected debug routes were found in registered API modules, and the unauthenticated integration endpoint is protected by HMAC/timestamp/replay checks.

## 7. Tests and Logging Review

- Unit tests: **Pass**
  - Evidence: `apps/api/package.json:13`, `apps/web/package.json:11`, `apps/api/test/error-sanitization.test.ts:5`, `apps/api/test/review-image-storage.test.ts:10`, `apps/api/test/runtime-security.test.ts:50`
  - Reasoning: There is meaningful API-side unit/security testing plus frontend unit coverage.

- API / integration tests: **Partial Pass**
  - Evidence: `apps/api/package.json:15`, `apps/api/test/api-auth.integration.test.ts:43`, `apps/api/test/api-bulk.integration.test.ts:24`, `apps/api/test/api-catalog.integration.test.ts:38`, `apps/api/test/api-inventory.integration.test.ts:7`, `apps/api/test/api-search.integration.test.ts:6`, `apps/api/test/api-security.integration.test.ts:67`
  - Reasoning: Integration coverage is broad, but it still misses the current high-risk item-only/multi-lot scan behavior, the well-formed nonexistent-ID edge cases on several routes, and the saved-view quota path.

- Logging categories / observability: **Partial Pass**
  - Evidence: `apps/api/src/server.ts:93`, `apps/api/src/plugins/audit.ts:14`, `apps/api/src/services/scheduler.service.ts:106`, `apps/api/src/index.ts:15`
  - Reasoning: Request errors, audit trails, and scheduler job outcomes are logged, but some startup and maintenance paths still use raw `console.error`.

- Sensitive-data leakage risk in logs / responses: **Partial Pass**
  - Evidence: `apps/api/src/server.ts:22`, `apps/api/src/server.ts:35`, `apps/api/test/error-sanitization.test.ts:10`, `apps/api/test/error-sanitization.test.ts:75`, `apps/api/test/api-security.integration.test.ts:712`
  - Reasoning: Request-path sanitization and response hardening are good, and encrypted user contact fields are tested. Residual leakage risk remains on the uncaught startup/script logging paths noted above.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist:
  - API via Vitest: `apps/api/package.json:13`
  - Frontend unit tests via Node test runner: `apps/web/package.json:11`
- API / integration tests exist:
  - DB-backed Vitest suites: `apps/api/package.json:15`
- Browser tests exist:
  - Mocked Playwright coverage: `apps/web/package.json:12`, `apps/web/playwright/ui-smoke.spec.ts:22`
  - Local real smoke coverage: `apps/web/package.json:13`, `apps/web/playwright/ui-local-smoke.spec.ts:28`
- Test commands are documented:
  - Frontend local/test commands: `README.md:69`, `README.md:75`, `README.md:124`
  - Local real smoke commands: `README.md:144`, `README.md:151`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) (`file:line`) | Key Assertion / Fixture / Mock (`file:line`) | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Local auth, CAPTCHA escalation, lockout, actor gating, password history, session revocation | `apps/api/test/api-auth.integration.test.ts:46`, `apps/api/test/api-auth.integration.test.ts:319`, `apps/api/test/api-auth.integration.test.ts:394` | Lockout after 7 failures and admin unlock (`apps/api/test/api-auth.integration.test.ts:110`, `apps/api/test/api-auth.integration.test.ts:133`); revoked sessions after password change (`apps/api/test/api-auth.integration.test.ts:351`, `apps/api/test/api-auth.integration.test.ts:360`) | sufficient | No material static gap found in core auth flows | Add one integration test for idle-timeout revocation if that path is considered release-critical. |
| Search filtering, pagination, sorting, and scoped visibility | `apps/api/test/api-search.integration.test.ts:9`, `apps/api/test/api-search.integration.test.ts:146`, `apps/web/playwright/ui-smoke.spec.ts:83` | Search result counts and scoped visibility (`apps/api/test/api-search.integration.test.ts:118`, `apps/api/test/api-search.integration.test.ts:248`); mocked UI pagination/sort interactions (`apps/web/playwright/ui-smoke.spec.ts:97`, `apps/web/playwright/ui-smoke.spec.ts:119`) | basically covered | Backend saved-view persistence/quota behavior is not covered by API tests | Add integration tests for `/api/search/views` create, update, and quota-at-limit paths. |
| Saved views as a user feature | `apps/web/playwright/ui-smoke.spec.ts:83` | Mock-only persistence through intercepted `/api/search/views` (`apps/web/playwright/support/mock-api.ts:473`) | insufficient | The real backend quota and upsert semantics are untested; current tests would still pass with the saved-view bug in place | Add API integration tests that create up to the cap, then update an existing view and attempt one extra create. |
| Inventory scan and receive flow | `apps/api/test/api-inventory.integration.test.ts:33`, `apps/api/test/api-inventory.integration.test.ts:86`, `apps/web/playwright/ui-local-smoke.spec.ts:36` | Existing-lot scan returns `warehouse_id` (`apps/api/test/api-inventory.integration.test.ts:77`); receive writes a lot and position (`apps/api/test/api-inventory.integration.test.ts:137`, `apps/api/test/api-inventory.integration.test.ts:145`); live smoke receives after a seeded lookup (`apps/web/playwright/ui-local-smoke.spec.ts:41`) | insufficient | Only the happy path for a single existing lot is covered; item-only first receipt and multi-lot ambiguity are not exercised | Add API/UI tests for a barcode on an item with no lot yet, and for a barcode/SKU that matches multiple visible lots. |
| Warehouse tree/timeline access control | `apps/api/test/api-security.integration.test.ts:70`, `apps/api/test/api-validation.integration.test.ts:9` | Out-of-scope clerk gets `403` for tree and timeline (`apps/api/test/api-security.integration.test.ts:116`, `apps/api/test/api-security.integration.test.ts:124`); malformed UUIDs return `422` (`apps/api/test/api-validation.integration.test.ts:36`) | basically covered | No test for a well-formed but nonexistent warehouse UUID returning deterministic `404` for global roles | Add integration coverage for nonexistent warehouse/tree and nonexistent zone/bin writes. |
| Catalog, moderation, and inbox ABAC | `apps/api/test/api-catalog.integration.test.ts:41`, `apps/api/test/api-security.integration.test.ts:131`, `apps/api/test/api-moderation.integration.test.ts:48`, `apps/api/test/api-moderation.integration.test.ts:92` | Full favorite/question/answer/detail flow (`apps/api/test/api-catalog.integration.test.ts:66`, `apps/api/test/api-catalog.integration.test.ts:152`); answer permission denial (`apps/api/test/api-security.integration.test.ts:155`); moderation target `404` and scoped queue filtering (`apps/api/test/api-moderation.integration.test.ts:86`, `apps/api/test/api-moderation.integration.test.ts:153`) | basically covered | Global-role nonexistent item/question edge paths are not tested and can still yield misleading `200`/`500` responses | Add integration tests for nonexistent item favorite/review/question/detail and nonexistent question answer as admin. |
| Bulk CSV/XLSX precheck, import/export, and scoped job visibility | `apps/api/test/api-bulk.integration.test.ts:71`, `apps/api/test/api-bulk.integration.test.ts:140`, `apps/api/test/api-security.integration.test.ts:246` | CSV and XLSX import success (`apps/api/test/api-bulk.integration.test.ts:95`, `apps/api/test/api-bulk.integration.test.ts:184`); scoped outsider cannot see another department’s job results (`apps/api/test/api-security.integration.test.ts:322`, `apps/api/test/api-security.integration.test.ts:330`) | sufficient | No material static gap found in the reviewed bulk paths | Add one rollback-focused assertion if import transaction failure handling becomes a release concern. |
| Integration HMAC, replay protection, department isolation, and internal webhook validation | `apps/api/test/api-security.integration.test.ts:362`, `apps/api/test/api-security.integration.test.ts:572`, `apps/api/test/api-security.integration.test.ts:646`, `apps/api/test/webhook-url.test.ts:4` | `200`/`409`/`429`/`401`/`403` integration checks (`apps/api/test/api-security.integration.test.ts:393`, `apps/api/test/api-security.integration.test.ts:445`, `apps/api/test/api-security.integration.test.ts:487`); single-label webhook rejection and loopback acceptance (`apps/api/test/api-security.integration.test.ts:683`, `apps/api/test/api-security.integration.test.ts:700`) | sufficient | No material static gap found in the previously flagged webhook controls | Add one route-level test for mixed private/public DNS resolution if future changes touch resolver policy. |
| Request/response log sanitization | `apps/api/test/error-sanitization.test.ts:10`, `apps/api/test/error-sanitization.test.ts:75` | 500 responses stay generic (`apps/api/test/error-sanitization.test.ts:25`); logs redact DSNs, bearer tokens, and secret-like strings (`apps/api/test/error-sanitization.test.ts:102`) | basically covered | Startup/migration/bootstrap/job-runner catch blocks are outside this coverage | Add unit tests for a shared startup error logger once those raw `console.error` paths are refactored. |

### 8.3 Security Coverage Audit
- Authentication: **sufficient**
  - Coverage: `apps/api/test/api-auth.integration.test.ts:46`, `apps/api/test/api-auth.integration.test.ts:178`, `apps/api/test/api-auth.integration.test.ts:319`, `apps/api/test/runtime-security.test.ts:51`
  - Assessment: Severe auth defects around lockout, rate limiting, actor gating, cookie security, and password history are likely to be caught.

- Route authorization: **basically covered**
  - Coverage: `apps/api/test/api-security.integration.test.ts:70`, `apps/api/test/api-security.integration.test.ts:131`, `apps/api/test/api-validation.integration.test.ts:9`
  - Assessment: Core `401`/`403` route checks exist, but not every privileged route is exercised with well-formed nonexistent IDs.

- Object-level authorization: **basically covered**
  - Coverage: `apps/api/test/api-security.integration.test.ts:166`, `apps/api/test/api-moderation.integration.test.ts:92`
  - Assessment: Department and warehouse ABAC are meaningfully tested. Severe scope-leak regressions would likely be caught, but the current route set can still hide existence-handling defects for global roles.

- Tenant / data isolation: **sufficient**
  - Coverage: `apps/api/test/api-search.integration.test.ts:146`, `apps/api/test/api-security.integration.test.ts:246`, `apps/api/test/api-security.integration.test.ts:362`
  - Assessment: Search, bulk jobs/results, and integration department isolation are tested well enough that major cross-department leakage would likely be detected.

- Admin / internal protection: **basically covered**
  - Coverage: `apps/api/test/runtime-security.test.ts:110`, `apps/api/test/api-security.integration.test.ts:646`, `apps/api/test/api-security.integration.test.ts:712`
  - Assessment: Health auth, webhook restrictions, and admin list secrecy are tested, but there is not exhaustive per-route admin coverage across every admin endpoint.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Covered major risks:
  - Local auth hardening, session/cookie behavior, search scoping, catalog/moderation ABAC, bulk job isolation, integration HMAC/replay/rate controls, webhook URL hardening, and request-path log sanitization.
- Uncovered risks that mean tests could still pass while severe defects remain:
  - Scan-first receiving for item-only barcodes and multi-lot barcode matches.
  - Well-formed nonexistent UUID handling on several warehouse and catalog routes.
  - Saved-view quota behavior at the real backend/API layer.
  - Secret leakage on uncaught startup/maintenance error paths.

## 9. Final Notes
- This retest is static-only. No runtime success claims were inferred from documentation or unexecuted tests.
- The earlier webhook-internal-host and warehouse-write-schema findings no longer reproduce statically in the current workspace; the findings above are the remaining material issues I can substantiate from code and tests.
