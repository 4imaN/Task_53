# OmniStock API (Current)

  Base path: `/api`

  Protected routes require authentication via either:
  - `omnistock_session` HTTP-only cookie (set by login), or
  - `Authorization: Bearer <token>`

  `POST /auth/login` returns `{ token, user }` and also sets `omnistock_session`.

  ## Health
  - `GET /health`

  ## Authentication
  - `GET /auth/login-hints?username=...`
  - `GET /auth/captcha?username=...`
  - `POST /auth/login`
    - supports optional `loginActor`:
      - `administrator`
      - `manager`
      - `moderator`
      - `catalog-editor`
      - `warehouse-clerk`
    - actor/role mismatch is rejected server-side
  - `POST /auth/logout`
  - `GET /auth/sessions`
  - `POST /auth/sessions/:sessionId/revoke`
  - `POST /auth/change-password`
  - `GET /auth/me`

  ## Search
  - `GET /search`
    - filters: `item`, `lot`, `warehouseId`, `documentStatus`, `dateFrom`, `dateTo`
    - sorting:
      - `sortBy`: `itemName`, `sku`, `warehouse`, `lot`, `documentStatus`, `updatedAt`
      - `sortDir`: `asc`, `desc`
    - pagination: `page`, `pageSize`
    - document filters are applied through the linked document relation (`inventory_transactions ->
  documents`), not warehouse-wide fanout
  - `GET /search/views`
  - `POST /search/views`

  ## Warehouse Setup
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
  - quantity validation is enforced: must be `> 0`

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
    - explicit download requires `images.export`
    - explicit download is audit-logged
    - checksum integrity is verified before serving
  - `POST /catalog/items/:itemId/questions`
  - `POST /catalog/questions/:questionId/answers`
    - enforced by role on server: only `catalog_editor` or `administrator`

  ## Moderation and Inbox
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
    - `webhookUrl` must be internal-network only
  - no admin update/delete integration-client endpoint is currently exposed

  ## Integrations
  - `POST /integrations/inventory-sync`

  Required headers:
  - `x-omnistock-client`
  - `x-omnistock-timestamp`
  - `x-omnistock-signature`

  Optional but recommended:
  - `x-omnistock-nonce`

  Security behavior:
  - signature must match canonical payload: `${timestamp}.${JSON.stringify(body || {})}`
  - timestamp freshness window is enforced
  - replay detection is enforced per client with TTL-backed keys
  - client must include scope `inventory:write`
  - per-client rate limits enforced from `integration_clients.rate_limit_per_minute`
  - payload department scope must be within `integration_clients.allowed_departments`

  ## Webhook Behavior
  - configured via `POST /integration-clients` (`webhookUrl`)
  - internal-only target validation:
    - private IPv4
    - loopback / localhost
    - internal single-label hostnames
    - `.local`, `.internal`, `.lan`
    - IPv6 loopback / ULA / link-local
  - signed webhook deliveries are attempted on accepted sync events
  - retries/backoff are enabled
  - outcomes are persisted in `webhook_deliveries`

  ## Bulk Catalog
  - `GET /bulk/templates/catalog-items`
  - `POST /bulk/catalog-items/precheck`
  - `POST /bulk/catalog-items/import`
  - `GET /bulk/catalog-items/export`
  - `GET /bulk/jobs`
  - `GET /bulk/jobs/:jobId/results`

  ## Metrics
  - `GET /metrics/summary`

  ## Scheduled Operations
  Nightly jobs run at `02:00` server-local time in-process.

  Manual run:
  - `cd apps/api && npm run jobs:run-once`