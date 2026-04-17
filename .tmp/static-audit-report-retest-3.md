# OmniStock Static Delivery Acceptance and Architecture Audit (Retest v3, 2026-04-04)

## 1. Verdict
- Overall conclusion: **Partial Pass**
- Rationale: The previously reported High/Medium findings around webhook target permissiveness, warehouse write-schema gaps, session rotation, admin unlock false-success, search saved-view race behavior, and post-rollback batch traceability are now fixed in this workspace. One material Medium issue remains in the inventory scan query: lot/SKU scans can be row-multiplied by multi-barcode joins, which can force false `multiple_positions` responses for a single logical position.

## 2. Scope and Static Verification Boundary
- What was reviewed:
- Documentation, env/config, scripts, package entry points: `README.md:34`, `README.md:65`, `README.md:341`, `.env.example:1`, `apps/api/package.json:7`, `apps/web/package.json:7`
- Backend architecture and core modules: `apps/api/src/server.ts:24`, `apps/api/src/routes/auth.ts:82`, `apps/api/src/routes/inventory.ts:55`, `apps/api/src/routes/admin.ts:617`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/services/inventory.service.ts:126`, `apps/api/src/services/auth.service.ts:191`, `apps/api/src/services/bulk-import.service.ts:201`, `apps/api/src/services/webhook-url.service.ts:85`, `apps/api/src/db/migrations/001_init.sql:158`
- Frontend role workspaces and feature pages: `apps/web/src/app/app.routes.ts:25`, `apps/web/src/app/features/search/search-page.component.ts:27`, `apps/web/src/app/features/inventory/inventory-page.component.ts:40`, `apps/web/src/app/features/warehouse/warehouse-page.component.ts:56`, `apps/web/src/app/features/catalog/catalog-page.component.ts:24`
- Unit/integration/browser test sources: `apps/api/test/api-auth.integration.test.ts:483`, `apps/api/test/api-search.integration.test.ts:216`, `apps/api/test/api-inventory.integration.test.ts:84`, `apps/api/test/api-validation.integration.test.ts:152`, `apps/api/test/api-security.integration.test.ts:646`, `apps/api/test/webhook-url.test.ts:28`, `apps/api/test/process-error-logging.test.ts:4`, `apps/web/playwright/ui-smoke.spec.ts:83`
- What was not reviewed:
- Runtime behavior under live startup, Docker networking, browser/device execution, external/on-prem integration infrastructure, or real scheduled clock execution.
- What was intentionally not executed:
- Project startup, Docker, migrations, test runs, browser automation, webhook delivery attempts.
- Which claims require manual verification:
- Real USB scanner/camera hardware ergonomics and browser compatibility.
- Real deployment-local 02:00 scheduler trigger behavior.
- Real internal DNS and routing behavior for webhook hosts in target infrastructure.

## 3. Repository / Requirement Mapping Summary
- Prompt core goal mapped: offline warehouse + catalog governance with multi-role workflows, scan-first inventory actions, warehouse hierarchy/timeline, bulk import/export with precheck and row outcomes, moderation/inbox flow, strict local auth + ABAC/RBAC + immutable auditing, and signed on-prem integrations.
- Main mapped implementation areas:
- Fastify API composition and route set: `apps/api/src/server.ts:60`
- Domain services (auth, access control, inventory, search, moderation, bulk, scheduler, integrations): `apps/api/src/services/auth.service.ts:99`, `apps/api/src/services/access-control.service.ts:74`, `apps/api/src/services/inventory.service.ts:219`, `apps/api/src/services/search.service.ts:45`, `apps/api/src/services/moderation.service.ts:18`, `apps/api/src/services/bulk-import.service.ts:201`, `apps/api/src/services/scheduler.service.ts:45`, `apps/api/src/services/integration-security.service.ts:38`
- PostgreSQL schema and immutable audit enforcement: `apps/api/src/db/migrations/001_init.sql:411`, `apps/api/src/db/migrations/001_init.sql:429`
- Angular role workspace and feature routes: `apps/web/src/app/app.routes.ts:34`

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 4.1.1 Documentation and static verifiability
- Conclusion: **Pass**
- Rationale: The repository has coherent startup/config/test instructions and matching package entry points, so static verification is feasible without rewriting core code.
- Evidence: `README.md:34`, `README.md:65`, `README.md:341`, `.env.example:1`, `apps/api/package.json:7`, `apps/web/package.json:7`
- Manual verification note: Runtime correctness remains manual because this audit stayed static-only.

#### 4.1.2 Material deviation from Prompt
- Conclusion: **Pass**
- Rationale: The implementation remains centered on the prompt and previously reported deviations are corrected (session rotation, strict webhook policy, warehouse validation hardening, scan disambiguation flow). Remaining issue is an edge-case query defect inside the implemented scan flow, not a direction-level prompt deviation.
- Evidence: `README.md:261`, `README.md:265`, `apps/api/src/routes/auth.ts:153`, `apps/api/src/services/webhook-url.service.ts:128`, `apps/api/src/routes/warehouses.ts:215`, `apps/api/src/services/inventory.service.ts:219`

### 4.2 Delivery Completeness

#### 4.2.1 Core explicit requirements coverage
- Conclusion: **Partial Pass**
- Rationale: Core prompt requirements are broadly implemented end-to-end. Remaining gap is scan lookup correctness for lot/SKU when items have multiple barcodes, which can produce false ambiguity instead of direct lot resolution.
- Evidence: `apps/api/src/routes/inventory.ts:55`, `apps/api/src/services/inventory.service.ts:153`, `apps/api/src/services/inventory.service.ts:155`, `apps/api/src/services/inventory.service.ts:230`, `apps/api/src/db/migrations/001_init.sql:158`
- Manual verification note: Hardware scan performance/UX remains manual.

#### 4.2.2 0-to-1 end-to-end deliverable shape
- Conclusion: **Pass**
- Rationale: Complete backend/frontend/migration/test structure is present and product-shaped, not a fragment or tutorial stub.
- Evidence: `README.md:5`, `apps/api/src/server.ts:60`, `apps/api/src/db/migrations/001_init.sql:26`, `apps/web/src/app/app.routes.ts:25`

### 4.3 Engineering and Architecture Quality

#### 4.3.1 Structure and module decomposition
- Conclusion: **Pass**
- Rationale: Responsibilities are separated across plugins/routes/services and frontend features with clear domain boundaries.
- Evidence: `apps/api/src/server.ts:53`, `apps/api/src/plugins/auth.ts:8`, `apps/api/src/plugins/rbac.ts:3`, `apps/api/src/services/access-control.service.ts:33`, `apps/web/src/app/app.routes.ts:25`

#### 4.3.2 Maintainability and extensibility
- Conclusion: **Pass**
- Rationale: Core behavior is mostly service-driven and typed. Remaining defect is localized query logic, not structural coupling collapse.
- Evidence: `apps/api/src/services/search.service.ts:45`, `apps/api/src/services/document.service.ts:57`, `apps/api/src/services/moderation.service.ts:11`, `apps/api/src/services/bulk-import.service.ts:201`

### 4.4 Engineering Details and Professionalism

#### 4.4.1 Error handling, logging, validation, API design
- Conclusion: **Partial Pass**
- Rationale: Validation and error sanitization are strong overall, and prior validation/logging findings are fixed. One API correctness defect remains in scan query semantics for multi-barcode items.
- Evidence: `apps/api/src/server.ts:28`, `apps/api/src/server.ts:75`, `apps/api/src/utils/error-logging.ts:1`, `apps/api/src/routes/warehouses.ts:215`, `apps/api/src/services/inventory.service.ts:153`, `apps/api/src/services/inventory.service.ts:230`

#### 4.4.2 Product/service maturity vs demo
- Conclusion: **Pass**
- Rationale: The codebase includes mature controls (immutable auditing, encrypted fields, revocable/rotated sessions, integration hardening, scheduler jobs, scoped ABAC).
- Evidence: `apps/api/src/db/migrations/001_init.sql:429`, `apps/api/src/services/auth.service.ts:191`, `apps/api/src/services/integration-security.service.ts:48`, `apps/api/src/services/scheduler.service.ts:82`, `apps/api/src/plugins/audit.ts:14`

### 4.5 Prompt Understanding and Requirement Fit

#### 4.5.1 Business goal and implicit constraints fit
- Conclusion: **Partial Pass**
- Rationale: Prompt intent is implemented well for offline multi-role operations and security constraints. Remaining issue impacts scan-flow precision in a legitimate data shape (item with multiple barcodes).
- Evidence: `README.md:3`, `README.md:26`, `apps/api/src/services/inventory.service.ts:153`, `apps/api/src/services/inventory.service.ts:230`, `apps/api/src/db/migrations/001_init.sql:158`

### 4.6 Aesthetics (Frontend)

#### 4.6.1 Visual and interaction quality
- Conclusion: **Pass**
- Rationale: Functional areas are visually distinct with hierarchy, panels, states, and inline feedback; scan disambiguation, tables, forms, and timeline patterns are present.
- Evidence: `apps/web/src/app/features/search/search-page.component.ts:27`, `apps/web/src/app/features/inventory/inventory-page.component.ts:79`, `apps/web/src/app/features/warehouse/warehouse-page.component.ts:56`, `apps/web/src/app/features/catalog/catalog-page.component.ts:24`
- Manual verification note: Final rendering and device behavior remain manual.

## 5. Issues / Suggestions (Severity-Rated)

### 1) Medium
- Severity: **Medium**
- Title: **Inventory scan query can create false `multiple_positions` for lot/SKU scans when an item has multiple barcodes**
- Conclusion: **Fail**
- Evidence: `apps/api/src/services/inventory.service.ts:153`, `apps/api/src/services/inventory.service.ts:155`, `apps/api/src/services/inventory.service.ts:230`, `apps/api/src/routes/inventory.ts:55`, `apps/api/src/db/migrations/001_init.sql:158`, `apps/api/test/api-inventory.integration.test.ts:84`
- Impact:
- The scan query joins `barcodes` directly and applies `(b.barcode = $1 OR i.sku = $1 OR l.lot_code = $1)`.
- For lot/SKU lookups, each barcode row satisfies the OR condition, multiplying rows for one logical lot/bin.
- `lookupScan` uses `matches.length` to choose result kind, so multiplied rows can incorrectly switch from `single_position` to `multiple_positions`, slowing clerk flow and forcing unnecessary operator disambiguation.
- Minimum actionable fix:
- Replace direct barcode join with a deduplicated barcode projection (for example, `barcode_rollup` CTE or `EXISTS` for match criteria plus one display barcode).
- Ensure scan result grouping is by logical lot/bin/item identity, not barcode row cardinality.
- Add integration tests for lot and SKU scans where one item has multiple barcodes and one visible lot/bin, asserting `single_position`.

## 6. Security Review Summary

- Authentication entry points: **Pass**
- Evidence: `apps/api/src/routes/auth.ts:82`, `apps/api/src/services/auth.service.ts:99`, `apps/api/src/services/auth.service.ts:191`, `apps/api/test/api-auth.integration.test.ts:483`
- Reasoning: Local auth, lockout, CAPTCHA, password history, revocation, and explicit session rotation are statically implemented and test-covered.

- Route-level authorization: **Pass**
- Evidence: `apps/api/src/plugins/rbac.ts:4`, `apps/api/src/routes/admin.ts:617`, `apps/api/src/routes/search.ts:34`, `apps/api/src/routes/warehouses.ts:215`, `apps/api/test/api-security.integration.test.ts:70`
- Reasoning: Protected routes consistently use auth + permission guards.

- Object-level authorization: **Pass**
- Evidence: `apps/api/src/services/access-control.service.ts:138`, `apps/api/src/services/access-control.service.ts:166`, `apps/api/src/services/access-control.service.ts:214`, `apps/api/src/services/moderation.service.ts:147`, `apps/api/test/api-security.integration.test.ts:166`
- Reasoning: Warehouse/bin/item/question/image/report scope checks are explicit.

- Function-level authorization: **Pass**
- Evidence: `apps/api/src/services/access-control.service.ts:309`, `apps/api/src/routes/catalog.ts:524`, `apps/api/src/routes/documents.ts:55`, `apps/api/test/api-security.integration.test.ts:131`
- Reasoning: High-risk functions (catalog answers, document actions, admin controls) are function-gated.

- Tenant / user data isolation: **Pass**
- Evidence: `apps/api/src/services/access-control.service.ts:44`, `apps/api/src/services/search.service.ts:88`, `apps/api/src/services/bulk-import.service.ts:365`, `apps/api/src/services/integration-security.service.ts:101`, `apps/api/test/api-security.integration.test.ts:246`
- Reasoning: Department and warehouse scope controls are enforced in core read/write paths.

- Admin / internal / debug protection: **Pass**
- Evidence: `apps/api/src/routes/admin.ts:227`, `apps/api/src/routes/health.ts:4`, `apps/api/src/routes/integrations.ts:12`, `apps/api/src/services/webhook-url.service.ts:128`, `apps/api/test/runtime-security.test.ts:110`, `apps/api/test/api-security.integration.test.ts:646`
- Reasoning: Admin paths are permission-gated; integration endpoint is protected by HMAC + scope + anti-replay/rate controls; unsafe webhook targets are denied by allowlist + DNS-to-private checks.

## 7. Tests and Logging Review

- Unit tests: **Pass**
- Evidence: `apps/api/package.json:13`, `apps/api/test/process-error-logging.test.ts:4`, `apps/api/test/runtime-security.test.ts:50`, `apps/api/test/webhook-url.test.ts:4`, `apps/web/package.json:11`
- Rationale: Meaningful unit/security coverage exists for API and frontend utility behavior.

- API / integration tests: **Partial Pass**
- Evidence: `apps/api/package.json:15`, `apps/api/test/api-auth.integration.test.ts:483`, `apps/api/test/api-search.integration.test.ts:216`, `apps/api/test/api-validation.integration.test.ts:152`, `apps/api/test/api-security.integration.test.ts:646`, `apps/api/test/api-inventory.integration.test.ts:84`
- Rationale: Broad risk coverage exists, but inventory scan tests do not cover the multi-barcode + lot/SKU dedupe edge.

- Logging categories / observability: **Pass**
- Evidence: `apps/api/src/server.ts:75`, `apps/api/src/plugins/audit.ts:14`, `apps/api/src/services/scheduler.service.ts:82`, `apps/api/src/utils/error-logging.ts:21`
- Rationale: Request-path errors, process errors, scheduler outcomes, and audit events are categorized and persisted.

- Sensitive-data leakage risk in logs / responses: **Pass**
- Evidence: `apps/api/src/utils/error-logging.ts:1`, `apps/api/test/process-error-logging.test.ts:5`, `apps/api/src/services/integration-client.service.ts:87`, `apps/api/test/api-security.integration.test.ts:639`
- Rationale: Redaction exists for DSNs/tokens/secrets and secret fields are not exposed in client listings.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist:
- API Vitest unit/security suites: `apps/api/package.json:13`, `apps/api/package.json:14`
- Web unit tests: `apps/web/package.json:11`
- API/integration tests exist:
- DB-backed integration entry point: `apps/api/package.json:15`
- Integration suites for auth/security/search/inventory/validation/etc.: `apps/api/test/api-auth.integration.test.ts:43`, `apps/api/test/api-security.integration.test.ts:67`, `apps/api/test/api-search.integration.test.ts:111`, `apps/api/test/api-inventory.integration.test.ts:7`, `apps/api/test/api-validation.integration.test.ts:6`
- Browser tests exist:
- Mocked Playwright: `apps/web/package.json:12`
- Local real smoke Playwright: `apps/web/package.json:13`
- Documentation provides test commands:
- `README.md:341`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) (`file:line`) | Key Assertion / Fixture / Mock (`file:line`) | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Local auth policy: lockout, CAPTCHA escalation, password history, session rotation/revocation | `apps/api/test/api-auth.integration.test.ts:101`, `apps/api/test/api-auth.integration.test.ts:483` | Lockout+unlock path (`apps/api/test/api-auth.integration.test.ts:144`, `apps/api/test/api-auth.integration.test.ts:167`); rotation invalidates old token (`apps/api/test/api-auth.integration.test.ts:529`) | sufficient | No material static gap in reviewed auth controls | Add boundary test for idle-timeout expiry if session semantics are changed. |
| Search filtering/sorting/pagination/saved views and dedupe behavior | `apps/api/test/api-search.integration.test.ts:216`, `apps/api/test/api-search.integration.test.ts:248` | Multi-barcode + multi-lot dedupe asserts exact totals/rows (`apps/api/test/api-search.integration.test.ts:271`, `apps/api/test/api-search.integration.test.ts:283`) | sufficient | No remaining gap identified in search dedupe path | Keep regression test when query shape changes. |
| Scan-first inventory: no_match, item_only, multi-position disambiguation | `apps/api/test/api-inventory.integration.test.ts:10`, `apps/api/test/api-inventory.integration.test.ts:34`, `apps/api/test/api-inventory.integration.test.ts:84` | Explicit kind assertions (`apps/api/test/api-inventory.integration.test.ts:69`, `apps/api/test/api-inventory.integration.test.ts:167`) | basically covered | Missing edge where one lot/SKU scan is multiplied by multiple barcode rows | Add test: one item, two barcodes, one lot/bin, scan by `lot_code` and by `sku`, expect `single_position`. |
| Warehouse hierarchy write validation determinism | `apps/api/test/api-validation.integration.test.ts:152` | Malformed warehouse/zone/bin writes all return `422` (`apps/api/test/api-validation.integration.test.ts:237`) | sufficient | No material static gap after recent fixes | Add targeted assertions only if schemas change. |
| Internal webhook trust boundary and integration endpoint security | `apps/api/test/webhook-url.test.ts:28`, `apps/api/test/api-security.integration.test.ts:646` | Reject single-label and unsafe/public hosts (`apps/api/test/webhook-url.test.ts:29`, `apps/api/test/api-security.integration.test.ts:683`) | sufficient | No material static gap found in reviewed webhook policy | Add DNS-IPv6-specific deny case if infra requirements expand. |
| Bulk import rollback traceability and result durability | `apps/api/src/services/bulk-import.service.ts:222`, `apps/api/src/services/bulk-import.service.ts:347`, `apps/api/test/api-bulk.integration.test.ts:24` | Batch job created before transaction + failure row persistence (`apps/api/src/services/bulk-import.service.ts:222`, `apps/api/src/services/bulk-import.service.ts:348`) | basically covered | Static test mapping is broad but not deeply targeted on rollback message semantics | Add integration assertion for forced in-transaction failure and durable failed-row diagnostics. |
| Immutable audit log enforcement | `apps/api/src/db/migrations/001_init.sql:429`, `apps/api/test/api-auth.integration.test.ts:568` | DB triggers block update/delete; auth/session actions audited (`apps/api/src/db/migrations/001_init.sql:437`, `apps/api/src/db/migrations/001_init.sql:442`) | sufficient | No material static gap found | Add explicit migration-level test for trigger enforcement if desired. |
| Sensitive log redaction | `apps/api/test/process-error-logging.test.ts:4` | Redaction asserts for DSN/token/secrets (`apps/api/test/process-error-logging.test.ts:12`, `apps/api/test/process-error-logging.test.ts:33`) | sufficient | No material static gap found | Keep regression tests if sanitizer patterns change. |

### 8.3 Security Coverage Audit
- Authentication: **sufficient**
- Evidence: `apps/api/test/api-auth.integration.test.ts:101`, `apps/api/test/api-auth.integration.test.ts:483`
- Assessment: Major auth regressions around lockout/CAPTCHA/password/session rotation would likely be caught.

- Route authorization: **sufficient**
- Evidence: `apps/api/test/api-security.integration.test.ts:70`, `apps/api/test/runtime-security.test.ts:110`
- Assessment: Core `401/403` route gating is meaningfully exercised.

- Object-level authorization: **basically covered**
- Evidence: `apps/api/test/api-security.integration.test.ts:166`, `apps/api/test/api-moderation.integration.test.ts:92`
- Assessment: Warehouse/department object scope is tested, though not exhaustively for every endpoint.

- Tenant / data isolation: **sufficient**
- Evidence: `apps/api/test/api-security.integration.test.ts:246`, `apps/api/test/api-security.integration.test.ts:362`
- Assessment: Major cross-department leakage defects are likely to be detected.

- Admin / internal protection: **sufficient**
- Evidence: `apps/api/test/runtime-security.test.ts:110`, `apps/api/test/api-security.integration.test.ts:646`
- Assessment: Admin and integration trust-boundary protections are meaningfully covered.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Covered major risks:
- Auth/session security controls, route authorization, integration HMAC/replay/rate limits, webhook safety policy, search workspace behavior, warehouse validation determinism, and sensitive log sanitization.
- Uncovered risk that can still escape while tests pass:
- Inventory scan lot/SKU dedupe behavior when one item has multiple barcodes.

## 9. Final Notes
- This retest remained strictly static-only and does not claim runtime success.
- Previously reported findings on webhook permissiveness, warehouse validation gaps, unlock endpoint correctness, rotation absence, and rollback traceability do not reproduce in current code.
- The remaining report is intentionally narrowed to currently evidence-backed defects.
