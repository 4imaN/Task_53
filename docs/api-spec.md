# OmniStock API

Base path: `/api`

Protected routes require the local OmniStock session token returned by `POST /auth/login`.

## Health

- `GET /health`

## Authentication

- `GET /auth/login-hints?username=...`
- `GET /auth/captcha?username=...`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/sessions`
- `POST /auth/sessions/:sessionId/revoke`
- `POST /auth/change-password`
- `GET /auth/me`

## Search

- `GET /search`
  - combined filters:
    - `item`
    - `lot`
    - `warehouseId`
    - `documentStatus`
    - `dateFrom`
    - `dateTo`
  - sorting:
    - `sortBy`: `itemName`, `sku`, `warehouse`, `lot`, `documentStatus`, `updatedAt`
    - `sortDir`: `asc`, `desc`
  - pagination:
    - `page`
    - `pageSize`
  - document filters are applied to the document actually linked to the item/lot/warehouse transaction row, not to every document in the same warehouse
- `GET /search/views`
- `POST /search/views`

## Warehouse setup and visibility

- `GET /warehouses`
- `GET /warehouse-setup/options`
- `POST /warehouses`
- `PATCH /warehouses/:warehouseId`
- `POST /warehouses/:warehouseId/zones`
- `PATCH /zones/:zoneId`
- `POST /zones/:zoneId/bins`
- `PATCH /bins/:binId`
- `GET /warehouses/:warehouseId/tree`
- `GET /bins/:binId/timeline`
- `POST /bins/:binId/toggle`

## Inventory

- `POST /inventory/scan`
- `POST /inventory/receive`
- `POST /inventory/move`
- `POST /inventory/pick`

## Documents

- `GET /documents`
- `POST /documents`
- `GET /documents/:documentId`
- `POST /documents/:documentId/transition`
- `POST /documents/:documentId/execute-receiving`
- `POST /documents/:documentId/execute-shipping`
- `POST /documents/:documentId/execute-transfer`

## Catalog

- `GET /catalog/items`
- `GET /catalog/items/:itemId`
- `PATCH /catalog/items/:itemId`
  - requires `catalog.manage`
- `GET /catalog/favorites`
- `GET /catalog/history`
- `POST /catalog/items/:itemId/favorite`
- `POST /catalog/items/:itemId/reviews`
- `POST /catalog/reviews/:reviewId/followups`
- `POST /catalog/reviews/:reviewId/images`
- `GET /catalog/review-images/:imageId/content`
  - supports `?download=true`
  - explicit downloads require `images.export`
  - explicit downloads are audit-logged
- `POST /catalog/items/:itemId/questions`
- `POST /catalog/questions/:questionId/answers`
  - requires `catalog.manage` or administrator access on the server side

## Moderation and inbox

- `POST /moderation/reports`
- `GET /moderation/queue`
- `POST /moderation/reports/:reportId/status`
- `GET /inbox`
- `POST /inbox/:notificationId/read`
- `POST /inbox/read-all`

## Administration

- `GET /users`
- `POST /users`
- `PATCH /users/:userId`
- `PUT /users/:userId/access-control`
- `POST /users/:userId/unlock`
- `GET /access-control/options`
- `GET /audit-log`
- `GET /integration-clients`
- `POST /integration-clients`
  - `webhookUrl` must target an internal network host only

## Integrations

- `POST /integrations/inventory-sync`

Required headers:

- `x-omnistock-client`
- `x-omnistock-timestamp`
- `x-omnistock-signature`

Integration security behavior:

- HMAC signature must match the canonical payload `timestamp.body`
- `x-omnistock-timestamp` must be within the allowed server clock-skew window
- replay keys are stored per client with TTL; stale or replayed requests are rejected
- client must have `inventory:write` scope
- per-client rate limits are enforced from `integration_clients.rate_limit_per_minute`
- payload department scope must stay within `integration_clients.allowed_departments`

Webhook behavior:

- integration clients can configure `webhookUrl` through `POST /integration-clients`
- only internal-network targets are accepted:
  - private IPv4 ranges
  - loopback / localhost
  - internal single-label hostnames
  - `.local`, `.internal`, `.lan` hostnames
  - internal IPv6 loopback / ULA / link-local ranges
- successful inventory sync requests dispatch signed webhook deliveries when `webhookUrl` is configured
- delivery outcomes are persisted in `webhook_deliveries`
- retry / backoff behavior remains enabled

## Bulk catalog processing

- `GET /bulk/templates/catalog-items`
- `POST /bulk/catalog-items/precheck`
- `POST /bulk/catalog-items/import`
- `GET /bulk/catalog-items/export`
- `GET /bulk/jobs`
- `GET /bulk/jobs/:jobId/results`

## Metrics

- `GET /metrics/summary`

## Scheduled operations

The API process runs nightly jobs at `02:00` server-local time and also exposes a manual verification path:

- `npm run jobs:run-once`
