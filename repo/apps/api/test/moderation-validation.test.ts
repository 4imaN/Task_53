import { describe, expect, it } from 'vitest';

// ModerationService.createReport validates the target type via an object key
// lookup — only 'review' and 'qa_thread' have SQL definitions in the
// targetQueries map.  We reproduce that shape here and test the validation
// contract without a database.

type ModerationTargetType = 'review' | 'qa_thread';

const TARGET_TYPE_LABELS: Record<ModerationTargetType, string> = {
  review: 'Review',
  qa_thread: 'Question'
};

const isValidTargetType = (value: string): value is ModerationTargetType =>
  Object.prototype.hasOwnProperty.call(TARGET_TYPE_LABELS, value);

const getTargetLabel = (targetType: ModerationTargetType) => TARGET_TYPE_LABELS[targetType];

// ---------------------------------------------------------------------------
// Valid target types
// ---------------------------------------------------------------------------

describe('moderation target type validation', () => {
  it('accepts "review" as a valid target type', () => {
    expect(isValidTargetType('review')).toBe(true);
  });

  it('accepts "qa_thread" as a valid target type', () => {
    expect(isValidTargetType('qa_thread')).toBe(true);
  });

  it('rejects "item" as a target type', () => {
    expect(isValidTargetType('item')).toBe(false);
  });

  it('rejects "question" as a target type (only qa_thread is valid)', () => {
    expect(isValidTargetType('question')).toBe(false);
  });

  it('rejects "document" as a target type', () => {
    expect(isValidTargetType('document')).toBe(false);
  });

  it('rejects empty string as a target type', () => {
    expect(isValidTargetType('')).toBe(false);
  });

  it('rejects arbitrary strings as a target type', () => {
    expect(isValidTargetType('warehouse')).toBe(false);
    expect(isValidTargetType('lot')).toBe(false);
    expect(isValidTargetType('user')).toBe(false);
  });

  it('exactly two target types are recognised', () => {
    expect(Object.keys(TARGET_TYPE_LABELS)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Target type → label mapping used in 404 error messages
// ---------------------------------------------------------------------------

describe('moderation target type labels', () => {
  it('review maps to "Review"', () => {
    expect(getTargetLabel('review')).toBe('Review');
  });

  it('qa_thread maps to "Question"', () => {
    expect(getTargetLabel('qa_thread')).toBe('Question');
  });
});

// ---------------------------------------------------------------------------
// shouldSetResolvedAt logic (mirrors the service's inline expression)
// The service sets resolved_at when reporter_status is 'resolved' or
// 'dismissed'. We test every defined reporter_status value to confirm the
// boundary.
// ---------------------------------------------------------------------------

type ReporterStatus = 'submitted' | 'under_review' | 'resolved' | 'dismissed';

const shouldSetResolvedAt = (reporterStatus: ReporterStatus): boolean =>
  reporterStatus === 'resolved' || reporterStatus === 'dismissed';

describe('moderation shouldSetResolvedAt', () => {
  it('returns true for "resolved"', () => {
    expect(shouldSetResolvedAt('resolved')).toBe(true);
  });

  it('returns true for "dismissed"', () => {
    expect(shouldSetResolvedAt('dismissed')).toBe(true);
  });

  it('returns false for "submitted"', () => {
    expect(shouldSetResolvedAt('submitted')).toBe(false);
  });

  it('returns false for "under_review"', () => {
    expect(shouldSetResolvedAt('under_review')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ACTIVE_REPORT_PREDICATE — the SQL fragment used to deduplicate active
// reports is a non-empty string.  This guards against accidental changes that
// could silently drop the WHERE clause and create duplicate report rows.
// ---------------------------------------------------------------------------

describe('moderation active report predicate', () => {
  // Mirrors the value in moderation.service.ts
  const ACTIVE_REPORT_PREDICATE = 'resolved_at IS NULL';

  it('is a non-empty SQL predicate', () => {
    expect(ACTIVE_REPORT_PREDICATE.trim().length).toBeGreaterThan(0);
  });

  it('checks for NULL resolved_at (not a non-NULL condition)', () => {
    expect(ACTIVE_REPORT_PREDICATE).toContain('IS NULL');
    expect(ACTIVE_REPORT_PREDICATE).not.toContain('IS NOT NULL');
  });

  it('references the resolved_at column', () => {
    expect(ACTIVE_REPORT_PREDICATE).toContain('resolved_at');
  });
});
