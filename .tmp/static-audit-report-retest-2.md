# OmniStock Static Delivery Acceptance and Architecture Audit (Retest 2026-04-04)

## 1. Verdict
- Overall conclusion: **Pass**
- Rationale: The repository remains a real full-stack OmniStock delivery with strong prompt alignment, clear module separation, broad security controls, and broad static test assets. The previously remaining admin unlock traceability defect is fixed in both route logic and integration coverage: the unlock path now returns `404` for nonexistent or soft-deleted users and no longer writes a false audit entry on that path. Evidence: `apps/api/src/routes/admin.ts:617`, `apps/api/src/routes/admin.ts:634`, `apps/api/src/routes/admin.ts:638`, `apps/api/src/plugins/audit.ts:14`, `apps/api/test/api-auth.integration.test.ts:177`, `apps/api/test/api-auth.integration.test.ts:195`

## 2. Scope and Static Verification Boundary
- What was reviewed:
  - Repository documentation and entry/test scripts: `README.md:5`, `README.md:34`, `README.md:65`, `README.md:116`, `apps/api/package.json:6`, `apps/web/package.json:6`
  - Backend entry points, route registration, core services, and security-sensitive handlers: `apps/api/src/server.ts:24`, `apps/api/src/routes/auth.ts:55`, `apps/api/src/routes/integrations.ts:7`, `apps/api/src/routes/admin.ts:571`, `apps/api/src/services/access-control.service.ts:44`, `apps/api/src/services/inventory.service.ts:78`, `apps/api/src/services/search.service.ts:191`, `apps/api/src/routes/bulk.ts:37`, `apps/api/src/routes/catalog.ts:218`, `apps/api/src/routes/warehouses.ts:612`, `apps/api/src/services/scheduler.service.ts:45`
  - Frontend route/workspace structure and mocked browser coverage: `apps/web/src/app/app.routes.ts:25`, `apps/web/playwright/ui-smoke.spec.ts:83`, `apps/web/playwright/ui-smoke.spec.ts:210`, `apps/web/playwright/ui-smoke.spec.ts:395`, `apps/web/playwright/ui-smoke.spec.ts:450`
  - API/unit/integration/browser test sources for security, validation, and core flows: `apps/api/test/api-auth.integration.test.ts:60`, `apps/api/test/api-inventory.integration.test.ts:7`, `apps/api/test/api-search.integration.test.ts:6`, `apps/api/test/api-security.integration.test.ts:67`, `apps/api/test/api-validation.integration.test.ts:6`, `apps/api/test/api-moderation.integration.test.ts:45`, `apps/api/test/process-error-logging.test.ts:4`, `apps/api/test/runtime-security.test.ts:50`, `apps/api/test/webhook-url.test.ts:4`
- What was not reviewed:
  - Live runtime behavior under actual startup, browser execution, PostgreSQL state transitions, Docker orchestration, or real external/internal network calls.
- What was intentionally not executed:
  - Project startup, Docker, migrations, test suites, browser automation, or webhook delivery attempts.
- Which claims require manual verification:
  - Real USB keyboard-wedge scanner behavior and device-camera compatibility.
  - Real scheduler execution at deployment-local 2:00 AM.
  - Real offline-network DNS/reachability behavior for internal webhook targets.
  - Real browser rendering and interaction timing in the target environment.

## 3. Repository / Requirement Mapping Summary
- Prompt core business goal: an offline warehouse and catalog governance system for multiple roles, with scan-first inventory control, warehouse/zone/bin management, bulk CSV/XLSX flows, catalog reviews/Q&A/images, moderation and reporter-safe inbox updates, local-only authentication, RBAC plus scoped access rules, immutable audit logging, and on-prem signed integrations.
- Main implementation areas mapped to that goal:
  - Fastify server and route/plugin composition: `apps/api/src/server.ts:53`
  - Local auth/session/rate-limit/security entry points: `apps/api/src/routes/auth.ts:82`, `apps/api/src/routes/integrations.ts:12`
  - Search, inventory, warehouse, bulk, catalog, moderation, admin, and scheduler flows: `apps/api/src/services/search.service.ts:191`, `apps/api/src/services/inventory.service.ts:219`, `apps/api/src/routes/warehouses.ts:612`, `apps/api/src/routes/bulk.ts:49`, `apps/api/src/routes/catalog.ts:218`, `apps/api/test/api-moderation.integration.test.ts:92`, `apps/api/src/routes/admin.ts:617`, `apps/api/src/services/scheduler.service.ts:45`
  - Angular role workspaces and feature routes: `apps/web/src/app/app.routes.ts:33`

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 4.1.1 Documentation and static verifiability
- Conclusion: **Pass**
- Rationale: The repository provides coherent startup, local-dev, browser-verification, and test instructions, and those instructions are statically consistent with the current package entry points. A human reviewer can attempt verification without rewriting the project first.
- Evidence: `README.md:34`, `README.md:65`, `README.md:116`, `apps/api/package.json:6`, `apps/web/package.json:6`
- Manual verification note: Runtime success still requires manual execution because this audit remained static-only.

#### 4.1.2 Material deviation from Prompt
- Conclusion: **Pass**
- Rationale: The implementation stays centered on the OmniStock prompt. The multi-role workspaces, scan-first inventory model, scoped search, moderation, bulk processing, and on-prem integration posture all remain aligned with the business scenario. The previously reported scan-flow defect no longer reproduces statically.
- Evidence: `README.md:26`, `apps/web/src/app/app.routes.ts:34`, `apps/web/src/app/app.routes.ts:40`, `apps/api/src/services/inventory.service.ts:78`, `apps/api/src/services/inventory.service.ts:126`, `apps/api/src/services/inventory.service.ts:165`, `apps/api/src/services/inventory.service.ts:219`, `apps/api/test/api-inventory.integration.test.ts:34`, `apps/api/test/api-inventory.integration.test.ts:84`
- Manual verification note: Real scanner and camera hardware behavior remains manual.

### 4.2 Delivery Completeness

#### 4.2.1 Core explicit requirements coverage
- Conclusion: **Pass**
- Rationale: The core explicit requirements are implemented across code and schema-facing handlers: local username/password auth with CAPTCHA and lockout; scoped saved-view search; scan-first inventory with item-only and multi-position handling; warehouse tree/bin toggle/timeline; bulk CSV/XLSX template, precheck, import, export, and result access; catalog image uploads with checksum verification and export controls; moderation queue and reporter-safe inbox flows; signed integrations with internal webhook handling; and nightly metrics/archive jobs.
- Evidence: `apps/api/src/routes/auth.ts:82`, `apps/api/src/services/search.service.ts:191`, `apps/api/src/services/inventory.service.ts:219`, `apps/api/src/routes/warehouses.ts:612`, `apps/api/src/routes/warehouses.ts:649`, `apps/api/src/routes/bulk.ts:49`, `apps/api/src/routes/catalog.ts:218`, `apps/api/src/routes/catalog.ts:264`, `apps/api/test/api-moderation.integration.test.ts:92`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/services/scheduler.service.ts:45`, `README.md:286`
- Manual verification note: Hardware scanning, actual file-picker UX, and real scheduler timing still require manual verification.

#### 4.2.2 0-to-1 end-to-end deliverable shape
- Conclusion: **Pass**
- Rationale: This is a complete application delivery rather than a fragment or demo. It includes frontend, backend, data-layer assumptions, bootstrap/test scripts, admin/security surfaces, and meaningful test assets.
- Evidence: `README.md:5`, `apps/api/src/server.ts:60`, `apps/web/src/app/app.routes.ts:25`, `apps/api/package.json:6`, `apps/web/package.json:6`

### 4.3 Engineering and Architecture Quality

#### 4.3.1 Structure and module decomposition
- Conclusion: **Pass**
- Rationale: Responsibilities are clearly separated across Fastify plugins, route modules, access-control services, domain services, and Angular feature pages. The codebase is not excessively piled into one file and follows understandable domain boundaries for this product scope.
- Evidence: `apps/api/src/server.ts:53`, `apps/api/src/routes/auth.ts:55`, `apps/api/src/routes/integrations.ts:7`, `apps/api/src/services/access-control.service.ts:44`, `apps/api/src/services/inventory.service.ts:101`, `apps/api/src/services/search.service.ts:182`, `apps/api/src/routes/bulk.ts:37`, `apps/web/src/app/app.routes.ts:25`

#### 4.3.2 Maintainability and extensibility
- Conclusion: **Pass**
- Rationale: The implementation leaves room for extension rather than hard-coding the entire system into single-path flows. Shared access-control helpers, domain services, testable validators, and modular route registration support maintainability.
- Evidence: `apps/api/src/services/access-control.service.ts:74`, `apps/api/src/services/inventory.service.ts:114`, `apps/api/src/services/search.service.ts:191`, `apps/api/src/services/scheduler.service.ts:82`, `apps/api/test/webhook-url.test.ts:4`

### 4.4 Engineering Details and Professionalism

#### 4.4.1 Error handling, logging, validation, and API design
- Conclusion: **Pass**
- Rationale: Request validation is normalized to deterministic `422` responses, request/process errors are sanitized before logging, and the previously remaining admin unlock correctness defect is fixed. The unlock handler now checks row existence, returns `404` on missing/soft-deleted users, and only writes audit context on successful updates.
- Evidence: `apps/api/src/server.ts:28`, `apps/api/src/server.ts:75`, `apps/api/src/routes/admin.ts:509`, `apps/api/src/routes/admin.ts:522`, `apps/api/src/routes/admin.ts:617`, `apps/api/src/routes/admin.ts:634`, `apps/api/src/plugins/audit.ts:14`, `apps/api/test/api-auth.integration.test.ts:177`, `apps/api/test/api-auth.integration.test.ts:195`, `apps/api/test/api-validation.integration.test.ts:9`, `apps/api/test/process-error-logging.test.ts:4`

#### 4.4.2 Product/service maturity vs demo
- Conclusion: **Pass**
- Rationale: The repository reads like a product, not a teaching sample: it includes secure session handling, immutable audit logging, checksum-verified file handling, encrypted stored secrets/contacts, scoped bulk jobs/results, persisted webhook delivery outcomes, and scheduled maintenance jobs.
- Evidence: `apps/api/src/routes/auth.ts:128`, `apps/api/src/plugins/audit.ts:4`, `apps/api/src/routes/catalog.ts:244`, `apps/api/src/routes/catalog.ts:316`, `apps/api/src/services/scheduler.service.ts:45`, `apps/api/src/services/scheduler.service.ts:82`, `README.md:24`, `README.md:413`

### 4.5 Prompt Understanding and Requirement Fit

#### 4.5.1 Business goal and implicit constraints fit
- Conclusion: **Pass**
- Rationale: The repository understands the offline, multi-role, security-heavy warehouse/catalog scenario well. Search scoping, department/warehouse ABAC, moderation queue filtering, in-app inbox updates, and internal signed integrations all match the prompt’s business semantics.
- Evidence: `README.md:3`, `README.md:221`, `apps/api/src/services/access-control.service.ts:44`, `apps/api/src/services/access-control.service.ts:74`, `apps/api/test/api-security.integration.test.ts:166`, `apps/api/test/api-moderation.integration.test.ts:92`, `apps/web/src/app/app.routes.ts:40`

### 4.6 Aesthetics (Frontend)

#### 4.6.1 Visual and interaction quality
- Conclusion: **Pass**
- Rationale: The frontend is organized into distinct functional surfaces with role-aware navigation, visible hierarchy, inline state messaging, and explicit operator feedback for search, inventory, moderation, bulk, and inbox flows. Static browser assets cover the main interaction states that matter to the prompt.
- Evidence: `apps/web/src/app/app.routes.ts:39`, `apps/web/src/app/app.routes.ts:61`, `apps/web/src/app/app.routes.ts:67`, `apps/web/playwright/ui-smoke.spec.ts:83`, `apps/web/playwright/ui-smoke.spec.ts:123`, `apps/web/playwright/ui-smoke.spec.ts:210`, `apps/web/playwright/ui-smoke.spec.ts:227`, `apps/web/playwright/ui-smoke.spec.ts:395`, `apps/web/playwright/ui-smoke.spec.ts:450`
- Manual verification note: Final browser/device rendering quality still requires manual browser review.

## 5. Issues / Suggestions (Severity-Rated)
- No open material Blocker, High, Medium, or Low issues were identified in this retest.
- Previously reported defect no longer reproduces statically: the admin unlock endpoint now returns `404` and suppresses false audit writes for nonexistent or soft-deleted users. Evidence: `apps/api/src/routes/admin.ts:623`, `apps/api/src/routes/admin.ts:634`, `apps/api/src/plugins/audit.ts:14`, `apps/api/test/api-auth.integration.test.ts:177`, `apps/api/test/api-auth.integration.test.ts:195`

## 6. Security Review Summary

- Authentication entry points: **Pass**
  - Evidence: `apps/api/src/routes/auth.ts:82`, `apps/api/src/routes/auth.ts:102`, `apps/api/src/routes/auth.ts:166`, `apps/api/test/api-auth.integration.test.ts:63`, `apps/api/test/runtime-security.test.ts:51`
  - Reasoning: Local username/password auth, CAPTCHA escalation, lockout, session cookies, session revocation, and password change flows are implemented and statically covered.

- Route-level authorization: **Pass**
  - Evidence: `apps/api/src/routes/admin.ts:572`, `apps/api/src/routes/warehouses.ts:613`, `apps/api/src/routes/bulk.ts:49`, `apps/api/test/api-security.integration.test.ts:70`, `apps/api/test/runtime-security.test.ts:110`
  - Reasoning: Sensitive routes consistently apply authentication and permission gating, and the reviewed tests cover representative `401`/`403` cases.

- Object-level authorization: **Pass**
  - Evidence: `apps/api/src/services/access-control.service.ts:138`, `apps/api/src/services/access-control.service.ts:166`, `apps/api/src/services/access-control.service.ts:214`, `apps/api/src/services/access-control.service.ts:230`, `apps/api/src/services/access-control.service.ts:282`, `apps/api/test/api-security.integration.test.ts:166`, `apps/api/test/api-moderation.integration.test.ts:92`
  - Reasoning: Warehouse, bin, item, review, question, and review-image access resolve object scope explicitly and enforce warehouse/department boundaries.

- Function-level authorization: **Pass**
  - Evidence: `apps/api/src/services/access-control.service.ts:309`, `apps/api/test/api-security.integration.test.ts:131`
  - Reasoning: High-risk functions such as answering Q&A threads have explicit role/function checks beyond simple authentication.

- Tenant / user data isolation: **Pass**
  - Evidence: `apps/api/src/services/access-control.service.ts:44`, `apps/api/src/services/access-control.service.ts:74`, `apps/api/test/api-security.integration.test.ts:246`, `apps/api/test/api-security.integration.test.ts:362`, `apps/api/test/api-security.integration.test.ts:572`
  - Reasoning: Search/catalog scope, bulk-job visibility, integration department limits, and sensitive-field exposure are bounded by user role and assigned scope.

- Admin / internal / debug protection: **Pass**
  - Evidence: `apps/api/src/routes/admin.ts:617`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/routes/health.ts:3`, `apps/api/test/runtime-security.test.ts:110`, `apps/api/test/api-auth.integration.test.ts:177`, `apps/api/test/api-security.integration.test.ts:646`
  - Reasoning: Admin routes are permission-gated, health is authenticated, and the internal integration surface is protected by HMAC, freshness, replay, and scope checks. The prior admin unlock correctness gap is now closed.

## 7. Tests and Logging Review

- Unit tests: **Pass**
  - Evidence: `apps/api/package.json:13`, `apps/web/package.json:11`, `apps/api/test/process-error-logging.test.ts:4`, `apps/api/test/runtime-security.test.ts:50`, `apps/api/test/webhook-url.test.ts:4`
  - Reasoning: The repository includes meaningful API-side unit/security tests and frontend unit assets, not placeholder files.

- API / integration tests: **Pass**
  - Evidence: `apps/api/package.json:15`, `apps/api/test/api-auth.integration.test.ts:60`, `apps/api/test/api-inventory.integration.test.ts:7`, `apps/api/test/api-search.integration.test.ts:6`, `apps/api/test/api-security.integration.test.ts:67`, `apps/api/test/api-validation.integration.test.ts:6`, `apps/api/test/api-moderation.integration.test.ts:45`
  - Reasoning: Coverage is broad across auth, validation, inventory, search, warehouse scoping, moderation, bulk, and integration security. The previously missing unlock regression coverage now exists.

- Logging categories / observability: **Pass**
  - Evidence: `apps/api/src/server.ts:75`, `apps/api/src/plugins/audit.ts:4`, `apps/api/src/services/scheduler.service.ts:106`, `apps/api/test/process-error-logging.test.ts:18`
  - Reasoning: Request errors, audit events, scheduler outcomes, and process-level failures go through identifiable logging/audit paths.

- Sensitive-data leakage risk in logs / responses: **Pass**
  - Evidence: `apps/api/src/server.ts:76`, `apps/api/test/process-error-logging.test.ts:5`, `apps/api/test/api-security.integration.test.ts:572`, `apps/api/test/api-security.integration.test.ts:712`
  - Reasoning: The reviewed code and tests show redaction of DSNs/tokens/secrets and non-exposure of encrypted integration/user-sensitive fields in common response paths.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist:
  - API-side Vitest suites: `apps/api/package.json:13`
  - Frontend unit tests via Node test runner: `apps/web/package.json:11`
- API / integration tests exist:
  - DB-backed Vitest integration command: `apps/api/package.json:15`
  - Entry points include auth, validation, security, inventory, search, and moderation suites: `apps/api/test/api-auth.integration.test.ts:60`, `apps/api/test/api-validation.integration.test.ts:6`, `apps/api/test/api-security.integration.test.ts:67`, `apps/api/test/api-inventory.integration.test.ts:7`, `apps/api/test/api-search.integration.test.ts:6`, `apps/api/test/api-moderation.integration.test.ts:45`
- Browser tests exist:
  - Mocked Playwright suite: `apps/web/package.json:12`, `apps/web/playwright/ui-smoke.spec.ts:83`
  - Local real smoke suite is documented/scripted: `apps/web/package.json:13`, `README.md:140`
- Documentation provides test commands:
  - `README.md:75`, `README.md:124`, `README.md:144`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) (`file:line`) | Key Assertion / Fixture / Mock (`file:line`) | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Local auth, CAPTCHA escalation, lockout, secure cookies, and admin unlock correctness | `apps/api/test/api-auth.integration.test.ts:63`, `apps/api/test/api-auth.integration.test.ts:177`, `apps/api/test/api-auth.integration.test.ts:195`, `apps/api/test/runtime-security.test.ts:51` | Lockout then successful unlock with audit count (`apps/api/test/api-auth.integration.test.ts:141`); nonexistent and soft-deleted unlock return `404` and zero audit writes (`apps/api/test/api-auth.integration.test.ts:182`, `apps/api/test/api-auth.integration.test.ts:207`); secure cookie assertions (`apps/api/test/runtime-security.test.ts:62`) | sufficient | Runtime session expiry/idle behavior is not proven in this static pass | Add idle-timeout coverage only if release criteria require it. |
| Search filtering, sorting, pagination, and saved-view quota/update behavior | `apps/api/test/api-search.integration.test.ts:9`, `apps/api/test/api-search.integration.test.ts:54`, `apps/api/test/api-search.integration.test.ts:95`, `apps/web/playwright/ui-smoke.spec.ts:83`, `apps/web/playwright/ui-smoke.spec.ts:123` | Create-to-cap, typed `409`, and update-at-cap assertions (`apps/api/test/api-search.integration.test.ts:38`, `apps/api/test/api-search.integration.test.ts:83`, `apps/api/test/api-search.integration.test.ts:131`); mocked UI quota message (`apps/web/playwright/ui-smoke.spec.ts:128`) | sufficient | No material static gap found in reviewed search paths | Add one list/read persistence assertion if `/api/search/views` read behavior changes materially. |
| Scan-first inventory lookup, item-only first receipt, multi-lot disambiguation, and operator feedback | `apps/api/test/api-inventory.integration.test.ts:10`, `apps/api/test/api-inventory.integration.test.ts:34`, `apps/api/test/api-inventory.integration.test.ts:84`, `apps/web/playwright/ui-smoke.spec.ts:210`, `apps/web/playwright/ui-smoke.spec.ts:227` | API asserts `no_match`, `item_only`, and `multiple_positions` (`apps/api/test/api-inventory.integration.test.ts:26`, `apps/api/test/api-inventory.integration.test.ts:68`, `apps/api/test/api-inventory.integration.test.ts:162`); UI first-receipt and disambiguation states (`apps/web/playwright/ui-smoke.spec.ts:217`, `apps/web/playwright/ui-smoke.spec.ts:234`) | sufficient | Hardware scanner/camera behavior remains outside static proof | Add target-environment manual verification for the USB/camera path. |
| Warehouse hierarchy access, bin timeline visibility, and deterministic 404/403 behavior | `apps/api/test/api-security.integration.test.ts:70`, `apps/api/test/api-validation.integration.test.ts:47` | Out-of-scope tree/timeline return `403` (`apps/api/test/api-security.integration.test.ts:110`, `apps/api/test/api-security.integration.test.ts:118`); nonexistent warehouse tree/zone return `404` (`apps/api/test/api-validation.integration.test.ts:52`) | basically covered | Bin-toggle write-history behavior is not exhaustively asserted | Add one integration test asserting a toggle creates the expected timeline row. |
| Catalog images, favorites/history, moderation queue filtering, and reporter-safe updates | `apps/api/test/api-moderation.integration.test.ts:48`, `apps/api/test/api-moderation.integration.test.ts:92`, `apps/web/playwright/ui-smoke.spec.ts:395`, `apps/web/playwright/ui-smoke.spec.ts:450` | Invalid/nonexistent moderation targets return deterministic `4xx` (`apps/api/test/api-moderation.integration.test.ts:52`, `apps/api/test/api-moderation.integration.test.ts:76`); queue scoped by department (`apps/api/test/api-moderation.integration.test.ts:146`); UI moderation and inbox states (`apps/web/playwright/ui-smoke.spec.ts:398`, `apps/web/playwright/ui-smoke.spec.ts:453`) | basically covered | Actual browser file-picker/image-upload behavior was not executed | Add one manual browser verification for local-file image upload in the target environment. |
| Bulk CSV/XLSX template, precheck, import/export, and scoped job/result visibility | `apps/api/test/api-security.integration.test.ts:246`, `apps/api/test/api-security.integration.test.ts:343`, `apps/web/playwright/ui-smoke.spec.ts:285`, `apps/web/playwright/ui-smoke.spec.ts:300` | Peer can see scoped job, outsider gets `404` for results (`apps/api/test/api-security.integration.test.ts:300`, `apps/api/test/api-security.integration.test.ts:325`); malformed import returns `422` (`apps/api/test/api-security.integration.test.ts:347`); mocked UI precheck/import/export behavior (`apps/web/playwright/ui-smoke.spec.ts:285`) | sufficient | No material static gap found in reviewed bulk controls | Add an explicit rollback assertion only if import transaction boundaries change. |
| Integration HMAC, freshness, replay, rate limits, encrypted secrets, and internal webhook restrictions | `apps/api/test/api-security.integration.test.ts:362`, `apps/api/test/api-security.integration.test.ts:494`, `apps/api/test/api-security.integration.test.ts:572`, `apps/api/test/api-security.integration.test.ts:646`, `apps/api/test/webhook-url.test.ts:4` | `200`/`409`/`429`/`401`/`403` assertions on live route (`apps/api/test/api-security.integration.test.ts:382`, `apps/api/test/api-security.integration.test.ts:395`, `apps/api/test/api-security.integration.test.ts:433`, `apps/api/test/api-security.integration.test.ts:448`, `apps/api/test/api-security.integration.test.ts:476`); resolver-policy checks for webhook URLs (`apps/api/test/webhook-url.test.ts:15`, `apps/api/test/webhook-url.test.ts:39`) | sufficient | Offline-network DNS/reachability remains manual | Add deployment-environment manual verification for approved internal hostnames if hostname policy changes. |
| Request/process error sanitization and sensitive-data handling | `apps/api/test/process-error-logging.test.ts:4`, `apps/api/test/api-security.integration.test.ts:572`, `apps/api/test/api-security.integration.test.ts:712` | Process log redaction assertions (`apps/api/test/process-error-logging.test.ts:5`, `apps/api/test/process-error-logging.test.ts:18`); encrypted-at-rest and non-leaking response checks (`apps/api/test/api-security.integration.test.ts:595`, `apps/api/test/api-security.integration.test.ts:740`) | sufficient | No material static gap found in reviewed logging/privacy paths | Add a regression only if the global error handler or admin list serializer changes materially. |

### 8.3 Security Coverage Audit
- Authentication: **sufficient**
  - Coverage: `apps/api/test/api-auth.integration.test.ts:63`, `apps/api/test/runtime-security.test.ts:51`
  - Assessment: Severe auth regressions around lockout, CAPTCHA, cookies, and unlock correctness would likely be caught.

- Route authorization: **sufficient**
  - Coverage: `apps/api/test/api-security.integration.test.ts:70`, `apps/api/test/api-security.integration.test.ts:131`, `apps/api/test/runtime-security.test.ts:110`
  - Assessment: Core `401`/`403` behavior is meaningfully exercised across health, warehouse, and catalog-answer paths.

- Object-level authorization: **basically covered**
  - Coverage: `apps/api/test/api-security.integration.test.ts:166`, `apps/api/test/api-moderation.integration.test.ts:92`
  - Assessment: Warehouse and department scoping are meaningfully tested, though not every object-specific route has a dedicated regression test.

- Tenant / data isolation: **sufficient**
  - Coverage: `apps/api/test/api-security.integration.test.ts:246`, `apps/api/test/api-security.integration.test.ts:362`, `apps/api/test/api-security.integration.test.ts:572`
  - Assessment: Bulk-job visibility, integration department isolation, and sensitive-field exposure are covered well enough that major leakage defects would likely be detected.

- Admin / internal protection: **sufficient**
  - Coverage: `apps/api/test/runtime-security.test.ts:110`, `apps/api/test/api-auth.integration.test.ts:177`, `apps/api/test/api-security.integration.test.ts:646`
  - Assessment: Admin entry points and internal integration protections now include the previously missing unlock regression, so the main reviewed admin/internal risks are meaningfully covered.

### 8.4 Final Coverage Judgment
- **Pass**
- Covered major risks:
  - Local auth hardening, unlock correctness, search and saved views, scan-first inventory behavior, warehouse access control, moderation scoping, bulk job visibility, integration HMAC/replay/rate controls, webhook target validation, and error/sensitive-data redaction.
- Boundary:
  - This remains a static audit of the test assets. The tests were not executed here, and hardware/network-dependent behavior such as real scanners, cameras, scheduler timing, and deployment-local DNS still require manual verification.

## 9. Final Notes
- This retest remained strictly static-only. No runtime success claims were inferred from startup, Docker, or unexecuted tests.
- The earlier scan-flow, saved-view quota, warehouse `404`, process-error logging, and admin unlock findings do not reproduce statically in the current workspace.
- The current report intentionally records no open material issues because the prior evidence-backed defect set appears closed in this workspace.
