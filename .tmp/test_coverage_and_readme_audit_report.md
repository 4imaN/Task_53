# Test Coverage Audit

Project type declaration in `README.md` top section: missing.  
Inferred project type: `fullstack` from `README.md:1-24`, `docker-compose.yml`, `backend/`, and `frontend/`.

## Backend Endpoint Inventory

| Endpoint | Route evidence |
| --- | --- |
| `GET /api/health` | `backend/src/index.js:81` |
| `POST /api/auth/login` | `backend/src/routes/auth.js:31` |
| `POST /api/auth/logout` | `backend/src/routes/auth.js:93` |
| `POST /api/auth/verify-device` | `backend/src/routes/auth.js:101` |
| `GET /api/auth/me` | `backend/src/routes/auth.js:155` |
| `POST /api/auth/recovery-codes` | `backend/src/routes/auth.js:176` |
| `GET /api/users` | `backend/src/routes/users.js:21` |
| `POST /api/users` | `backend/src/routes/users.js:133` |
| `PATCH /api/users/:id` | `backend/src/routes/users.js:208` |
| `GET /api/users/:id/sessions` | `backend/src/routes/users.js:288` |
| `DELETE /api/users/:id/sessions/:sessionId` | `backend/src/routes/users.js:324` |
| `POST /api/users/:id/unlock` | `backend/src/routes/users.js:361` |
| `POST /api/users/:id/session-exception` | `backend/src/routes/users.js:414` |
| `POST /api/users/:id/reset-password` | `backend/src/routes/users.js:470` |
| `GET /api/users/:id/stations` | `backend/src/routes/users.js:523` |
| `PUT /api/users/:id/stations` | `backend/src/routes/users.js:536` |
| `POST /api/users/:id/generate-codes` | `backend/src/routes/users.js:582` |
| `GET /api/stations` | `backend/src/routes/stations.js:15` |
| `GET /api/stations/:id` | `backend/src/routes/stations.js:119` |
| `POST /api/stations` | `backend/src/routes/stations.js:158` |
| `PATCH /api/stations/:id` | `backend/src/routes/stations.js:214` |
| `GET /api/trainsets` | `backend/src/routes/trainsets.js:13` |
| `POST /api/trainsets` | `backend/src/routes/trainsets.js:32` |
| `PATCH /api/trainsets/:id` | `backend/src/routes/trainsets.js:77` |
| `GET /api/trips/search` | `backend/src/routes/trips.js:14` |
| `GET /api/trips/hot-searches` | `backend/src/routes/trips.js:217` |
| `GET /api/schedules` | `backend/src/routes/schedules.js:39` |
| `POST /api/schedules` | `backend/src/routes/schedules.js:92` |
| `PATCH /api/schedules/:id` | `backend/src/routes/schedules.js:247` |
| `GET /api/schedules/:id` | `backend/src/routes/schedules.js:336` |
| `GET /api/schedules/:id/versions` | `backend/src/routes/schedules.js:418` |
| `GET /api/schedules/:id/versions/:versionId` | `backend/src/routes/schedules.js:452` |
| `POST /api/schedules/:id/versions` | `backend/src/routes/schedules.js:511` |
| `PATCH /api/schedules/:id/versions/:versionId` | `backend/src/routes/schedules.js:669` |
| `POST /api/schedules/:id/versions/:versionId/stops` | `backend/src/routes/schedules.js:719` |
| `PATCH /api/schedules/:id/versions/:versionId/stops/:stopId` | `backend/src/routes/schedules.js:776` |
| `DELETE /api/schedules/:id/versions/:versionId/stops/:stopId` | `backend/src/routes/schedules.js:823` |
| `POST /api/schedules/:id/versions/:versionId/seat-classes` | `backend/src/routes/schedules.js:858` |
| `PATCH /api/schedules/:id/versions/:versionId/seat-classes/:classId` | `backend/src/routes/schedules.js:923` |
| `DELETE /api/schedules/:id/versions/:versionId/seat-classes/:classId` | `backend/src/routes/schedules.js:986` |
| `POST /api/schedules/:id/versions/:versionId/validate` | `backend/src/routes/schedules.js:1015` |
| `POST /api/schedules/:id/versions/:versionId/publish` | `backend/src/routes/schedules.js:1062` |
| `POST /api/schedules/:id/versions/:versionId/request-approval` | `backend/src/routes/schedules.js:1146` |
| `GET /api/schedules/:id/versions/compare` | `backend/src/routes/schedules.js:1235` |
| `POST /api/schedules/:id/rollback` | `backend/src/routes/schedules.js:1279` |
| `GET /api/approvals` | `backend/src/routes/approvals.js:16` |
| `POST /api/approvals/:id/approve` | `backend/src/routes/approvals.js:66` |
| `POST /api/approvals/:id/reject` | `backend/src/routes/approvals.js:172` |
| `GET /api/inventory/items` | `backend/src/routes/inventory.js:19` |
| `POST /api/inventory/items` | `backend/src/routes/inventory.js:116` |
| `PATCH /api/inventory/items/:id` | `backend/src/routes/inventory.js:226` |
| `GET /api/inventory/items/:id` | `backend/src/routes/inventory.js:301` |
| `GET /api/inventory/movements` | `backend/src/routes/inventory.js:345` |
| `POST /api/inventory/movements` | `backend/src/routes/inventory.js:428` |
| `GET /api/inventory/movements/:id` | `backend/src/routes/inventory.js:623` |
| `GET /api/inventory/stock-counts` | `backend/src/routes/inventory.js:673` |
| `POST /api/inventory/stock-counts` | `backend/src/routes/inventory.js:724` |
| `GET /api/inventory/stock-counts/:id` | `backend/src/routes/inventory.js:780` |
| `PATCH /api/inventory/stock-counts/:id` | `backend/src/routes/inventory.js:838` |
| `POST /api/inventory/stock-counts/:id/finalize` | `backend/src/routes/inventory.js:961` |
| `GET /api/inventory/alerts` | `backend/src/routes/inventory.js:1081` |
| `GET /api/backups` | `backend/src/routes/backups.js:28` |
| `POST /api/backups/run` | `backend/src/routes/backups.js:86` |
| `GET /api/backups/config` | `backend/src/routes/backups.js:334` |
| `PATCH /api/backups/config` | `backend/src/routes/backups.js:353` |
| `GET /api/restore-drills` | `backend/src/routes/backups.js:444` |
| `POST /api/restore-drills` | `backend/src/routes/backups.js:480` |
| `GET /api/restore-drills/:id` | `backend/src/routes/backups.js:747` |
| `GET /api/data-quality/issues` | `backend/src/routes/dataQuality.js:18` |
| `POST /api/data-quality/issues` | `backend/src/routes/dataQuality.js:70` |
| `PATCH /api/data-quality/issues/:id` | `backend/src/routes/dataQuality.js:136` |
| `GET /api/data-quality/reports` | `backend/src/routes/dataQuality.js:197` |
| `GET /api/data-quality/reports/:id` | `backend/src/routes/dataQuality.js:232` |
| `POST /api/data-quality/reports/generate` | `backend/src/routes/dataQuality.js:257` |
| `GET /api/audit/logs` | `backend/src/routes/audit.js:17` |
| `GET /api/audit/logs/:id` | `backend/src/routes/audit.js:80` |
| `GET /api/backtrack/diff` | `backend/src/routes/audit.js:110` |
| `GET /api/backtrack/replay` | `backend/src/routes/audit.js:156` |
| `POST /api/backtrack/corrective-actions` | `backend/src/routes/audit.js:204` |

Total endpoints: `79`

## API Test Mapping Table

| Endpoint | Covered | Test type | Test files | Evidence |
| --- | --- | --- | --- | --- |
| `GET /api/health` | yes | true no-mock HTTP | `API_tests/health.test.js` | `API_tests/health.test.js:4-13`; app route `backend/src/index.js:81` |
| `POST /api/auth/login` | yes | true no-mock HTTP | `API_tests/auth.test.js`, `API_tests/z_security.test.js`, `API_tests/session-cap.test.js` | `API_tests/auth.test.js:3-48`; `API_tests/z_security.test.js:64-103` |
| `POST /api/auth/logout` | yes | true no-mock HTTP | `API_tests/auth.test.js`, `API_tests/session-cap.test.js`, `API_tests/z_security.test.js` | `API_tests/auth.test.js:73-83`; `API_tests/session-cap.test.js:41,183`; `API_tests/z_security.test.js:771-772` |
| `POST /api/auth/verify-device` | yes | true no-mock HTTP | `API_tests/auth.test.js`, `API_tests/session-cap.test.js`, `API_tests/z_security.test.js` | `API_tests/auth.test.js:142-157`; `API_tests/session-cap.test.js:35,110`; `API_tests/z_security.test.js:272-288,656-673` |
| `GET /api/auth/me` | yes | true no-mock HTTP | `API_tests/auth.test.js`, `API_tests/session-cap.test.js`, `API_tests/z_security.test.js` | `API_tests/auth.test.js:53-91`; `API_tests/z_security.test.js:589,749-772` |
| `POST /api/auth/recovery-codes` | yes | true no-mock HTTP | `API_tests/auth.test.js` | `API_tests/auth.test.js:96-103` |
| `GET /api/users` | yes | true no-mock HTTP | `API_tests/users.test.js`, `API_tests/authorization.test.js`, `API_tests/session-cap.test.js`, `API_tests/z_security.test.js` | `API_tests/users.test.js:10-12`; `API_tests/authorization.test.js:12-65`; `API_tests/session-cap.test.js:238` |
| `POST /api/users` | yes | true no-mock HTTP | `API_tests/users.test.js`, `API_tests/auth.test.js`, `API_tests/session-cap.test.js`, `API_tests/z_security.test.js` | `API_tests/users.test.js:16-27`; `API_tests/auth.test.js:111,132`; `API_tests/z_security.test.js:97,113,127,151,183,572,596,622` |
| `PATCH /api/users/:id` | no | none | - | route only: `backend/src/routes/users.js:208` |
| `GET /api/users/:id/sessions` | yes | true no-mock HTTP | `API_tests/users.test.js`, `API_tests/session-cap.test.js` | `API_tests/users.test.js:31-34`; `API_tests/session-cap.test.js:134,216` |
| `DELETE /api/users/:id/sessions/:sessionId` | yes | true no-mock HTTP | `API_tests/session-cap.test.js` | `API_tests/session-cap.test.js:137` |
| `POST /api/users/:id/unlock` | no | none | - | route only: `backend/src/routes/users.js:361` |
| `POST /api/users/:id/session-exception` | yes | true no-mock HTTP | `API_tests/users.test.js`, `API_tests/session-cap.test.js` | `API_tests/users.test.js:54-58`; `API_tests/session-cap.test.js:128` |
| `POST /api/users/:id/reset-password` | no | none | - | route only: `backend/src/routes/users.js:470` |
| `GET /api/users/:id/stations` | yes | true no-mock HTTP | `API_tests/users.test.js` | `API_tests/users.test.js:37-40` |
| `PUT /api/users/:id/stations` | yes | true no-mock HTTP | `API_tests/users.test.js` | `API_tests/users.test.js:43-50` |
| `POST /api/users/:id/generate-codes` | yes | true no-mock HTTP | `API_tests/auth.test.js`, `API_tests/session-cap.test.js`, `API_tests/z_security.test.js` | `API_tests/auth.test.js:118`; `API_tests/session-cap.test.js:23`; `API_tests/z_security.test.js:118,132,159,577,601,629` |
| `GET /api/stations` | yes | true no-mock HTTP | `API_tests/stations.test.js`, `API_tests/authorization.test.js`, `API_tests/z_security.test.js` | `API_tests/stations.test.js:4-48`; `API_tests/authorization.test.js:102-151` |
| `GET /api/stations/:id` | yes | true no-mock HTTP | `API_tests/stations.test.js`, `API_tests/authorization.test.js`, `API_tests/z_security.test.js` | `API_tests/stations.test.js:44-50`; `API_tests/authorization.test.js:110-151` |
| `POST /api/stations` | yes | true no-mock HTTP | `API_tests/stations.test.js` | `API_tests/stations.test.js:54-62` |
| `PATCH /api/stations/:id` | no | none | - | route only: `backend/src/routes/stations.js:214` |
| `GET /api/trainsets` | yes | true no-mock HTTP | `API_tests/health.test.js` | `API_tests/health.test.js:22-31` |
| `POST /api/trainsets` | yes | true no-mock HTTP | `API_tests/z_security.test.js` | `API_tests/z_security.test.js:382` |
| `PATCH /api/trainsets/:id` | no | none | - | route only: `backend/src/routes/trainsets.js:77` |
| `GET /api/trips/search` | yes | true no-mock HTTP | `API_tests/trips.test.js` | `API_tests/trips.test.js:4-128` |
| `GET /api/trips/hot-searches` | yes | true no-mock HTTP | `API_tests/trips.test.js` | `API_tests/trips.test.js:87-97` |
| `GET /api/schedules` | yes | true no-mock HTTP | `API_tests/schedules.test.js`, `API_tests/authorization.test.js`, `API_tests/z_security.test.js` | `API_tests/schedules.test.js:11-24`; `API_tests/authorization.test.js:90`; `API_tests/z_security.test.js:198-199,610` |
| `POST /api/schedules` | yes | true no-mock HTTP | `API_tests/schedules.test.js`, `API_tests/authorization.test.js`, `API_tests/z_security.test.js` | `API_tests/schedules.test.js:48-72`; `API_tests/authorization.test.js:43-44,121,156,165`; `API_tests/z_security.test.js:308,392,454` |
| `PATCH /api/schedules/:id` | yes | true no-mock HTTP | `API_tests/schedules.test.js`, `API_tests/authorization.test.js` | `API_tests/schedules.test.js:135-161`; `API_tests/authorization.test.js:173` |
| `GET /api/schedules/:id` | yes | true no-mock HTTP | `API_tests/schedules.test.js`, `API_tests/authorization.test.js` | `API_tests/schedules.test.js:28-35`; `API_tests/authorization.test.js:125` |
| `GET /api/schedules/:id/versions` | yes | true no-mock HTTP | `API_tests/schedules.test.js`, `API_tests/z_security.test.js` | `API_tests/schedules.test.js:38-44`; `API_tests/z_security.test.js:407` |
| `GET /api/schedules/:id/versions/:versionId` | no | none | - | route only: `backend/src/routes/schedules.js:452` |
| `POST /api/schedules/:id/versions` | yes | true no-mock HTTP | `API_tests/z_security.test.js` | `API_tests/z_security.test.js:420,469` |
| `PATCH /api/schedules/:id/versions/:versionId` | no | none | - | route only: `backend/src/routes/schedules.js:669` |
| `POST /api/schedules/:id/versions/:versionId/stops` | no | none | - | route only: `backend/src/routes/schedules.js:719` |
| `PATCH /api/schedules/:id/versions/:versionId/stops/:stopId` | no | none | - | route only: `backend/src/routes/schedules.js:776` |
| `DELETE /api/schedules/:id/versions/:versionId/stops/:stopId` | no | none | - | route only: `backend/src/routes/schedules.js:823` |
| `POST /api/schedules/:id/versions/:versionId/seat-classes` | no | none | - | route only: `backend/src/routes/schedules.js:858` |
| `PATCH /api/schedules/:id/versions/:versionId/seat-classes/:classId` | no | none | - | route only: `backend/src/routes/schedules.js:923` |
| `DELETE /api/schedules/:id/versions/:versionId/seat-classes/:classId` | no | none | - | route only: `backend/src/routes/schedules.js:986` |
| `POST /api/schedules/:id/versions/:versionId/validate` | yes | true no-mock HTTP | `API_tests/schedules.test.js`, `API_tests/z_security.test.js` | `API_tests/schedules.test.js:76-84`; `API_tests/z_security.test.js:412,435` |
| `POST /api/schedules/:id/versions/:versionId/publish` | yes | true no-mock HTTP | `API_tests/z_security.test.js` | `API_tests/z_security.test.js:416` |
| `POST /api/schedules/:id/versions/:versionId/request-approval` | no | none | - | route only: `backend/src/routes/schedules.js:1146` |
| `GET /api/schedules/:id/versions/compare` | no | none | - | route only: `backend/src/routes/schedules.js:1235` |
| `POST /api/schedules/:id/rollback` | yes | true no-mock HTTP | `API_tests/schedules.test.js`, `API_tests/z_security.test.js` | `API_tests/schedules.test.js:95-126`; `API_tests/z_security.test.js:251-263` |
| `GET /api/approvals` | yes | true no-mock HTTP | `API_tests/authorization.test.js`, `API_tests/z_security.test.js` | `API_tests/authorization.test.js:17-18,69-70`; `API_tests/z_security.test.js:230-231` |
| `POST /api/approvals/:id/approve` | yes | true no-mock HTTP | `API_tests/z_security.test.js` | `API_tests/z_security.test.js:236-237` |
| `POST /api/approvals/:id/reject` | yes | true no-mock HTTP | `API_tests/z_security.test.js` | `API_tests/z_security.test.js:241-242` |
| `GET /api/inventory/items` | yes | true no-mock HTTP | `API_tests/inventory.test.js`, `API_tests/authorization.test.js`, `API_tests/z_security.test.js` | `API_tests/inventory.test.js:10-28`; `API_tests/z_security.test.js:29,52,613,726` |
| `POST /api/inventory/items` | yes | true no-mock HTTP | `API_tests/inventory.test.js` | `API_tests/inventory.test.js:32-47` |
| `PATCH /api/inventory/items/:id` | no | none | - | route only: `backend/src/routes/inventory.js:226` |
| `GET /api/inventory/items/:id` | no | none | - | route only: `backend/src/routes/inventory.js:301` |
| `GET /api/inventory/movements` | yes | true no-mock HTTP | `API_tests/inventory.test.js` | `API_tests/inventory.test.js:78-80` |
| `POST /api/inventory/movements` | yes | true no-mock HTTP | `API_tests/inventory.test.js` | `API_tests/inventory.test.js:51-72` |
| `GET /api/inventory/movements/:id` | no | none | - | route only: `backend/src/routes/inventory.js:623` |
| `GET /api/inventory/stock-counts` | yes | true no-mock HTTP | `API_tests/inventory.test.js`, `API_tests/z_security.test.js` | `API_tests/inventory.test.js:90-97`; `API_tests/z_security.test.js:21,45,718` |
| `POST /api/inventory/stock-counts` | yes | true no-mock HTTP | `API_tests/inventory.test.js`, `API_tests/z_security.test.js` | `API_tests/inventory.test.js:96-101`; `API_tests/z_security.test.js:16,42,209,715` |
| `GET /api/inventory/stock-counts/:id` | no | none | - | route only: `backend/src/routes/inventory.js:780` |
| `PATCH /api/inventory/stock-counts/:id` | yes | true no-mock HTTP | `API_tests/z_security.test.js` | `API_tests/z_security.test.js:35,57,732` |
| `POST /api/inventory/stock-counts/:id/finalize` | no | none | - | route only: `backend/src/routes/inventory.js:961` |
| `GET /api/inventory/alerts` | yes | true no-mock HTTP | `API_tests/inventory.test.js` | `API_tests/inventory.test.js:84-86` |
| `GET /api/backups` | yes | true no-mock HTTP | `API_tests/backups.test.js`, `API_tests/authorization.test.js`, `API_tests/z_security.test.js` | `API_tests/backups.test.js:12-16,72-84`; `API_tests/z_security.test.js:499-513` |
| `POST /api/backups/run` | yes | true no-mock HTTP | `API_tests/backups.test.js`, `API_tests/z_security.test.js` | `API_tests/backups.test.js:61-68`; `API_tests/z_security.test.js:489-495` |
| `GET /api/backups/config` | yes | true no-mock HTTP | `API_tests/backups.test.js` | `API_tests/backups.test.js:18-21` |
| `PATCH /api/backups/config` | yes | true no-mock HTTP | `API_tests/z_security.test.js` | `API_tests/z_security.test.js:536-554` |
| `GET /api/restore-drills` | yes | true no-mock HTTP | `API_tests/backups.test.js` | `API_tests/backups.test.js:24-25,87-90` |
| `POST /api/restore-drills` | no | none | - | route only: `backend/src/routes/backups.js:480` |
| `GET /api/restore-drills/:id` | no | none | - | route only: `backend/src/routes/backups.js:747` |
| `GET /api/data-quality/issues` | yes | true no-mock HTTP | `API_tests/backups.test.js`, `API_tests/authorization.test.js` | `API_tests/backups.test.js:30-32`; `API_tests/authorization.test.js:32-33,84-85` |
| `POST /api/data-quality/issues` | yes | true no-mock HTTP | `API_tests/backups.test.js` | `API_tests/backups.test.js:35-40` |
| `PATCH /api/data-quality/issues/:id` | no | none | - | route only: `backend/src/routes/dataQuality.js:136` |
| `GET /api/data-quality/reports` | yes | true no-mock HTTP | `API_tests/backups.test.js` | `API_tests/backups.test.js:43-45` |
| `GET /api/data-quality/reports/:id` | no | none | - | route only: `backend/src/routes/dataQuality.js:232` |
| `POST /api/data-quality/reports/generate` | no | none | - | route only: `backend/src/routes/dataQuality.js:257` |
| `GET /api/audit/logs` | yes | true no-mock HTTP | `API_tests/backups.test.js`, `API_tests/authorization.test.js`, `API_tests/z_security.test.js` | `API_tests/backups.test.js:49-56`; `API_tests/z_security.test.js:300,314,321` |
| `GET /api/audit/logs/:id` | no | none | - | route only: `backend/src/routes/audit.js:80` |
| `GET /api/backtrack/diff` | no | none | - | route only: `backend/src/routes/audit.js:110` |
| `GET /api/backtrack/replay` | no | none | - | route only: `backend/src/routes/audit.js:156` |
| `POST /api/backtrack/corrective-actions` | yes | true no-mock HTTP | `API_tests/z_security.test.js` | `API_tests/z_security.test.js:683-688` |

## Coverage Summary

- Total endpoints: `79`
- Endpoints with HTTP tests: `51`
- Endpoints with true no-mock HTTP tests: `51`
- HTTP coverage: `64.6%`
- True API coverage: `64.6%`

Uncovered endpoint clusters:

- User admin gaps: `PATCH /api/users/:id`, `POST /api/users/:id/unlock`, `POST /api/users/:id/reset-password`
- Station and trainset mutation gaps: `PATCH /api/stations/:id`, `PATCH /api/trainsets/:id`
- Schedule version-management gaps: `GET /api/schedules/:id/versions/:versionId`, `PATCH /api/schedules/:id/versions/:versionId`, all stop and seat-class mutation endpoints, `POST /api/schedules/:id/versions/:versionId/request-approval`, `GET /api/schedules/:id/versions/compare`
- Inventory detail/finalization gaps: `PATCH /api/inventory/items/:id`, `GET /api/inventory/items/:id`, `GET /api/inventory/movements/:id`, `GET /api/inventory/stock-counts/:id`, `POST /api/inventory/stock-counts/:id/finalize`
- Backup / restore drill gaps: `POST /api/restore-drills`, `GET /api/restore-drills/:id`
- Data-quality gaps: `PATCH /api/data-quality/issues/:id`, `GET /api/data-quality/reports/:id`, `POST /api/data-quality/reports/generate`
- Audit / backtracking gaps: `GET /api/audit/logs/:id`, `GET /api/backtrack/diff`, `GET /api/backtrack/replay`

## Unit Test Summary

### Backend Unit Tests

Backend unit test files:

- `unit_tests/auth.test.js`
- `unit_tests/sessionLifecycle.test.js`
- `unit_tests/fuzzyMatch.test.js`
- `unit_tests/validators.test.js`
- `unit_tests/masks.test.js`
- `unit_tests/backupPath.test.js`

Modules covered:

- Controllers: none directly
- Services: none directly
- Repositories: none directly
- Auth/guards/middleware:
  - `backend/src/middleware/auth` via `unit_tests/auth.test.js:31-88`
  - `resolveSession` in `backend/src/middleware/auth` via `unit_tests/sessionLifecycle.test.js:32-131`
- Utilities:
  - `backend/src/utils/fuzzyMatch` via `unit_tests/fuzzyMatch.test.js`
  - `backend/src/utils/validators` via `unit_tests/validators.test.js`
  - `backend/src/utils/masks` via `unit_tests/masks.test.js`
  - `backend/src/utils/backupPath` via `unit_tests/backupPath.test.js`

Important backend modules not tested:

- Route handlers across `backend/src/routes/*.js` beyond indirect HTTP exercise
- `backend/src/services/authService.js`
- `backend/src/services/auditService.js`
- `backend/src/services/backupScheduler.js`
- `backend/src/services/dqScheduler.js`
- `backend/src/middleware/rateLimiter.js`
- `backend/src/middleware/scopeFilter.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/utils/crypto.js`
- Database migration/seed logic in `backend/src/database/migrate.js` and `backend/src/database/seed.js`

### Frontend Unit Tests

Frontend unit tests: PRESENT

Frontend test files:

- `frontend/src/__tests__/router.test.js`
- `frontend/src/__tests__/utils/cache.test.js`
- `frontend/src/__tests__/stores/auth.test.js`
- `frontend/src/__tests__/stores/inventory.test.js`
- `frontend/src/__tests__/stores/schedules.test.js`
- `frontend/src/__tests__/stores/search.test.js`
- `frontend/src/__tests__/components/AlertBanner.test.js`
- `frontend/src/__tests__/components/StatusBadge.test.js`
- `frontend/src/__tests__/components/StationAutocomplete.test.js`
- `frontend/src/__tests__/views/ApprovalList.test.js`
- `frontend/src/__tests__/views/BackupDashboard.test.js`
- `frontend/src/__tests__/views/DataQuality.test.js`
- `frontend/src/__tests__/views/InventoryDashboard.test.js`
- `frontend/src/__tests__/views/ItemList.test.js`
- `frontend/src/__tests__/views/MovementList.test.js`
- `frontend/src/__tests__/views/PublishWorkflow.test.js`
- `frontend/src/__tests__/views/ScheduleDetail.test.js`
- `frontend/src/__tests__/views/ScheduleEditor.test.js`
- `frontend/src/__tests__/views/StockCountList.test.js`
- `frontend/src/__tests__/views/TripSearch.test.js`

Frameworks/tools detected:

- `Vitest` from `frontend/package.json:16-22` and `frontend/vitest.config.js`
- `@vue/test-utils` from `frontend/package.json:16-22`
- `jsdom` from `frontend/package.json:16-22`

Frontend modules/components covered:

- Router: `frontend/src/router/index.js` via `frontend/src/__tests__/router.test.js`
- Stores: `auth`, `inventory`, `schedules`, `search`
- Components: `AlertBanner`, `StatusBadge`, `StationAutocomplete`
- Views: `ApprovalList`, `BackupDashboard`, `DataQuality`, `InventoryDashboard`, `ItemList`, `MovementList`, `ScheduleDetail`, `ScheduleEditor`, `StockCountList`, `TripSearch`
- Utility: `frontend/src/utils/cache.js`

Important frontend components/modules not tested:

- `frontend/src/App.vue`
- `frontend/src/main.js`
- `frontend/src/utils/api.js`
- `frontend/src/utils/deviceFingerprint.js`
- `frontend/src/components/VersionCompare.vue`
- `frontend/src/views/LoginPage.vue`
- `frontend/src/views/ScheduleList.vue`
- `frontend/src/views/UserManagement.vue`
- `frontend/src/views/AuditLog.vue`

Cross-layer observation:

- Backend HTTP coverage is materially broader than frontend-to-backend verification.
- Frontend tests are present, but the view/store tests are mostly isolated with `vi.mock('../../utils/api.js', ...)`, so they do not validate frontend ↔ backend integration.
- Fullstack end-to-end coverage is missing. For a `fullstack` project, that is a major test-design gap even though frontend unit tests exist.

## API Test Classification

### 1. True No-Mock HTTP

- All `API_tests/*.test.js` files.
- Evidence:
  - HTTP client helper uses Node `http`/`https` directly in `API_tests/setup.js:1-45`.
  - Auth/session helpers still call real endpoints in `API_tests/setup.js:47-82`.
  - No `jest.mock`, `vi.mock`, or DI override usage found under `API_tests/`.

### 2. HTTP with Mocking

- None found in `API_tests/`.

### 3. Non-HTTP (unit/integration without HTTP)

- All `unit_tests/*.test.js`
- All `frontend/src/__tests__/*.test.js` and nested test files

## Mock Detection Rules

Mocks/stubs detected:

- Database mocked in backend unit tests:
  - `unit_tests/auth.test.js:7` mocks `../backend/src/database/connection`
  - `unit_tests/sessionLifecycle.test.js:6` mocks `../backend/src/database/connection`
- Frontend API mocked:
  - `frontend/src/__tests__/views/ScheduleEditor.test.js:6`
  - `frontend/src/__tests__/views/ApprovalList.test.js:5`
  - `frontend/src/__tests__/views/BackupDashboard.test.js:5`
  - `frontend/src/__tests__/views/DataQuality.test.js:5`
  - `frontend/src/__tests__/views/TripSearch.test.js:5`
  - `frontend/src/__tests__/views/MovementList.test.js:5`
  - `frontend/src/__tests__/views/ItemList.test.js:5`
  - `frontend/src/__tests__/views/ScheduleDetail.test.js:6`
  - `frontend/src/__tests__/views/PublishWorkflow.test.js:10`
  - `frontend/src/__tests__/views/StockCountList.test.js:5`
  - `frontend/src/__tests__/stores/auth.test.js:6`
  - `frontend/src/__tests__/stores/inventory.test.js:5`
  - `frontend/src/__tests__/stores/schedules.test.js:5`
  - `frontend/src/__tests__/stores/search.test.js:6`
  - `frontend/src/__tests__/components/StationAutocomplete.test.js:5`
- Additional frontend mocks:
  - `frontend/src/__tests__/stores/auth.test.js:17` mocks `deviceFingerprint`
  - `frontend/src/__tests__/stores/auth.test.js:22` mocks `cache`
  - `frontend/src/__tests__/stores/search.test.js:14` and `frontend/src/__tests__/views/TripSearch.test.js:12` mock `cache`
  - `frontend/src/__tests__/router.test.js:4` mocks the auth store

Interpretation:

- These mocks make the frontend suite unit-level and component-level, not real API coverage.
- They do not reduce the classification of `API_tests/*.test.js`, which remain true no-mock HTTP by static evidence.

## API Observability Check

Assessment: `moderate`

Strong:

- Most API tests name the exact route in the test title, for example `API_tests/schedules.test.js:11,28,38,48,76,135`.
- Many tests show request bodies and assert response status plus selected payload fields, for example:
  - `API_tests/auth.test.js:5-13`
  - `API_tests/trips.test.js:5-20`
  - `API_tests/users.test.js:16-24`

Weak:

- Several endpoints are only asserted on status or top-level `success`, with limited response-shape verification:
  - `API_tests/backups.test.js:12-25`
  - `API_tests/inventory.test.js:78-97`
  - `API_tests/authorization.test.js:12-85`
- Some mutation tests are existence-only and do not verify post-state deeply, for example `API_tests/z_security.test.js:382,416,688`.

## Tests Check

- Success paths: present across auth, trips, schedules, inventory, backups, approvals, and users
- Failure cases: present and strong for auth, validation, authorization, lockout, backup path validation
- Edge cases: present for date boundaries, session caps, pending verification, lockout duplication, station-scope isolation
- Validation: present but uneven; many endpoint-specific validation branches remain untested
- Auth/permissions: strong on covered endpoints
- Integration boundaries: backend HTTP layer is exercised for covered endpoints; frontend ↔ backend integration is not
- Assertion depth: mixed; some tests check schema fragments, many only check status or `success`
- Autogenerated/shallow signal: not obviously autogenerated, but coverage is incomplete and clustered

`run_tests.sh` assessment:

- `run_tests.sh` is not Docker-based.
- It performs local dependency installs with `npm install` in three places: `run_tests.sh:13-15`, `run_tests.sh:50-52`, `run_tests.sh:72-74`.
- Verdict under the prompt rule: `FLAG`

## End-to-End Expectations

- Project type is `fullstack`.
- Expected: real FE ↔ BE tests.
- Found: no frontend-to-backend end-to-end tests. Frontend tests use mocked API modules; backend tests call the backend directly.
- Partial compensation exists through strong no-mock API coverage on covered routes plus frontend unit tests, but it does not close the fullstack integration gap.

## Test Coverage Score (0–100)

`57/100`

## Score Rationale

- Positive:
  - Real HTTP tests are present and clearly no-mock for covered endpoints.
  - Security- and auth-related scenarios are tested with meaningful negative cases.
  - Frontend unit tests are directly evidenced and use a valid Vue/Vitest stack.
- Negative:
  - Only `51/79` endpoints have any HTTP coverage.
  - Large untested clusters exist in schedule version mutation, inventory detail/finalization, data-quality maintenance, audit backtracking, restore drills, and user admin flows.
  - Frontend tests are mock-heavy and provide no FE ↔ BE runtime confidence.
  - `run_tests.sh` depends on local installs, violating the preferred containerized test execution expectation in this audit.

## Key Gaps

- Critical: No tests for `POST /api/schedules/:id/versions/:versionId/request-approval`, `GET /api/schedules/:id/versions/compare`, and all stop/seat-class version mutation endpoints despite those being central workflow routes.
- Critical: No tests for `POST /api/inventory/stock-counts/:id/finalize` and no detail-route coverage for `GET /api/inventory/items/:id`, `GET /api/inventory/movements/:id`, or `GET /api/inventory/stock-counts/:id`.
- High: No coverage for audit detail/backtracking reads: `GET /api/audit/logs/:id`, `GET /api/backtrack/diff`, `GET /api/backtrack/replay`.
- High: No coverage for restore-drill creation/detail and data-quality patch/report generation endpoints.
- High: Fullstack integration tests are absent; frontend coverage is isolated behind mocks.

## Confidence & Assumptions

- Confidence: `high`
- Assumptions:
  - Only statically visible routes in `backend/src/index.js` and `backend/src/routes/*.js` are in scope.
  - A request that receives `401` or `403` on a real route still counts as endpoint coverage because the exact `METHOD + PATH` reaches the live Koa route/middleware chain.
  - No hidden routes exist outside the inspected files.

# README Audit

README location check: `README.md` exists at repo root.

## Hard Gate Failures

- Project type is not explicitly declared at the top as one of `backend`, `fullstack`, `web`, `android`, `ios`, `desktop`. Inferred `fullstack` instead. Evidence: `README.md:1-24`.
- Environment rules violated. README requires non-Docker runtime prerequisites and local runtime installs:
  - `README.md:27-28` lists `Node.js 18+` and `OpenSSL`
  - `README.md:54-91` documents manual non-Docker setup
  - `README.md:66`, `README.md:75`, `README.md:88` include `npm install`
- Demo credentials incomplete for an authenticated system. README defines roles `Guest`, `Host`, `Platform Operations` at `README.md:17-23`, but credentials only cover `admin` and `host1` at `README.md:94-100`. Guest handling is not explicitly documented.

## High Priority Issues

- README violates the strict Docker-contained environment rule by documenting a full manual setup path with local package installation and direct `node` execution. Evidence: `README.md:54-91`.
- The top of the README does not declare project type in the required canonical form. Strict-mode fallback inference was required. Evidence: `README.md:1`.
- Full authentication coverage is not documented. There is no explicit credential or "no authentication required" statement for the Guest role despite Guest being a declared role. Evidence: `README.md:17-23`, `README.md:94-100`.

## Medium Priority Issues

- Prerequisites still signal a local-tooling dependency model instead of a fully Docker-contained model. Evidence: `README.md:27-28`.
- Testing instructions also include direct local test commands using `npx` per package rather than a Docker-contained verification path only. Evidence: `README.md:141-167`.
- README overstates verification flows that depend on runtime/manual checks, but does at least separate many of them under "Runtime Verification Requirements". Evidence: `README.md:169-219`.

## Low Priority Issues

- Presentation and structure are generally readable and technically organized.
- Tech stack, roles, scripts, and access URLs are clearly documented.
- Verification guidance is better than average because the README includes explicit URLs and an HTTPS verification checklist.

## Engineering Quality

- Tech stack clarity: good. Evidence: `README.md:5-14`
- Architecture explanation: adequate. Evidence: `README.md:5-14`, `README.md:221+`
- Testing instructions: present, but not compliant with strict environment rules. Evidence: `README.md:141-167`
- Security/roles: roles are explained, TLS expectations are documented, but credential coverage is incomplete. Evidence: `README.md:17-23`, `README.md:169-183`
- Workflows: backup, HTTPS verification, and runtime verification are documented. Evidence: `README.md:117-139`, `README.md:169-219`
- Presentation quality: good markdown readability overall

## README Verdict

`FAIL`

Rationale:

- Startup instructions hard gate: pass for `docker-compose up` because `README.md:44` includes `docker-compose up --build`.
- Access method hard gate: pass because URLs and ports are explicit at `README.md:49-51`.
- Verification method hard gate: pass because there are concrete verification steps at `README.md:169-219`.
- Environment rules hard gate: fail because the README explicitly permits manual installs and non-Docker operation.
- Demo credentials hard gate: fail because auth exists and credentials are not documented for all declared roles.

