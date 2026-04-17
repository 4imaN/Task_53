# Test Coverage Audit

## Project Type
- Declared type: `fullstack` in `README.md:3`.
- Repository evidence also supports `fullstack`: backend in `apps/api`, frontend in `apps/web`, Angular route tree in `apps/web/src/app/app.routes.ts:25-70`.

## Backend Endpoint Inventory

| # | Endpoint | Route evidence |
| --- | --- | --- |
| 1 | `GET /api/auth/login-hints` | `apps/api/src/routes/auth.ts:82` |
| 2 | `GET /api/auth/captcha` | `apps/api/src/routes/auth.ts:95` |
| 3 | `POST /api/auth/login` | `apps/api/src/routes/auth.ts:102` |
| 4 | `POST /api/auth/logout` | `apps/api/src/routes/auth.ts:141` |
| 5 | `POST /api/auth/sessions/rotate` | `apps/api/src/routes/auth.ts:153` |
| 6 | `GET /api/auth/sessions` | `apps/api/src/routes/auth.ts:176` |
| 7 | `GET /api/auth/me` | `apps/api/src/routes/auth.ts:180` |
| 8 | `POST /api/auth/change-password` | `apps/api/src/routes/auth.ts:189` |
| 9 | `POST /api/auth/sessions/:sessionId/revoke` | `apps/api/src/routes/auth.ts:208` |
| 10 | `GET /api/health` | `apps/api/src/routes/health.ts:4` |
| 11 | `GET /api/search` | `apps/api/src/routes/search.ts:34` |
| 12 | `GET /api/search/views` | `apps/api/src/routes/search.ts:53` |
| 13 | `POST /api/search/views` | `apps/api/src/routes/search.ts:59` |
| 14 | `GET /api/warehouses` | `apps/api/src/routes/warehouses.ts:172` |
| 15 | `GET /api/warehouse-setup/options` | `apps/api/src/routes/warehouses.ts:202` |
| 16 | `POST /api/warehouses` | `apps/api/src/routes/warehouses.ts:215` |
| 17 | `PATCH /api/warehouses/:warehouseId` | `apps/api/src/routes/warehouses.ts:251` |
| 18 | `POST /api/warehouses/:warehouseId/zones` | `apps/api/src/routes/warehouses.ts:317` |
| 19 | `PATCH /api/zones/:zoneId` | `apps/api/src/routes/warehouses.ts:351` |
| 20 | `POST /api/zones/:zoneId/bins` | `apps/api/src/routes/warehouses.ts:402` |
| 21 | `PATCH /api/bins/:binId` | `apps/api/src/routes/warehouses.ts:499` |
| 22 | `GET /api/warehouses/:warehouseId/tree` | `apps/api/src/routes/warehouses.ts:612` |
| 23 | `POST /api/bins/:binId/toggle` | `apps/api/src/routes/warehouses.ts:649` |
| 24 | `GET /api/bins/:binId/timeline` | `apps/api/src/routes/warehouses.ts:689` |
| 25 | `POST /api/inventory/scan` | `apps/api/src/routes/inventory.ts:55` |
| 26 | `POST /api/inventory/move` | `apps/api/src/routes/inventory.ts:63` |
| 27 | `POST /api/inventory/receive` | `apps/api/src/routes/inventory.ts:80` |
| 28 | `POST /api/inventory/pick` | `apps/api/src/routes/inventory.ts:105` |
| 29 | `POST /api/moderation/reports` | `apps/api/src/routes/moderation.ts:51` |
| 30 | `GET /api/moderation/queue` | `apps/api/src/routes/moderation.ts:77` |
| 31 | `POST /api/moderation/reports/:reportId/status` | `apps/api/src/routes/moderation.ts:81` |
| 32 | `GET /api/inbox` | `apps/api/src/routes/moderation.ts:106` |
| 33 | `POST /api/inbox/:notificationId/read` | `apps/api/src/routes/moderation.ts:120` |
| 34 | `POST /api/inbox/read-all` | `apps/api/src/routes/moderation.ts:142` |
| 35 | `POST /api/integrations/inventory-sync` | `apps/api/src/routes/integrations.ts:12` |
| 36 | `GET /api/metrics/summary` | `apps/api/src/routes/metrics.ts:4` |
| 37 | `POST /api/catalog/reviews/:reviewId/images` | `apps/api/src/routes/catalog.ts:218` |
| 38 | `GET /api/catalog/review-images/:imageId/content` | `apps/api/src/routes/catalog.ts:264` |
| 39 | `GET /api/catalog/items` | `apps/api/src/routes/catalog.ts:336` |
| 40 | `GET /api/catalog/favorites` | `apps/api/src/routes/catalog.ts:351` |
| 41 | `GET /api/catalog/history` | `apps/api/src/routes/catalog.ts:355` |
| 42 | `POST /api/catalog/items/:itemId/favorite` | `apps/api/src/routes/catalog.ts:359` |
| 43 | `POST /api/catalog/items/:itemId/reviews` | `apps/api/src/routes/catalog.ts:396` |
| 44 | `POST /api/catalog/reviews/:reviewId/followups` | `apps/api/src/routes/catalog.ts:430` |
| 45 | `POST /api/catalog/items/:itemId/questions` | `apps/api/src/routes/catalog.ts:485` |
| 46 | `POST /api/catalog/questions/:questionId/answers` | `apps/api/src/routes/catalog.ts:515` |
| 47 | `GET /api/catalog/items/:itemId` | `apps/api/src/routes/catalog.ts:548` |
| 48 | `PATCH /api/catalog/items/:itemId` | `apps/api/src/routes/catalog.ts:673` |
| 49 | `GET /api/users` | `apps/api/src/routes/admin.ts:227` |
| 50 | `GET /api/access-control/options` | `apps/api/src/routes/admin.ts:261` |
| 51 | `POST /api/users` | `apps/api/src/routes/admin.ts:279` |
| 52 | `PATCH /api/users/:userId` | `apps/api/src/routes/admin.ts:393` |
| 53 | `PUT /api/users/:userId/access-control` | `apps/api/src/routes/admin.ts:571` |
| 54 | `POST /api/users/:userId/unlock` | `apps/api/src/routes/admin.ts:617` |
| 55 | `GET /api/audit-log` | `apps/api/src/routes/admin.ts:647` |
| 56 | `GET /api/integration-clients` | `apps/api/src/routes/admin.ts:666` |
| 57 | `POST /api/integration-clients` | `apps/api/src/routes/admin.ts:673` |
| 58 | `POST /api/documents` | `apps/api/src/routes/documents.ts:102` |
| 59 | `GET /api/documents` | `apps/api/src/routes/documents.ts:178` |
| 60 | `GET /api/documents/:documentId` | `apps/api/src/routes/documents.ts:210` |
| 61 | `POST /api/documents/:documentId/transition` | `apps/api/src/routes/documents.ts:272` |
| 62 | `POST /api/documents/:documentId/execute-receiving` | `apps/api/src/routes/documents.ts:300` |
| 63 | `POST /api/documents/:documentId/execute-shipping` | `apps/api/src/routes/documents.ts:305` |
| 64 | `POST /api/documents/:documentId/execute-transfer` | `apps/api/src/routes/documents.ts:310` |
| 65 | `GET /api/bulk/templates/catalog-items` | `apps/api/src/routes/bulk.ts:49` |
| 66 | `POST /api/bulk/catalog-items/precheck` | `apps/api/src/routes/bulk.ts:68` |
| 67 | `POST /api/bulk/catalog-items/import` | `apps/api/src/routes/bulk.ts:93` |
| 68 | `GET /api/bulk/catalog-items/export` | `apps/api/src/routes/bulk.ts:123` |
| 69 | `GET /api/bulk/jobs` | `apps/api/src/routes/bulk.ts:143` |
| 70 | `GET /api/bulk/jobs/:jobId/results` | `apps/api/src/routes/bulk.ts:150` |

Note: The route inventory contains 70 endpoints, not 69. Static route extraction from `apps/api/src/routes/*.ts` resolves 70 unique `METHOD + PATH` pairs under the global `/api` prefix in `apps/api/src/server.ts:60-73`.

## API Test Mapping Table

| Endpoint | Covered | Test type | Test files | Evidence |
| --- | --- | --- | --- | --- |
| `GET /api/auth/login-hints` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts` | `it('returns generic login-hint responses for known and unknown accounts')`; `it('throttles repeated unauthenticated login-hint probes')` |
| `GET /api/auth/captcha` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts` | `it('enforces captcha escalation, account lockout, and admin unlock')` |
| `POST /api/auth/login` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts`, `apps/api/test/api-auth-session.integration.test.ts` | login, rotation, actor portal, logout/session lifecycle tests |
| `POST /api/auth/logout` | Yes | true no-mock HTTP | `apps/api/test/api-auth-session.integration.test.ts` | `it('logs out and revokes the session so the old token is rejected on protected routes')`; `it('returns 401 when calling logout without a token')` |
| `POST /api/auth/sessions/rotate` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts` | `it('rotates sessions atomically and invalidates the previous token')` |
| `GET /api/auth/sessions` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts`, `apps/api/test/api-auth-session.integration.test.ts` | password change/session invalidation and revoke tests |
| `GET /api/auth/me` | Yes | true no-mock HTTP | `apps/api/test/api-auth-session.integration.test.ts` | `it('GET /api/auth/me returns current user info for authenticated admin')` |
| `POST /api/auth/change-password` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts` | `it('changes passwords, revokes active sessions, and blocks password reuse')` |
| `POST /api/auth/sessions/:sessionId/revoke` | Yes | true no-mock HTTP | `apps/api/test/api-auth-session.integration.test.ts` | `it('revokes a specific session by sessionId so that session token is rejected')` |
| `GET /api/health` | Yes | true no-mock HTTP | `apps/api/test/api-health.integration.test.ts`, `apps/api/test/runtime-security.test.ts` | `it('GET /api/health returns 200 with status ok for an authenticated user')`; additional transport/rate-limit checks exist in mocked runtime-security tests |
| `GET /api/search` | Yes | true no-mock HTTP | `apps/api/test/api-search.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | visibility, deduplication, pagination, filter, validation tests |
| `GET /api/search/views` | Yes | true no-mock HTTP | `apps/api/test/api-read-routes.integration.test.ts` | admin/401/403 coverage |
| `POST /api/search/views` | Yes | true no-mock HTTP | `apps/api/test/api-search.integration.test.ts` | create, cap conflict, update-at-cap tests |
| `GET /api/warehouses` | Yes | true no-mock HTTP | `apps/api/test/api-warehouses.integration.test.ts` | admin success and unauthenticated coverage |
| `GET /api/warehouse-setup/options` | Yes | true no-mock HTTP | `apps/api/test/api-bulk.integration.test.ts` | `it('keeps warehouse setup temperature options aligned with bulk validators')` |
| `POST /api/warehouses` | Yes | true no-mock HTTP | `apps/api/test/api-warehouses.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | create success, 403, malformed-body coverage |
| `PATCH /api/warehouses/:warehouseId` | Yes | true no-mock HTTP | `apps/api/test/api-warehouses.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | update success and validation coverage |
| `POST /api/warehouses/:warehouseId/zones` | Yes | true no-mock HTTP | `apps/api/test/api-validation.integration.test.ts` | nonexistent warehouse 404 and malformed-body coverage |
| `PATCH /api/zones/:zoneId` | Yes | true no-mock HTTP | `apps/api/test/api-warehouses.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | zone rename and malformed-body coverage |
| `POST /api/zones/:zoneId/bins` | Yes | true no-mock HTTP | `apps/api/test/api-warehouses.integration.test.ts` | create bin success |
| `PATCH /api/bins/:binId` | Yes | true no-mock HTTP | `apps/api/test/api-warehouses.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | update success and malformed-body coverage |
| `GET /api/warehouses/:warehouseId/tree` | Yes | true no-mock HTTP | `apps/api/test/api-security.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | out-of-scope 403 and missing warehouse 404 |
| `POST /api/bins/:binId/toggle` | Yes | true no-mock HTTP | `apps/api/test/api-warehouses.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | toggle success and malformed-body coverage |
| `GET /api/bins/:binId/timeline` | Yes | true no-mock HTTP | `apps/api/test/api-security.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | out-of-scope 403 and invalid UUID 422 |
| `POST /api/inventory/scan` | Yes | true no-mock HTTP | `apps/api/test/api-inventory.integration.test.ts` | no-match, item-only, multi-match, single-position, permission tests |
| `POST /api/inventory/move` | Yes | true no-mock HTTP | `apps/api/test/api-inventory.integration.test.ts` | mismatch 422, move success, non-positive validation |
| `POST /api/inventory/receive` | Yes | true no-mock HTTP | `apps/api/test/api-inventory.integration.test.ts` | receive success, temperature mismatch, canonical temperature, non-positive validation |
| `POST /api/inventory/pick` | Yes | true no-mock HTTP | `apps/api/test/api-inventory.integration.test.ts`, `apps/api/test/api-inventory-pick.integration.test.ts` | pick success, permission denial, non-positive validation |
| `POST /api/moderation/reports` | Yes | true no-mock HTTP | `apps/api/test/api-moderation.integration.test.ts`, `apps/api/test/api-catalog.integration.test.ts` | invalid payloads, scoping, deduplication, race-safety |
| `GET /api/moderation/queue` | Yes | true no-mock HTTP | `apps/api/test/api-moderation.integration.test.ts` | scoped queue visibility |
| `POST /api/moderation/reports/:reportId/status` | Yes | true no-mock HTTP | `apps/api/test/api-moderation.integration.test.ts`, `apps/api/test/api-catalog.integration.test.ts` | resolution/status update coverage |
| `GET /api/inbox` | Yes | true no-mock HTTP | `apps/api/test/api-inbox.integration.test.ts` | list and 401 coverage |
| `POST /api/inbox/:notificationId/read` | Yes | true no-mock HTTP | `apps/api/test/api-inbox.integration.test.ts` | mark-read coverage |
| `POST /api/inbox/read-all` | Yes | true no-mock HTTP | `apps/api/test/api-inbox.integration.test.ts` | read-all coverage |
| `POST /api/integrations/inventory-sync` | Yes | true no-mock HTTP | `apps/api/test/api-security.integration.test.ts` | rate limit, freshness, replay, department isolation, multi-instance, delivery persistence |
| `GET /api/metrics/summary` | Yes | true no-mock HTTP | `apps/api/test/api-read-routes.integration.test.ts` | admin/401/403 coverage |
| `POST /api/catalog/reviews/:reviewId/images` | Yes | true no-mock HTTP | `apps/api/test/api-catalog-upload.integration.test.ts` | valid upload, 401, missing file, missing review |
| `GET /api/catalog/review-images/:imageId/content` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts` | audited export and tamper-block tests |
| `GET /api/catalog/items` | Yes | true no-mock HTTP | `apps/api/test/api-security.integration.test.ts` | department ABAC list coverage |
| `GET /api/catalog/favorites` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts` | dedicated favorites/history scoping test |
| `GET /api/catalog/history` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts` | dedicated favorites/history scoping test |
| `POST /api/catalog/items/:itemId/favorite` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts` | favorite success and missing-item 404 |
| `POST /api/catalog/items/:itemId/reviews` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts` | missing-item 404 reaches route handler |
| `POST /api/catalog/reviews/:reviewId/followups` | Yes | true no-mock HTTP | `apps/api/test/api-catalog-upload.integration.test.ts` | success, 401, missing review |
| `POST /api/catalog/items/:itemId/questions` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts`, `apps/api/test/api-security.integration.test.ts` | question success, scoping denial, missing-item 404 |
| `POST /api/catalog/questions/:questionId/answers` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts`, `apps/api/test/api-security.integration.test.ts` | answer success, 403 for non-editor, missing-question 404 |
| `GET /api/catalog/items/:itemId` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts`, `apps/api/test/api-security.integration.test.ts` | detail success, missing-item 404, ABAC denial |
| `PATCH /api/catalog/items/:itemId` | Yes | true no-mock HTTP | `apps/api/test/api-catalog.integration.test.ts` | manager/admin update allowed, non-manager denied |
| `GET /api/users` | Yes | true no-mock HTTP | `apps/api/test/api-security.integration.test.ts` | list-users encryption/non-leak test |
| `GET /api/access-control/options` | Yes | true no-mock HTTP | `apps/api/test/api-read-routes.integration.test.ts` | admin/401/403 coverage |
| `POST /api/users` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts`, `apps/api/test/api-security.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | password policy, encrypted contacts, malformed-body coverage |
| `PATCH /api/users/:userId` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts` | password history, deactivate, admin reset tests |
| `PUT /api/users/:userId/access-control` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts` | `it('invalidates existing sessions after access-control updates')` |
| `POST /api/users/:userId/unlock` | Yes | true no-mock HTTP | `apps/api/test/api-auth.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | unlock success, nonexistent 404, soft-delete 404, invalid UUID 422 |
| `GET /api/audit-log` | Yes | true no-mock HTTP | `apps/api/test/api-read-routes.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | admin/401/403 and invalid query coverage |
| `GET /api/integration-clients` | Yes | true no-mock HTTP | `apps/api/test/api-security.integration.test.ts` | secret non-leak listing coverage |
| `POST /api/integration-clients` | Yes | true no-mock HTTP | `apps/api/test/api-security.integration.test.ts` | encrypted-at-rest, webhook target validation coverage |
| `POST /api/documents` | Yes | true no-mock HTTP | `apps/api/test/api-documents.integration.test.ts` | create success, least-privilege, invalid typed payload, permission denial |
| `GET /api/documents` | Yes | true no-mock HTTP | `apps/api/test/api-read-routes.integration.test.ts`, `apps/api/test/api-documents.integration.test.ts` | admin list, 401/403, workflow scenarios |
| `GET /api/documents/:documentId` | Yes | true no-mock HTTP | `apps/api/test/api-documents.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | detail success, post-transition detail, invalid UUID 422 |
| `POST /api/documents/:documentId/transition` | Yes | true no-mock HTTP | `apps/api/test/api-documents.integration.test.ts`, `apps/api/test/api-validation.integration.test.ts` | workflow transitions and invalid enum coverage |
| `POST /api/documents/:documentId/execute-receiving` | Yes | Yes, mixed | `apps/api/test/api-documents.integration.test.ts` | real execution/rollback tests plus one spy-based duplicate-execution test |
| `POST /api/documents/:documentId/execute-shipping` | Yes | true no-mock HTTP | `apps/api/test/api-documents.integration.test.ts` | approved shipping execution |
| `POST /api/documents/:documentId/execute-transfer` | Yes | true no-mock HTTP | `apps/api/test/api-documents.integration.test.ts` | approved transfer execution |
| `GET /api/bulk/templates/catalog-items` | Yes | true no-mock HTTP | `apps/api/test/api-read-routes.integration.test.ts` | admin/401/403 attachment coverage |
| `POST /api/bulk/catalog-items/precheck` | Yes | true no-mock HTTP | `apps/api/test/api-bulk.integration.test.ts` | valid CSV/XLSX, rollback setup, normalization, conflict visibility |
| `POST /api/bulk/catalog-items/import` | Yes | true no-mock HTTP | `apps/api/test/api-bulk.integration.test.ts`, `apps/api/test/api-security.integration.test.ts` | import success, rollback durability, scoped-user import, validation failure 422 |
| `GET /api/bulk/catalog-items/export` | Yes | true no-mock HTTP | `apps/api/test/api-bulk.integration.test.ts` | export taxonomy consistency |
| `GET /api/bulk/jobs` | Yes | true no-mock HTTP | `apps/api/test/api-security.integration.test.ts` | owner/department overlap scoping |
| `GET /api/bulk/jobs/:jobId/results` | Yes | true no-mock HTTP | `apps/api/test/api-bulk.integration.test.ts`, `apps/api/test/api-security.integration.test.ts` | imported-row results and scoped visibility |

## API Test Classification

### 1. True No-Mock HTTP
- Primary evidence: `apps/api/test/helpers/integration.ts:7-39` boots the real Fastify app with `buildServer()` and uses `server.inject()` against registered routes.
- Files:
  - `apps/api/test/api-health.integration.test.ts`
  - `apps/api/test/api-auth.integration.test.ts`
  - `apps/api/test/api-auth-session.integration.test.ts`
  - `apps/api/test/api-warehouses.integration.test.ts`
  - `apps/api/test/api-inventory.integration.test.ts`
  - `apps/api/test/api-inventory-pick.integration.test.ts`
  - `apps/api/test/api-documents.integration.test.ts` except one spy-based execution test
  - `apps/api/test/api-search.integration.test.ts`
  - `apps/api/test/api-bulk.integration.test.ts`
  - `apps/api/test/api-catalog.integration.test.ts`
  - `apps/api/test/api-catalog-upload.integration.test.ts`
  - `apps/api/test/api-moderation.integration.test.ts`
  - `apps/api/test/api-inbox.integration.test.ts`
  - `apps/api/test/api-security.integration.test.ts`
  - `apps/api/test/api-read-routes.integration.test.ts`
  - `apps/api/test/api-validation.integration.test.ts`

### 2. HTTP With Mocking
- `apps/api/test/runtime-security.test.ts`
  - Mocks `AuthService.prototype.login` and `AuthService.prototype.touchSession`.
  - Affects `POST /api/auth/login` and authenticated `GET /api/health`.
- `apps/api/test/error-sanitization.test.ts`
  - Mocks `AuthService.prototype.login`.
  - Uses Fastify HTTP injection, but the auth service on the execution path is mocked.
- `apps/api/test/api-documents.integration.test.ts`
  - One test spies on `InventoryService.prototype.receiveInventoryInTransaction` for duplicate execution behavior.
  - This makes that specific `POST /api/documents/:documentId/execute-receiving` scenario an HTTP test with mocking.

### 3. Non-HTTP (unit/integration without HTTP)
- `apps/api/test/auth-security.test.ts`
- `apps/api/test/password-history.test.ts`
- `apps/api/test/bootstrap-password-policy.test.ts`
- `apps/api/test/password-policy.test.ts`
- `apps/api/test/search.test.ts`
- `apps/api/test/bulk-import.test.ts`
- `apps/api/test/hmac.test.ts`
- `apps/api/test/webhook-delivery.test.ts`
- `apps/api/test/webhook-url.test.ts`
- `apps/api/test/review-image-storage.test.ts`
- `apps/api/test/process-error-logging.test.ts`
- `apps/api/test/config-security.test.ts`

## Mock Detection

| File | Mock/stub evidence | What is mocked | Impact |
| --- | --- | --- | --- |
| `apps/api/test/runtime-security.test.ts` | `vi.spyOn(authModule.AuthService.prototype, 'login').mockResolvedValue(...)`; `vi.spyOn(authModule.AuthService.prototype, 'touchSession').mockResolvedValue(true)` | auth service login/session touch | HTTP with mocking only |
| `apps/api/test/error-sanitization.test.ts` | `vi.spyOn(AuthService.prototype, 'login').mockRejectedValueOnce(...)` | auth login failure path | HTTP with mocking |
| `apps/api/test/api-documents.integration.test.ts` | `vi.spyOn(InventoryService.prototype, 'receiveInventoryInTransaction').mockImplementation(...)` | receiving execution internals | one mixed HTTP scenario |
| `apps/api/test/auth-security.test.ts` | service spies and fake captcha service | `AuthService` internals | non-HTTP unit only |
| `apps/api/test/bulk-import.test.ts` | `vi.fn()` DB query stub | `BulkImportService` DB dependency | non-HTTP unit only |

## Coverage Summary

- Total endpoints: `70`
- Endpoints with HTTP tests: `70`
- Endpoints with true no-mock HTTP coverage: `70`
- HTTP coverage: `100.0%`
- True API coverage: `100.0%`

## Unit Test Summary

### Backend Unit Tests

- Test files:
  - `apps/api/test/auth-security.test.ts`
  - `apps/api/test/password-history.test.ts`
  - `apps/api/test/bootstrap-password-policy.test.ts`
  - `apps/api/test/password-policy.test.ts`
  - `apps/api/test/search.test.ts`
  - `apps/api/test/bulk-import.test.ts`
  - `apps/api/test/hmac.test.ts`
  - `apps/api/test/webhook-delivery.test.ts`
  - `apps/api/test/webhook-url.test.ts`
  - `apps/api/test/review-image-storage.test.ts`
  - `apps/api/test/process-error-logging.test.ts`
  - `apps/api/test/config-security.test.ts`

- Modules covered:
  - Services: `AuthService`, `BulkImportService`, review image storage, webhook URL validation, webhook payload summarization
  - Utilities/domain: password history, password policy/bootstrap policy, HMAC helpers, search query builder, config loading, error log sanitization
  - Auth/guards/middleware-related logic: auth security behavior and runtime config rules

- Important backend modules not unit-tested directly:
  - `apps/api/src/services/inventory.service.ts`
  - `apps/api/src/services/document.service.ts`
  - `apps/api/src/services/moderation.service.ts`
  - `apps/api/src/services/access-control.service.ts`
  - `apps/api/src/services/integration-security.service.ts`
  - Route-layer handler logic in `apps/api/src/routes/*.ts`

### Frontend Unit Tests

- Mandatory verdict: **Frontend unit tests: PRESENT**
- Frameworks/tools detected:
  - `node:test` from test files such as `apps/web/test/unit/auth-utils.test.ts`
  - Angular `TestBed` from files such as `apps/web/test/unit/feature-pages-admin.test.ts`
  - Angular HTTP testing from `apps/web/test/unit/auth-routing-and-expiry.test.ts`
  - `jsdom` support is implied by `apps/web/package.json` and Angular test environment setup used by the component tests

- Frontend test files:
  - `apps/web/test/unit/auth-routing-and-expiry.test.ts`
  - `apps/web/test/unit/auth-utils.test.ts`
  - `apps/web/test/unit/feature-pages-admin.test.ts`
  - `apps/web/test/unit/feature-pages-catalog.test.ts`
  - `apps/web/test/unit/feature-pages-warehouse.test.ts`
  - `apps/web/test/unit/feature-pages-workflow.test.ts`
  - `apps/web/test/unit/inventory-camera-utils.test.ts`
  - `apps/web/test/unit/login-error-utils.test.ts`
  - `apps/web/test/unit/login-page.component.test.ts`
  - `apps/web/test/unit/search-utils.test.ts`
  - `apps/web/test/unit/session-store.test.ts`
  - `apps/web/test/unit/shell-layout.test.ts`
  - `apps/web/test/unit/status-pages.component.test.ts`

- Components/modules covered:
  - Components: `LoginPageComponent`, `ShellLayoutComponent`, `AdminPageComponent`, `UsersPageComponent`, `ProfilePageComponent`, `CatalogPageComponent`, `ModerationPageComponent`, `WarehousePageComponent`, `DocumentsPageComponent`, `BulkPageComponent`, `DashboardPageComponent`, `InboxPageComponent`, `AuditPageComponent`
  - Auth/core logic: `SessionStore`, `authGuard`, `roleGuard`, `authExpiryInterceptor`, `auth-utils`
  - Utilities: `login-error-utils`, `search-utils`, `inventory-camera-utils`

- Important frontend components/modules not tested directly:
  - `apps/web/src/app/features/search/search-page.component.ts`
  - `apps/web/src/app/features/inventory/inventory-page.component.ts`
  - `apps/web/src/app/features/workspaces/admin-workspace-page.component.ts`
  - `apps/web/src/app/features/workspaces/manager-workspace-page.component.ts`
  - `apps/web/src/app/features/workspaces/moderator-workspace-page.component.ts`
  - `apps/web/src/app/features/workspaces/catalog-workspace-page.component.ts`
  - `apps/web/src/app/features/workspaces/clerk-workspace-page.component.ts`
  - `apps/web/src/app/core/services/api.service.ts`
  - `apps/web/src/app/app.routes.ts`
  - `apps/web/src/app/features/auth/captcha-utils.ts`

### Cross-Layer Observation

- Backend coverage is materially stronger than frontend unit coverage.
- The frontend has real unit tests, but major route-entry pages `SearchPageComponent` and `InventoryPageComponent` and all workspace components in `apps/web/src/app/app.routes.ts:34-67` have no direct unit-test evidence.
- Strict fullstack judgment: this is a notable frontend unit-breadth gap, not a frontend-unit-test absence.

## API Observability Check

- Strong:
  - Most integration tests name the endpoint in the `it(...)` block and show explicit request payloads and assertions, for example `apps/api/test/api-warehouses.integration.test.ts`, `apps/api/test/api-documents.integration.test.ts`, `apps/api/test/api-inventory.integration.test.ts`.
- Weak:
  - Some validation tests assert only standardized `422` envelopes without deep response-shape verification, for example `apps/api/test/api-validation.integration.test.ts`.
  - Some route coverage is only by negative-path assertions, e.g. `POST /api/catalog/items/:itemId/reviews` is evidenced only through a missing-item `404` in `apps/api/test/api-catalog.integration.test.ts`.

## Tests Check

- Success paths: broad backend success-path coverage exists across auth, warehouse, inventory, documents, bulk, catalog, moderation, and integrations.
- Failure cases: strong coverage for auth lockout, validation, ABAC/RBAC denial, unsafe webhooks, replay/rate-limit/freshness, and invalid payloads.
- Edge cases: present for pagination exactness, duplicate reporting race safety, item/barcode deduplication, temperature normalization, rollback durability, and session invalidation.
- Validation depth: good on backend; dedicated `api-validation.integration.test.ts` and route-specific negative tests.
- Auth/permissions: strong backend coverage.
- Integration boundaries: strong backend HTTP-to-DB/integration coverage; frontend live FE↔BE coverage exists but is smoke-level only.
- Assertions vs superficial checks:
  - Mostly meaningful on backend; tests commonly verify DB side effects and response bodies.
  - Frontend unit tests are meaningful but often use stubbed `ApiService` responses rather than actual HTTP or store interactions.
- `run_tests.sh` check:
  - Docker-based and acceptable under the rubric.
  - Evidence: `run_tests.sh:11-14` builds and runs Docker services, then executes API migrate/bootstrap/test commands inside the API container.

## End-to-End Expectations

- Fullstack expectation: real FE ↔ BE tests should exist.
- Static evidence:
  - Mocked browser suite exists in `apps/web/playwright/ui-smoke.spec.ts` and explicitly uses `installMockApi`, so it is not FE↔BE proof.
  - Real FE ↔ BE smoke exists in `apps/web/playwright/ui-local-smoke.spec.ts` with real login, search, inventory receive, document execution, moderation, and inbox scenarios.
- Verdict:
  - Real FE ↔ BE tests are present, but only as smoke coverage. This partially compensates for missing direct unit tests on `SearchPageComponent`, `InventoryPageComponent`, and workspace routes; it does not fully compensate.

## Test Coverage Score (0-100)

- **97/100**

## Score Rationale

- High score justified by:
  - 70/70 endpoints have visible HTTP coverage.
  - 70/70 have visible true no-mock HTTP coverage.
  - Backend tests exercise real DB-backed business flows and verify side effects.
  - Unit coverage exists for multiple security-critical backend subsystems.
  - Frontend unit tests are present and real FE↔BE smoke exists.
- Score held below 100 because:
  - Several important frontend route-entry modules have no direct unit-test evidence.
  - Some route coverage is negative-path-only rather than full success-path coverage, especially `POST /api/catalog/items/:itemId/reviews`.
  - Real FE↔BE browser coverage exists, but it is smoke-level rather than broad end-to-end depth.

## Key Gaps

- Frontend unit breadth is still incomplete for a fullstack app. `SearchPageComponent`, `InventoryPageComponent`, and all five workspace components have no direct unit-test evidence despite being central routes in `apps/web/src/app/app.routes.ts:34-67`.
- `POST /api/catalog/items/:itemId/reviews` is covered only via negative-path `404` evidence in `apps/api/test/api-catalog.integration.test.ts`; no visible success-path test sends a review to a valid item.
- Important backend services are exercised strongly through integration tests, but several are not directly unit-tested in isolation: inventory, document workflow, moderation, access control, and integration-security services.

## Confidence & Assumptions

- Confidence: high.
- Assumptions:
  - Coverage is evaluated strictly from visible static evidence only.
  - A request counts as covered only when a visible test targets the exact route shape.
  - Dynamic template URLs in tests were matched by static grep evidence where visible.

# README Audit

## Hard Gate Check

- `README.md` exists at repo root: pass.
- Clean markdown/readable structure: pass. Evidence: structured headings and sections throughout `README.md:1-327`.
- Project type declared at top: pass. Evidence: `README.md:3`.
- Backend/fullstack startup includes `docker-compose up`: pass. Evidence: `README.md:38-41`.
- Access method includes URL/port: pass. Evidence: `README.md:42-45`, login URLs `README.md:58-62`, `README.md:129-133`.
- Verification method exists:
  - API: partial but acceptable. Evidence: authenticated API health check at `README.md:44-45`.
  - Web/UI: pass. Evidence: browser verification and live smoke sections at `README.md:80-108`, `README.md:289-296`.
- Environment rules:
  - No `npm install`, `pip install`, `apt-get`, or manual DB setup instructions found.
  - Docker-contained startup/testing is stated repeatedly. Evidence: `README.md:47-50`, `README.md:261-278`, `docker-compose.yml`.
  - Pass.
- Demo credentials for auth-enabled system: pass. Evidence: `README.md:52-64`.

## High Priority Issues

- No hard-gate high-priority failure found.
- Verification for the API is described narratively, but there is no concrete `curl` or Postman example. Evidence: `README.md:44-45`. This weakens operational clarity, though it does not fully fail the gate.

## Medium Priority Issues

- The README’s frontend unit-test description is stale/incomplete. It says `docker-compose exec omnistock-web npm run test:unit` covers “frontend auth/search/camera helpers” at `README.md:293`, but direct file evidence shows component tests for admin, users, profile, catalog, moderation, warehouse, documents, bulk, dashboard, inbox, audit, shell, and login pages in `apps/web/test/unit/*.test.ts`.
- Verification is scattered across multiple sections rather than one short “how to prove it works” sequence. Evidence: `README.md:36-50`, `README.md:80-108`, `README.md:211-219`, `README.md:289-296`.

## Low Priority Issues

- The README is long and feature-dense. For operators, startup and verification are not as front-loaded as they could be.
- The “Local bootstrap helper” section at `README.md:75-78` introduces a non-primary path that may distract readers even though it explicitly says Docker Compose remains the supported path.

## Engineering Quality

- Tech stack clarity: strong. Evidence: `README.md:7-26`, `README.md:253-257`.
- Architecture explanation: good enough for a README. It explains backend/frontend split, Docker topology, roles, security model, and scheduler/integration design.
- Testing instructions: strong and Docker-contained. Evidence: `README.md:259-296`.
- Security/roles: strong. Evidence: role descriptions `README.md:28-34`, credential table `README.md:56-62`, security sections `README.md:161-194`, encryption section `README.md:221-251`.
- Workflows: strong. Evidence: browser verification, scheduler verification, encryption verification, and feature notes.
- Presentation quality: good. It is readable, structured, and specific.

## Hard Gate Failures

- None.

## README Verdict

- **PASS**

## README Rationale

- The README satisfies the strict fullstack hard gates:
  - declares project type
  - documents Docker startup with `docker-compose up`
  - gives access URLs
  - provides verification guidance
  - keeps setup Docker-contained
  - includes demo credentials for all visible roles
- It is not perfect:
  - API verification should include a concrete command example.
  - Some testing documentation is less precise than the actual test suite.
