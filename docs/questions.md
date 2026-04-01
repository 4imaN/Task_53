# OmniStock — Business Logic Questions Log

This document records all ambiguities, gaps, and edge cases identified in the original Prompt that required interpretation or resolution before implementation.

---

## 1. Password History — Hashing Comparison

**Question:** The prompt says "password history of the last 5," but since passwords are hashed with Argon2id, how do we compare a new password against previous hashes? Argon2id uses unique salts per hash, so you cannot do a simple equality check — you must verify the candidate password against each of the 5 stored hashes individually.

**My Understanding:** We must store the last 5 password hashes in a JSONB array on the user record. When a user changes their password, we verify the new plaintext password against each of the 5 stored hashes using `argon2.verify()`. This is computationally heavier than a single hash check (5× verification), but it's the only correct approach with Argon2id.

**Solution:** Added a `password_history` JSONB column to the `users` table storing an ordered array of the last 5 Argon2id hashes. On password change, the service iterates all 5 entries with `argon2.verify(storedHash, newPlaintext)`. If any match, the change is rejected. On successful change, the oldest hash is shifted out and the current hash is pushed.

---

## 2. Account Lockout Reset Mechanism

**Question:** The prompt specifies "7 failed attempts → 15-minute lock," but does not specify whether the failed attempt counter resets after a successful login, or only after the 15-minute lockout expires. It also does not say whether an admin can manually unlock an account.

**My Understanding:** The counter should reset to 0 on any successful login. The 15-minute lock should auto-expire (time-based). Administrators should have the ability to manually unlock accounts, since this is an offline system with no self-service recovery path.

**Solution:** Implemented `failed_login_count` and `locked_until` columns on the `users` table. On successful login, `failed_login_count` resets to 0. On lockout expiry (current time > `locked_until`), the lock is automatically cleared on the next attempt. Added an admin-only `POST /api/users/:id/unlock` endpoint with audit log entry.

---

## 3. CAPTCHA Trigger Conditions

**Question:** The prompt says "CAPTCHA is generated and validated locally" but does not say *when* CAPTCHA is required. Is it on every login attempt? Only after some number of failures? On registration?

**My Understanding:** CAPTCHA should be triggered after a threshold of failed login attempts (e.g., 3 failures) to balance security with usability. Since there's no registration flow mentioned (users are created by admins), CAPTCHA only applies to login.

**Solution:** CAPTCHA is required on the login form after 3 consecutive failed attempts for a given username. The server tracks this per-username and includes a `captcha_required: true` flag in the `401` response body. The CAPTCHA is a locally generated SVG with distorted text, validated server-side with a short-lived token.

---

## 4. Session Rotation Semantics

**Question:** The prompt says "sessions are rotated and revocable." It's unclear whether "rotation" means the session token should be regenerated on every request, on every authentication-significant event, or at fixed time intervals.

**My Understanding:** Rotating on every request creates excessive overhead. Rotating on authentication-significant events (login, password change, privilege elevation) is the standard practice. Additionally, sessions should have a fixed maximum lifetime and an idle timeout.

**Solution:** Session tokens (JWTs) are rotated on: login, password change, and role/permission changes. Sessions have a 24-hour maximum lifetime and a 2-hour idle timeout. All sessions are stored server-side in the `sessions` table and can be revoked individually or in bulk.

---

## 5. "Saved Views Per User" — Scope and Sharing

**Question:** The prompt says the global search workspace supports "saved views per user." It does not specify whether saved views can be shared between users, or whether there's a limit on how many views a user can save.

**My Understanding:** "Per user" implies private to each user. No sharing mechanism was mentioned, so views are user-private. A reasonable cap (e.g., 50 saved views per user) prevents abuse without being restrictive.

**Solution:** `saved_views` table has a `user_id` foreign key with a unique constraint on `(user_id, view_name)`. Views are private. A server-side limit of 50 views per user is enforced. Views store the complete filter configuration as JSONB.

---

## 6. Bin Temperature Band and Dimensional Limit Enforcement

**Question:** The prompt mentions bins have "temperature band, max load in pounds, and dimensional limits in inches" as attributes, but does not say whether these are informational labels or actively enforced constraints. For example, should the system prevent placing a 500 lb pallet in a bin with a 300 lb max load?

**My Understanding:** These should be enforced constraints, not just labels. The system should validate item/lot placement against bin attributes and reject violations, since this is a warehouse management system where such enforcement is operationally critical.

**Solution:** When executing put-away or move operations, the system validates:
- Current bin load + item weight ≤ bin max load (lbs)
- Item dimensions fit within bin dimensional limits (inches)
- Item storage requirements match bin temperature band
Violations return a `422 Unprocessable Entity` with specific constraint details. Overrides are not permitted unless configured by an Administrator.

---

## 7. Bin Enable/Disable — Impact on Existing Inventory

**Question:** The prompt says users can "enable/disable bins with a visible change timeline." It does not specify what happens to inventory currently stored in a bin when it is disabled. Should the system prevent disabling occupied bins? Force a move? Allow disabling and just flag the items?

**My Understanding:** Disabling a bin with existing inventory should be allowed but with a warning. The disabled bin should prevent *new* placements, but existing inventory should remain visible and flagged for relocation. This is more practical than blocking the disable action entirely.

**Solution:** Disabling a bin:
1. Records the event in `bin_change_timeline` (immutable)
2. Writes to audit log
3. Sets `bin.is_active = false`
4. Prevents new put-away/move-to operations targeting this bin
5. Existing inventory displays with a "RELOCATION REQUIRED" flag in the UI
6. Generates a relocation task visible to assigned Clerks

---

## 8. Document Workflow State Machine

**Question:** The prompt mentions "document status" as a search filter and references "document workflows" and "completed documents older than 365 days" for archival, but doesn't define the specific document types or their state transitions.

**My Understanding:** Documents represent warehouse operational records (receiving documents, shipping documents, transfer documents, cycle count documents). Each document type follows a state machine: `draft → submitted → approved → in_progress → completed → archived`.

**Solution:** Implemented a generic document model with:
- Types: `receiving`, `shipping`, `transfer`, `cycle_count`, `adjustment`
- States: `draft`, `submitted`, `approved`, `in_progress`, `completed`, `cancelled`, `archived`
- State transitions enforced by a state machine service that validates allowed transitions per current state
- Only `completed` or `cancelled` documents are eligible for 365-day archival

---

## 9. Star Ratings — Scope and Aggregation

**Question:** The prompt says product content pages support "star ratings" but does not clarify: Can a user rate the same product multiple times? Is the rating 1–5 stars? Is there an aggregated rating displayed? Can ratings be edited after submission?

**My Understanding:** Standard e-commerce pattern: 1–5 star scale, one rating per user per item (can be updated), aggregated average displayed on item pages.

**Solution:** `reviews` table has a unique constraint on `(user_id, item_id)`. Rating scale is 1–5. The item's aggregated rating (average + count) is computed and cached, updated on review create/update/delete. Users can edit their own review (updates the existing record, generates a new audit log entry).

---

## 10. Follow-Up Reviews — Meaning and Structure

**Question:** The prompt mentions "follow-up reviews" as a feature, but does not define what a follow-up review is. Is it an update to an original review? A reply to someone else's review? A time-delayed second review of the same product?

**My Understanding:** A follow-up review is an amendment or update that the original reviewer adds after additional time using the product. Similar to Amazon's "Updated review" feature. It does not replace the original review but is appended as a linked entry.

**Solution:** `review_followups` table with a `parent_review_id` foreign key. Each user can add multiple follow-ups to their own review (but not to others' reviews). Follow-ups display chronologically below the original review. Each follow-up has its own timestamp but does not carry a separate star rating — the parent review's rating is the authoritative one unless the follow-up explicitly changes it.

---

## 11. Q&A Threads — Who Can Ask and Answer

**Question:** The prompt lists "Q&A threads" as a content feature but doesn't specify who can post questions and who can answer. Can any user ask a question? Can only Catalog Editors answer? Can the original asker mark an answer as accepted?

**My Understanding:** Any authenticated user can ask a question on an item. Catalog Editors are the primary answerers (as stated: "Catalog Editors who manage item details and respond to questions"). Other users can also answer, but Catalog Editor answers should be visually distinguished. The asker cannot mark accepted answers (this is a catalog QA context, not Stack Overflow).

**Solution:** Any user can create a question on an item's Q&A page. Any user can answer, but Catalog Editor answers display with a "Catalog Editor" badge. Questions are threaded (flat thread, not nested). Sorting: Catalog Editor answers appear first, then chronological. No "accepted answer" mechanism.

---

## 12. Abuse Report Flow — Case Status Granularity

**Question:** The prompt says "abuse report flow that informs the reporter of case status through an in-app inbox rather than email." But it does not specify what case statuses exist, or whether the reporter can view the specific resolution details.

**My Understanding:** Reporters should see a simplified status (not internal moderation details). Statuses visible to reporter: `submitted`, `under_review`, `resolved`, `dismissed`. Internal moderation statuses may be more granular.

**Solution:**
- Reporter-visible statuses: `submitted`, `under_review`, `resolved`, `dismissed`
- Internal moderation statuses: `new`, `assigned`, `investigating`, `action_taken`, `no_action`, `escalated`, `closed`
- Reporter inbox shows status changes with timestamps but no internal notes
- Moderator can add internal notes visible only to other moderators
- All status transitions written to audit log

---

## 13. Image Attachments — Storage Limits and Format Restrictions

**Question:** The prompt says reviews support "image attachments from local files" and that "files are stored on local disk with checksum verification," but doesn't specify maximum file sizes, allowed formats, maximum images per review, or total storage quotas.

**My Understanding:** Reasonable defaults should be set since this is an offline system with finite local storage: limit to common image formats, reasonable file size cap, and a per-review image limit.

**Solution:**
- Allowed formats: JPEG, PNG, WebP, GIF
- Maximum file size: 10 MB per image
- Maximum images per review: 5
- Total storage quota: configurable per-system (default: 50 GB) monitored by admin dashboard
- All uploads verified with SHA-256 checksum before storage
- Files stored in a Docker volume at `/data/uploads/` with organized subdirectories by entity type and date

---

## 14. Clerk Barcode Scanning — Keyboard Wedge vs. Camera UX

**Question:** The prompt says "Clerks can scan barcodes using a USB scanner (keyboard-wedge) or device camera input." For keyboard-wedge, the scanner typically "types" the barcode value followed by Enter. But the prompt doesn't specify whether the scan should happen anywhere on the page (global listener) or in a focused input field. For camera, it doesn't specify whether a dedicated scan mode/page is needed.

**My Understanding:** Keyboard-wedge should use a global key event listener when the search workspace or inventory pages are active — this is the "speed" optimization referenced in the prompt. Camera scanning should have a dedicated "Scan" button/mode that opens the camera view.

**Solution:**
- **Keyboard-wedge:** Global `keydown` listener captures rapid sequential character input and detects the final Enter key within a short time window (< 100ms between characters, typical of scanners). This triggers item/lot lookup immediately. Active on search and inventory pages.
- **Camera:** Dedicated scan button opens a camera view using `getUserMedia()` API with a barcode detection library (e.g., `@nickersoft/quickscan` or `quagga2`, both work offline). On successful decode, same item/lot lookup triggered.
- Both methods: "Jump directly to an item/lot record and execute allowed actions with immediate inline validation feedback."

---

## 15. Data Deletion Strategy — Physical vs. Logical Delete

**Question:** The prompt does not specify whether deleting entities (users, items, bins, etc.) should be a hard delete or soft delete. Given the audit trail and compliance requirements ("immutable audit log"), hard delete could break referential integrity for historical audit records.

**My Understanding:** Soft delete (logical delete) is the correct approach given the compliance and audit requirements of a warehouse management system. Hard deleting an item that appears in historical inventory transactions would break traceability.

**Solution:** All domain entities use soft delete via a `deleted_at` timestamp column. Soft-deleted records:
- Are excluded from normal queries (via a global query scope/WHERE clause)
- Remain visible in audit log references
- Remain visible in historical reports and archived documents
- Can be reactivated by an Administrator
- Are never physically purged (unless a future data retention policy is defined)

---

## 16. Integration API Scopes — "Cross-Department Data Leakage" Prevention

**Question:** The prompt says integration endpoints require "isolated API scopes to prevent cross-department data leakage." This implies a multi-department model, but the departmental structure isn't explicitly defined anywhere in the prompt.

**My Understanding:** "Departments" map to the organizational units the warehouse serves (e.g., different schools in a district). Each integration client is scoped to specific departments, meaning it can only access inventory/data belonging to those departments. This requires a `department` dimension on relevant entities.

**Solution:**
- Added a `departments` table and a `department_id` column on warehouses, items, and documents
- Each integration client (in `integration_clients` table) has an `allowed_departments` JSONB array
- API scope enforcement: integration routes filter all queries by the client's allowed departments
- This prevents School A's integration from accessing School B's inventory data
- Cross-department queries require an explicit "all departments" scope reserved for district-level integrations

---

## 17. Rate Limiting — Per-Client vs. Per-Endpoint

**Question:** The prompt specifies "per-client rate limits (e.g., 120 requests/minute)" but doesn't clarify whether this is a global per-client limit or per-endpoint per-client. Also unclear: does rate limiting apply only to integration endpoints, or also to regular user API access?

**My Understanding:** The "120 req/min" example explicitly refers to integration clients. Regular user traffic should have its own rate limits (higher, since interactive use generates more requests), but at a global per-IP level rather than per-client.

**Solution:**
- **Integration clients:** Per-client rate limit, configurable per client (default: 120 req/min, stored in `integration_clients` table). Applied globally across all endpoints the client accesses.
- **Regular users:** Per-IP rate limit of 600 req/min for normal API usage, with stricter limits on auth endpoints (20 req/min for login attempts).
- Rate limit state stored in memory (Fastify rate-limit plugin with local store), since there's only one API instance in the offline setup.

---

## 18. Browsing History — Scope and Retention

**Question:** The prompt lists "browsing history" as a product content feature but doesn't specify what is tracked (page views? item detail views? searches?), how long it's retained, or whether it's private to each user.

**My Understanding:** Browsing history tracks item detail page views, is private per user, and has a reasonable retention period. This is a catalog feature, not a warehouse operations feature.

**Solution:**
- `browsing_history` table tracks `(user_id, item_id, viewed_at)` — only item detail views
- Private per user, queryable only by the owning user
- Retained for 90 days, then automatically purged by the nightly scheduled job
- Maximum 1000 entries per user (FIFO rotation)
- Displays as a "Recently Viewed" section on the catalog/dashboard page

---

## 19. "Operational Metrics" — Definition of Specific KPIs

**Question:** The prompt lists three specific metrics — "put-away time, pick accuracy, review resolution SLA" — but doesn't define how they're measured. What constitutes put-away time (receiving to bin placement)? How is pick accuracy calculated? What is the SLA for review resolution?

**My Understanding:** These need reasonable operational definitions to be meaningful:
- **Put-away time:** Elapsed time from inventory receipt (receiving document completion) to bin placement (put-away transaction).
- **Pick accuracy:** Ratio of picks completed without error correction vs. total picks in a period.
- **Review resolution SLA:** Time from abuse report submission to moderator resolution. The SLA threshold itself should be configurable.

**Solution:**
- **Put-away time:** Calculated from `inventory_transaction` records. Measured as `put_away.timestamp - receiving_doc.completed_at` for each item. Nightly job computes average, median, P95 per warehouse.
- **Pick accuracy:** Computed as `(total_picks - picks_with_corrections) / total_picks * 100`. A "correction" is an adjustment transaction linked to an original pick.
- **Review resolution SLA:** Configurable threshold (default: 48 hours). Measured as `abuse_report.resolved_at - abuse_report.created_at`. Nightly job reports: total reports, within SLA, outside SLA, percentage.
- All metrics stored in `operational_metrics` table with `metric_type`, `value`, `period_start`, `period_end`, `warehouse_id`.

---

## 20. Favorites — What Can Be Favorited

**Question:** The prompt mentions "favorites" as a product content feature but doesn't specify what entities can be favorited: items only? Reviews? Q&A threads? Warehouses?

**My Understanding:** In the context of "product content pages," favorites apply to items/products. This is a standard catalog bookmarking feature.

**Solution:** `favorites` table with `(user_id, item_id, created_at)`. Users can favorite/unfavorite items. A "My Favorites" page lists all favorited items with quick navigation. Favorite count is not publicly displayed (this is a private utility feature, not a social signal).

---

## 21. RBAC Detail — Five Roles and Their Boundaries

**Question:** The prompt names five user types (Warehouse Clerk, Catalog Editor, Moderator, Manager, Administrator) but does not provide a complete permission matrix beyond a few scattered examples (Clerk can't export images, Clerk sees only assigned warehouses).

**My Understanding:** A reasonable permission matrix must be inferred from the role descriptions and the system's features. The key principle is least-privilege.

**Solution:** Defined the following permission matrix:

| Capability | Admin | Manager | Moderator | Catalog Editor | Clerk |
|---|---|---|---|---|---|
| User management | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Role/permission config | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| View all warehouses | ✅ | ✅ | ❌ | ❌ | ❌ (assigned only) |
| Warehouse/zone/bin CRUD | ✅ | ✅ | ❌ | ❌ | ❌ |
| Enable/disable bins | ✅ | ✅ | ❌ | ❌ | ❌ |
| Receive inventory | ✅ | ✅ | ❌ | ❌ | ✅ (assigned WH) |
| Move/pick inventory | ✅ | ✅ | ❌ | ❌ | ✅ (assigned WH) |
| Approve documents | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create documents | ✅ | ✅ | ❌ | ❌ | ✅ (assigned WH) |
| Edit item catalog details | ✅ | ❌ | ❌ | ✅ | ❌ |
| Manage Q&A answers | ✅ | ❌ | ❌ | ✅ | ❌ |
| Moderate content | ✅ | ❌ | ✅ | ❌ | ❌ |
| View moderation queue | ✅ | ❌ | ✅ | ❌ | ❌ |
| View metrics/dashboard | ✅ | ✅ | ❌ | ❌ | ❌ |
| Bulk import/export data | ✅ | ✅ | ❌ | ✅ (catalog only) | ❌ |
| Export content images | ✅ | ✅ | ❌ | ✅ | ❌ (explicitly denied) |
| Submit reviews/ratings | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit abuse reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| View audit log | ✅ | ✅ (read-only) | ❌ | ❌ | ❌ |
| Manage integrations | ✅ | ❌ | ❌ | ❌ | ❌ |
| View browsing history | Own only | Own only | Own only | Own only | Own only |
| Manage favorites | Own only | Own only | Own only | Own only | Own only |

---

## 22. "In-App Inbox" — Scope Beyond Abuse Reports

**Question:** The prompt specifically mentions an in-app inbox for abuse report status notifications. It's unclear whether this inbox should also serve as a general notification system for other events (e.g., document approvals, inventory alerts, role changes).

**My Understanding:** The prompt specifically ties the inbox to abuse report flows. Expanding it to a general notification system would add significant scope without being explicitly required. However, the data model should be flexible enough to support other notification types in the future.

**Solution:** Implemented a generic `notifications` table with `(user_id, notification_type, title, body, reference_type, reference_id, read_at, created_at)`. Currently only populated by the moderation service for abuse report status changes. The frontend inbox component renders all notification types generically, making it extensible without schema changes.

---

## 23. PostgreSQL Encryption — Which Fields Are "High-Risk"

**Question:** The prompt says "PostgreSQL encryption functions are used for high-risk fields" but does not define which fields are high-risk (beyond passwords, which use Argon2id separately).

**My Understanding:** High-risk fields in a warehouse/catalog context include: personal contact information (phone, address if stored), and potentially cost/pricing data for items if sensitive. Barcode data and inventory quantities are operational, not high-risk.

**Solution:** Using `pgcrypto` for symmetric encryption (`pgp_sym_encrypt`/`pgp_sym_decrypt`) on:
- `users.phone_number` (if collected)
- `users.personal_email` (if collected)
- `integration_clients.hmac_secret` (the shared secret itself)
- Encryption key stored as an environment variable, not in the database

---

## 24. Webhook Delivery Failure Handling

**Question:** The prompt mentions "optional webhooks delivered to internal URLs" but does not specify retry behavior, failure handling, or maximum retry attempts.

**My Understanding:** Standard webhook practices apply: retry with exponential backoff, limited max attempts, delivery status logging.

**Solution:**
- Retry strategy: 3 retries with exponential backoff (1 min, 5 min, 30 min)
- After max retries: mark delivery as `failed` in `webhook_deliveries` table
- No circuit breaker (simple offline network; failures likely indicate temporary service downtime)
- All delivery attempts logged with status, response code, and timestamp
- Admin can view webhook delivery history and manually re-trigger failed deliveries
