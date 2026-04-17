# OmniStock Static Delivery Acceptance and Architecture Audit (Retest v4, 2026-04-04)

## 1. Verdict
- Overall conclusion: **Pass**
- Rationale: In the current workspace, previously reported material defects are remediated and now have static code/test evidence (inventory scan dedupe edge, admin unlock false-success path, webhook hostname permissiveness, warehouse write validation gaps, session rotation path, and bulk rollback traceability). Remaining uncertainty is limited to runtime/device/infrastructure behavior that is outside static proof.

## 2. Scope and Static Verification Boundary
- What was reviewed:
- Documentation/config/test commands and entry points: `README.md:34`, `README.md:65`, `README.md:341`, `.env.example:1`, `apps/api/package.json:7`, `apps/web/package.json:7`
- Backend routes/services/plugins/schema for auth, authorization, search, inventory, warehouses, bulk, moderation/inbox, integrations, scheduler, and auditing: `apps/api/src/server.ts:24`, `apps/api/src/routes/auth.ts:82`, `apps/api/src/routes/admin.ts:617`, `apps/api/src/routes/inventory.ts:55`, `apps/api/src/routes/warehouses.ts:215`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/services/auth.service.ts:191`, `apps/api/src/services/inventory.service.ts:126`, `apps/api/src/services/search.service.ts:127`, `apps/api/src/services/bulk-import.service.ts:201`, `apps/api/src/services/webhook-url.service.ts:85`, `apps/api/src/services/scheduler.service.ts:45`, `apps/api/src/db/migrations/001_init.sql:411`
- Frontend route/workspace surfaces and key feature pages: `apps/web/src/app/app.routes.ts:25`, `apps/web/src/app/features/search/search-page.component.ts:27`, `apps/web/src/app/features/inventory/inventory-page.component.ts:40`, `apps/web/src/app/features/warehouse/warehouse-page.component.ts:56`, `apps/web/src/app/features/catalog/catalog-page.component.ts:24`
- Test sources (unit/integration/browser): `apps/api/test/api-auth.integration.test.ts:194`, `apps/api/test/api-inventory.integration.test.ts:262`, `apps/api/test/api-search.integration.test.ts:216`, `apps/api/test/api-validation.integration.test.ts:152`, `apps/api/test/api-security.integration.test.ts:646`, `apps/api/test/webhook-url.test.ts:28`, `apps/api/test/process-error-logging.test.ts:4`, `apps/web/playwright/ui-smoke.spec.ts:83`
- What was not reviewed:
- Live runtime execution results (API/web startup, DB migrations, Docker orchestration, browser runtime behavior, real webhooks, real hardware devices).
- What was intentionally not executed:
- Project startup, tests, Docker, browser automation, or external services.
- Which claims require manual verification:
- USB scanner keyboard-wedge behavior, camera compatibility on target devices/browsers.
- Actual scheduler trigger timing at deployment-local 02:00.
- Real on-prem DNS/routing and webhook reachability in deployment network.

## 3. Repository / Requirement Mapping Summary
- Prompt core goal: offline district-style warehouse + catalog governance with multi-role operations, scan-first inventory actions, warehouse hierarchy/timeline controls, catalog social content + moderation/inbox, strong local auth/security/audit controls, and signed on-prem integrations.
- Mapped implementation areas:
- API composition and domain surfaces: `apps/api/src/server.ts:60`
- Security/authz/authn services and guards: `apps/api/src/plugins/auth.ts:19`, `apps/api/src/plugins/rbac.ts:4`, `apps/api/src/services/access-control.service.ts:74`, `apps/api/src/services/auth.service.ts:99`
- Inventory/search/bulk/moderation/integrations/scheduler logic: `apps/api/src/services/inventory.service.ts:126`, `apps/api/src/services/search.service.ts:45`, `apps/api/src/services/bulk-import.service.ts:201`, `apps/api/src/services/moderation.service.ts:101`, `apps/api/src/services/integration-security.service.ts:48`, `apps/api/src/services/scheduler.service.ts:45`
- Data model/audit immutability: `apps/api/src/db/migrations/001_init.sql:158`, `apps/api/src/db/migrations/001_init.sql:411`, `apps/api/src/db/migrations/001_init.sql:429`

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 4.1.1 Documentation and static verifiability
- Conclusion: **Pass**
- Rationale: Startup/config/test instructions and project entry points are clearly documented and statically coherent for verification setup.
- Evidence: `README.md:34`, `README.md:65`, `README.md:341`, `.env.example:1`, `apps/api/package.json:7`, `apps/web/package.json:7`
- Manual verification note: Runtime confirmation remains manual due static-only boundary.

#### 4.1.2 Material deviation from Prompt
- Conclusion: **Pass**
- Rationale: The implementation remains tightly aligned to prompt goals and constraints; no material off-scope architecture was identified.
- Evidence: `README.md:3`, `README.md:26`, `apps/api/src/routes/inventory.ts:55`, `apps/api/src/routes/moderation.ts:81`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/services/webhook-url.service.ts:128`

### 4.2 Delivery Completeness

#### 4.2.1 Core explicit requirements coverage
- Conclusion: **Pass**
- Rationale: Core requirements are implemented across static code: local auth hardening (12+ complexity/history/lockout/CAPTCHA), RBAC+ABAC scoping, immutable audit writes, search workspace + saved views, scan-first inventory actions, warehouse/zone/bin setup with timeline, bulk precheck/import/export with per-row outcomes and rollback, catalog content + moderation + inbox updates, signed integrations with scope/rate/replay controls, and nightly metrics/archive jobs.
- Evidence: `apps/api/src/utils/password-policy.ts:16`, `apps/api/src/services/auth.service.ts:111`, `apps/api/src/services/auth.service.ts:191`, `apps/api/src/services/search.service.ts:231`, `apps/api/src/services/inventory.service.ts:126`, `apps/api/src/routes/warehouses.ts:649`, `apps/api/src/services/bulk-import.service.ts:335`, `apps/api/src/routes/catalog.ts:430`, `apps/api/src/routes/moderation.ts:106`, `apps/api/src/services/integration-security.service.ts:48`, `apps/api/src/services/scheduler.service.ts:45`, `apps/api/src/services/scheduler.service.ts:279`, `apps/api/src/db/migrations/001_init.sql:429`
- Manual verification note: Hardware/device-specific behavior remains manual.

#### 4.2.2 0-to-1 end-to-end deliverable shape
- Conclusion: **Pass**
- Rationale: Repository has full-stack product structure with migrations, APIs, web app, security modules, and broad tests; not a partial sample.
- Evidence: `README.md:5`, `apps/api/src/server.ts:60`, `apps/web/src/app/app.routes.ts:25`, `apps/api/src/db/migrations/001_init.sql:26`

### 4.3 Engineering and Architecture Quality

#### 4.3.1 Structure and module decomposition
- Conclusion: **Pass**
- Rationale: Clear separation of concerns between plugins, routes, domain services, and frontend feature modules.
- Evidence: `apps/api/src/server.ts:53`, `apps/api/src/plugins/auth.ts:8`, `apps/api/src/services/access-control.service.ts:33`, `apps/api/src/services/integration-security.service.ts:35`, `apps/web/src/app/app.routes.ts:25`

#### 4.3.2 Maintainability and extensibility
- Conclusion: **Pass**
- Rationale: Core logic is service-based, typed, and extensible; high-risk behaviors are concentrated in dedicated modules with targeted tests.
- Evidence: `apps/api/src/services/auth.service.ts:191`, `apps/api/src/services/search.service.ts:231`, `apps/api/src/services/inventory.service.ts:126`, `apps/api/src/services/bulk-import.service.ts:201`, `apps/api/src/services/moderation.service.ts:101`

### 4.4 Engineering Details and Professionalism

#### 4.4.1 Error handling, logging, validation, API design
- Conclusion: **Pass**
- Rationale: Request validation and centralized error mapping are in place; process/request logs are sanitized; warehouse and admin edge-path correctness defects previously reported are addressed.
- Evidence: `apps/api/src/server.ts:28`, `apps/api/src/server.ts:75`, `apps/api/src/utils/error-logging.ts:1`, `apps/api/src/routes/warehouses.ts:215`, `apps/api/src/routes/admin.ts:634`, `apps/api/test/api-validation.integration.test.ts:152`, `apps/api/test/process-error-logging.test.ts:5`

#### 4.4.2 Product/service maturity vs demo
- Conclusion: **Pass**
- Rationale: Includes production-style controls: encrypted-at-rest sensitive fields, signed integrations with replay/rate controls, durable audit trails, and scheduler-run operational jobs.
- Evidence: `apps/api/src/services/integration-client.service.ts:34`, `apps/api/src/services/integration-security.service.ts:76`, `apps/api/src/plugins/audit.ts:14`, `apps/api/src/services/scheduler.service.ts:82`, `apps/api/src/db/migrations/001_init.sql:429`

### 4.5 Prompt Understanding and Requirement Fit

#### 4.5.1 Business goal and implicit constraints fit
- Conclusion: **Pass**
- Rationale: Multi-role offline warehouse/catalog governance semantics are correctly interpreted and implemented; no prompt-constraint replacement was identified.
- Evidence: `README.md:26`, `apps/web/src/app/app.routes.ts:34`, `apps/api/src/services/access-control.service.ts:74`, `apps/api/src/services/inventory.service.ts:246`, `apps/api/src/routes/moderation.ts:81`, `apps/api/src/routes/integrations.ts:12`

### 4.6 Aesthetics (Frontend)

#### 4.6.1 Visual and interaction quality
- Conclusion: **Pass**
- Rationale: Functional sections are visually differentiated with clear hierarchy, status feedback, and interaction surfaces for search, inventory, warehouse setup, and catalog/moderation tasks.
- Evidence: `apps/web/src/app/features/search/search-page.component.ts:27`, `apps/web/src/app/features/inventory/inventory-page.component.ts:79`, `apps/web/src/app/features/warehouse/warehouse-page.component.ts:56`, `apps/web/src/app/features/catalog/catalog-page.component.ts:24`
- Manual verification note: Final browser rendering and device ergonomics require manual review.

## 5. Issues / Suggestions (Severity-Rated)
- No material Blocker/High/Medium/Low defects were identified in the current static scope.
- Previously reported material findings now have remediation evidence:
- Inventory scan dedupe fix + tests: `apps/api/src/services/inventory.service.ts:128`, `apps/api/test/api-inventory.integration.test.ts:262`, `apps/api/test/api-inventory.integration.test.ts:301`
- Admin unlock not-found behavior + audit safety: `apps/api/src/routes/admin.ts:634`, `apps/api/test/api-auth.integration.test.ts:194`
- Webhook hostname/internal-boundary hardening: `apps/api/src/services/webhook-url.service.ts:124`, `apps/api/test/webhook-url.test.ts:28`, `apps/api/test/api-security.integration.test.ts:669`
- Warehouse write validation determinism: `apps/api/src/routes/warehouses.ts:217`, `apps/api/test/api-validation.integration.test.ts:152`
- Session rotation path and atomic invalidation: `apps/api/src/routes/auth.ts:153`, `apps/api/src/services/auth.service.ts:201`, `apps/api/test/api-auth.integration.test.ts:483`
- Batch rollback traceability durability: `apps/api/src/services/bulk-import.service.ts:222`, `apps/api/src/services/bulk-import.service.ts:347`

## 6. Security Review Summary

- Authentication entry points: **Pass**
- Evidence: `apps/api/src/routes/auth.ts:82`, `apps/api/src/services/auth.service.ts:99`, `apps/api/src/services/auth.service.ts:191`, `apps/api/test/api-auth.integration.test.ts:483`
- Reasoning: Local auth, CAPTCHA/lockout/history controls, session revocation/rotation, and generic login hints are statically enforced.

- Route-level authorization: **Pass**
- Evidence: `apps/api/src/plugins/rbac.ts:4`, `apps/api/src/routes/admin.ts:617`, `apps/api/src/routes/search.ts:34`, `apps/api/src/routes/warehouses.ts:215`, `apps/api/test/api-security.integration.test.ts:70`
- Reasoning: Sensitive routes consistently apply authentication + permission guards.

- Object-level authorization: **Pass**
- Evidence: `apps/api/src/services/access-control.service.ts:138`, `apps/api/src/services/access-control.service.ts:166`, `apps/api/src/services/access-control.service.ts:214`, `apps/api/src/services/moderation.service.ts:147`, `apps/api/test/api-security.integration.test.ts:166`
- Reasoning: Warehouse/bin/item/question/review/report scope checks are explicit.

- Function-level authorization: **Pass**
- Evidence: `apps/api/src/services/access-control.service.ts:309`, `apps/api/src/routes/catalog.ts:524`, `apps/api/src/routes/documents.ts:55`, `apps/api/test/api-security.integration.test.ts:131`
- Reasoning: Privileged functions (catalog answers, document operations, admin operations) are role/permission constrained.

- Tenant / user data isolation: **Pass**
- Evidence: `apps/api/src/services/access-control.service.ts:44`, `apps/api/src/services/search.service.ts:88`, `apps/api/src/services/bulk-import.service.ts:365`, `apps/api/src/services/integration-security.service.ts:101`, `apps/api/test/api-security.integration.test.ts:246`
- Reasoning: Warehouse/department scoping is enforced in key data paths.

- Admin / internal / debug protection: **Pass**
- Evidence: `apps/api/src/routes/admin.ts:227`, `apps/api/src/routes/health.ts:4`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/services/webhook-url.service.ts:128`, `apps/api/test/runtime-security.test.ts:110`
- Reasoning: Admin routes are protected, health is authenticated, integrations use HMAC + anti-replay/rate/scope controls with hardened webhook-target policy.

## 7. Tests and Logging Review

- Unit tests: **Pass**
- Evidence: `apps/api/package.json:13`, `apps/api/package.json:14`, `apps/api/test/process-error-logging.test.ts:4`, `apps/api/test/webhook-url.test.ts:4`, `apps/web/package.json:11`
- Reasoning: Unit/security tests exist for core security and reliability concerns.

- API / integration tests: **Pass**
- Evidence: `apps/api/package.json:15`, `apps/api/test/api-auth.integration.test.ts:194`, `apps/api/test/api-auth.integration.test.ts:483`, `apps/api/test/api-inventory.integration.test.ts:262`, `apps/api/test/api-inventory.integration.test.ts:301`, `apps/api/test/api-search.integration.test.ts:216`, `apps/api/test/api-validation.integration.test.ts:152`, `apps/api/test/api-security.integration.test.ts:646`
- Reasoning: Core high-risk flows and prior defect paths now have dedicated integration coverage.

- Logging categories / observability: **Pass**
- Evidence: `apps/api/src/server.ts:75`, `apps/api/src/plugins/audit.ts:14`, `apps/api/src/services/scheduler.service.ts:106`, `apps/api/src/utils/error-logging.ts:21`
- Reasoning: Request errors, audit events, and scheduler job outcomes are consistently logged.

- Sensitive-data leakage risk in logs / responses: **Pass**
- Evidence: `apps/api/src/utils/error-logging.ts:1`, `apps/api/test/process-error-logging.test.ts:5`, `apps/api/src/services/integration-client.service.ts:87`, `apps/api/test/api-security.integration.test.ts:639`
- Reasoning: Redaction and response-shaping controls prevent straightforward secret leakage in reviewed paths.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests and API/integration tests exist:
- API unit/security suites: `apps/api/package.json:13`, `apps/api/package.json:14`
- API DB-backed integration suite: `apps/api/package.json:15`
- Frontend unit and browser suites: `apps/web/package.json:10`, `apps/web/package.json:12`, `apps/web/package.json:13`
- Test commands are documented:
- `README.md:341`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) (`file:line`) | Key Assertion / Fixture / Mock (`file:line`) | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Lockout, CAPTCHA, unlock correctness, password history, session rotation | `apps/api/test/api-auth.integration.test.ts:101`, `apps/api/test/api-auth.integration.test.ts:194`, `apps/api/test/api-auth.integration.test.ts:483` | Not-found unlock 404/no audit (`apps/api/test/api-auth.integration.test.ts:207`, `apps/api/test/api-auth.integration.test.ts:209`); old token invalid after rotation (`apps/api/test/api-auth.integration.test.ts:529`) | sufficient | No material static gap found | Optional: add edge case around idle-timeout boundary if policy changes. |
| Search pagination/sorting/saved-view quota and dedupe behavior | `apps/api/test/api-search.integration.test.ts:216`, `apps/api/test/api-search.integration.test.ts:320` | Deduplicated totals/rows with multi-barcode items (`apps/api/test/api-search.integration.test.ts:271`, `apps/api/test/api-search.integration.test.ts:283`) | sufficient | No material static gap found | Keep regression tests when SQL changes. |
| Scan-first inventory typed outcomes and dedupe-safe lot/SKU lookup | `apps/api/test/api-inventory.integration.test.ts:92`, `apps/api/test/api-inventory.integration.test.ts:166`, `apps/api/test/api-inventory.integration.test.ts:262`, `apps/api/test/api-inventory.integration.test.ts:301` | New lot/SKU single-position assertions with multi-barcode fixture (`apps/api/test/api-inventory.integration.test.ts:282`, `apps/api/test/api-inventory.integration.test.ts:321`) | sufficient | Hardware/camera runtime behavior remains outside static proof | Manual/browser/device verification for camera hardware ergonomics. |
| Warehouse/zone/bin malformed write validation determinism | `apps/api/test/api-validation.integration.test.ts:152` | All malformed write permutations return 422 and avoid low-level errors (`apps/api/test/api-validation.integration.test.ts:237`, `apps/api/test/api-validation.integration.test.ts:244`) | sufficient | No material static gap found | Optional endpoint-specific negative cases only if schemas evolve. |
| Integration webhook internal-target policy and HMAC security | `apps/api/test/webhook-url.test.ts:28`, `apps/api/test/api-security.integration.test.ts:646` | Single-label unsafe host rejected (`apps/api/test/api-security.integration.test.ts:683`); public/mixed DNS deny (`apps/api/test/webhook-url.test.ts:15`, `apps/api/test/webhook-url.test.ts:39`) | sufficient | Real network topology effects not statically provable | Manual infra validation in deployment network. |
| Bulk transactional rollback and durable failed-row reporting | `apps/api/src/services/bulk-import.service.ts:222`, `apps/api/src/services/bulk-import.service.ts:347`, `apps/api/test/api-bulk.integration.test.ts:24` | Job created before transaction; failed outcomes persisted on rollback (`apps/api/src/services/bulk-import.service.ts:222`, `apps/api/src/services/bulk-import.service.ts:348`) | basically covered | Narrow explicit forced mid-transaction failure assertion could be stronger | Add one targeted integration test forcing row-N failure and asserting persisted `failedRow`. |
| Immutable audit log | `apps/api/src/db/migrations/001_init.sql:429`, `apps/api/src/plugins/audit.ts:14` | Update/delete triggers block mutation (`apps/api/src/db/migrations/001_init.sql:437`, `apps/api/src/db/migrations/001_init.sql:442`) | sufficient | No material static gap found | Optional migration test asserting trigger enforcement. |
| Sensitive process/request log redaction | `apps/api/test/process-error-logging.test.ts:4` | DSN/token/secret redaction assertions (`apps/api/test/process-error-logging.test.ts:12`, `apps/api/test/process-error-logging.test.ts:33`) | sufficient | No material static gap found | Maintain tests if sanitizer patterns change. |

### 8.3 Security Coverage Audit
- authentication: **sufficient**
- Evidence: `apps/api/test/api-auth.integration.test.ts:101`, `apps/api/test/api-auth.integration.test.ts:483`
- route authorization: **sufficient**
- Evidence: `apps/api/test/api-security.integration.test.ts:70`, `apps/api/test/runtime-security.test.ts:110`
- object-level authorization: **basically covered**
- Evidence: `apps/api/test/api-security.integration.test.ts:166`, `apps/api/test/api-moderation.integration.test.ts:92`
- tenant / data isolation: **sufficient**
- Evidence: `apps/api/test/api-security.integration.test.ts:246`, `apps/api/test/api-security.integration.test.ts:362`
- admin / internal protection: **sufficient**
- Evidence: `apps/api/test/api-security.integration.test.ts:646`, `apps/api/test/runtime-security.test.ts:110`
- Assessment: Existing static coverage would likely catch severe authz/isolation regressions in reviewed areas.

### 8.4 Final Coverage Judgment
- **Pass**
- Covered major risks:
- Auth/session hardening, route/object authorization, scan/search correctness, validation determinism, integration boundary controls, and log redaction.
- Coverage boundary:
- Device/browser hardware behavior and deployment-network runtime conditions still require manual verification and are outside static proof.

## 9. Final Notes
- This audit remained strictly static-only and did not execute startup, Docker, tests, or browser flows.
- Conclusions are based on code/test/docs evidence only and avoid runtime-success claims.
