
• # OmniStock Design Notes (Updated)

  ## Runtime topology

  - `omnistock-frontend`: Nginx serving the Angular SPA and reverse-proxying `/api/*`
  - `omnistock-api`: Fastify service exposing local-network REST endpoints on the Docker bridge
  - `omnistock-db`: PostgreSQL with `pgcrypto` enabled

  ## Security model

  - Password policy: minimum 12 characters with upper/lower/digit/special requirements
  - Password history: previous hashes stored in `users.password_history`; candidate passwords are verified
  against prior Argon2id hashes
  - Lockout: 7 failed attempts triggers a 15-minute lock
  - CAPTCHA: local SVG challenge stored in `captcha_challenges`; required after 3 failed attempts
  - Sessions: persisted in `sessions`, idle timeout enforced server-side, revocable per session, and
  globally invalidated on auth-impacting admin changes
  - Authentication transport: protected APIs accept either `omnistock_session` cookie or `Authorization:
  Bearer <token>`
  - Authorization: role permissions combined with `attribute_rules` for warehouse and department scoping
  - Warehouse object-level scope is enforced on warehouse tree, bin timeline, bin toggle, document actions,
  and inventory/document ID paths
  - Catalog answer publishing is enforced server-side for `catalog_editor` and `administrator`
  - Review image download intent requires `images.export`; inline image rendering is separate from explicit
  export
  - Audit log: append-only table with update/delete blocked by trigger
  - Integrations: HMAC signature validation against encrypted client secrets stored in PostgreSQL, per-
  client minute rate limiting, timestamp freshness and replay rejection, department-isolated payload
  validation, and signed webhook delivery persistence
  - PostgreSQL encryption functions: `pgp_sym_encrypt_bytea` protects `integration_clients.hmac_secret`;
  `pgp_sym_encrypt` protects `users.phone_number` and `users.personal_email`
  - Decryption is server-side only and limited to operational read paths that need it; admin listings do
  not expose encrypted or decrypted secrets or contact fields

  ## Core schema coverage

  - access control: `users`, `roles`, `permissions`, `role_permissions`, `attribute_rules`, `sessions`
  - warehouse domain: `departments`, `warehouses`, `zones`, `bins`, `bin_change_timeline`
  - inventory domain: `items`, `barcodes`, `lots`, `inventory_positions`, `inventory_transactions`
  - workflow domain: `documents`, `document_workflows`, `archived_documents`
  - content domain: `reviews`, `review_followups`, `review_images`, `qa_threads`, `qa_answers`,
  `favorites`, `browsing_history`
  - moderation and notifications: `abuse_reports`, `notifications`
  - operations and integrations: `saved_views`, `batch_jobs`, `batch_job_results`, `operational_metrics`,
  `integration_clients`, `integration_request_replays`, `webhook_deliveries`
  - compliance: `audit_log`
  - scheduler: local API-side nightly execution at `02:00` server-local time with a run-once verification
  script

  ## Encrypted fields

  - `integration_clients.hmac_secret`
  - `users.phone_number`
  - `users.personal_email`

  The migration runner sets PostgreSQL session config `app.encryption_key` from `ENCRYPTION_KEY` so
  migrations can re-encrypt legacy rows using `pgcrypto`.

  ## API coverage implemented

  - auth and sessions
  - global search and saved views
  - warehouse hierarchy, scoped bin timeline, and bin toggling
  - inventory scan, receive, move, pick
  - document creation, workflow transitions, and execute-receiving/shipping/transfer
  - catalog content, favorites/history, review images, Q&A, and abuse reporting
  - moderation queue and inbox
  - integration ingress with HMAC verification, timestamp/replay checks, rate limiting, and department
  isolation
  - webhook dispatch with retries/backoff and persisted delivery outcomes
  - nightly operational metrics and archival jobs
  - metrics summary and health check

  ## Frontend coverage implemented

  The Angular app is a standalone-component shell with pages for:

  - actor-specific login routes:
    - `/login/administrator`
    - `/login/manager`
    - `/login/moderator`
    - `/login/catalog-editor`
    - `/login/warehouse-clerk`
  - `/login` redirects to `/login/warehouse-clerk`
  - role-specific workspaces for administrator, manager, moderator, catalog editor, and warehouse clerk
  - search workspace
  - inventory scan workspace
  - warehouse hierarchy
  - catalog content
  - moderation queue
  - bulk processing
  - administration, users, audit, and profile
  - inbox

  The frontend is API-backed for the main prompt flows and includes Playwright verification for login plus
  search/inventory/document/content navigation.