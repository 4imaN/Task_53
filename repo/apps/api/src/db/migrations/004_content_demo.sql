WITH admin_user AS (
  SELECT id FROM users WHERE username = 'admin'
), item AS (
  SELECT id FROM items WHERE sku = 'SKU-1001'
)
INSERT INTO reviews (item_id, user_id, rating, body, created_at)
SELECT item.id, admin_user.id, 5, 'Packaging held up well and the received case count matched the receiving sheet.', NOW() - INTERVAL '5 days'
FROM item, admin_user
ON CONFLICT (item_id, user_id) DO NOTHING;

WITH review AS (
  SELECT r.id, r.user_id FROM reviews r JOIN items i ON i.id = r.item_id WHERE i.sku = 'SKU-1001' AND r.user_id = (SELECT id FROM users WHERE username = 'admin')
)
INSERT INTO review_followups (parent_review_id, user_id, body, created_at)
SELECT review.id, review.user_id, 'Follow-up after 30 days: still performing as expected in storage and pick workflows.', NOW() - INTERVAL '2 days'
FROM review
WHERE NOT EXISTS (SELECT 1 FROM review_followups rf WHERE rf.parent_review_id = review.id);

WITH item AS (
  SELECT id FROM items WHERE sku = 'SKU-1001'
), admin_user AS (
  SELECT id FROM users WHERE username = 'admin'
)
INSERT INTO qa_threads (item_id, asked_by, question, created_at)
SELECT item.id, admin_user.id, 'Is the barcode printed on each inner pack?', NOW() - INTERVAL '1 day'
FROM item, admin_user
WHERE NOT EXISTS (SELECT 1 FROM qa_threads WHERE question = 'Is the barcode printed on each inner pack?');

WITH thread AS (
  SELECT id FROM qa_threads WHERE question = 'Is the barcode printed on each inner pack?'
), admin_user AS (
  SELECT id FROM users WHERE username = 'admin'
)
INSERT INTO qa_answers (thread_id, answered_by, body, is_catalog_editor_answer, created_at)
SELECT thread.id, admin_user.id, 'Only on the outer case; use local relabeling if each inner pack needs its own scan target.', TRUE, NOW() - INTERVAL '20 hours'
FROM thread, admin_user
WHERE NOT EXISTS (SELECT 1 FROM qa_answers WHERE thread_id = thread.id);

WITH admin_user AS (
  SELECT id FROM users WHERE username = 'admin'
), report_target AS (
  SELECT id FROM reviews LIMIT 1
)
INSERT INTO abuse_reports (reporter_id, target_type, target_id, reason, reporter_status, moderation_status, created_at)
SELECT admin_user.id, 'review', report_target.id, 'Possible off-topic attachment or misleading statement.', 'under_review', 'investigating', NOW() - INTERVAL '6 hours'
FROM admin_user, report_target
WHERE NOT EXISTS (SELECT 1 FROM abuse_reports WHERE reason = 'Possible off-topic attachment or misleading statement.');

WITH admin_user AS (
  SELECT id FROM users WHERE username = 'admin'
)
INSERT INTO notifications (user_id, notification_type, title, body, reference_type, created_at)
SELECT admin_user.id, 'abuse_report_status', 'Report under review', 'Your abuse report is currently under moderator review.', 'abuse_report', NOW() - INTERVAL '5 hours'
FROM admin_user
WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE title = 'Report under review');

UPDATE items i
SET average_rating = stats.avg_rating,
    rating_count = stats.rating_count,
    updated_at = NOW()
FROM (
  SELECT item_id, AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS rating_count
  FROM reviews
  GROUP BY item_id
) stats
WHERE stats.item_id = i.id;
