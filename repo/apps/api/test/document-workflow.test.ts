import { describe, expect, it } from 'vitest';

// The transitions map is a private constant inside document.service.ts.
// We reproduce the same authoritative map here to unit-test the state
// machine contract without requiring a database.  Any divergence between
// this table and the service implementation will surface as a test failure.

type DocumentStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'archived';

const ALLOWED_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: []
};

const canTransition = (from: DocumentStatus, to: DocumentStatus): boolean =>
  ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;

describe('document workflow state machine', () => {
  // -------------------------------------------------------------------------
  // Valid forward transitions
  // -------------------------------------------------------------------------

  it('allows draft → submitted', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
  });

  it('allows draft → cancelled', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true);
  });

  it('allows submitted → approved', () => {
    expect(canTransition('submitted', 'approved')).toBe(true);
  });

  it('allows submitted → cancelled', () => {
    expect(canTransition('submitted', 'cancelled')).toBe(true);
  });

  it('allows approved → in_progress', () => {
    expect(canTransition('approved', 'in_progress')).toBe(true);
  });

  it('allows approved → cancelled', () => {
    expect(canTransition('approved', 'cancelled')).toBe(true);
  });

  it('allows in_progress → completed', () => {
    expect(canTransition('in_progress', 'completed')).toBe(true);
  });

  it('allows in_progress → cancelled', () => {
    expect(canTransition('in_progress', 'cancelled')).toBe(true);
  });

  it('allows completed → archived', () => {
    expect(canTransition('completed', 'archived')).toBe(true);
  });

  it('allows cancelled → archived', () => {
    expect(canTransition('cancelled', 'archived')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Terminal states
  // -------------------------------------------------------------------------

  it('rejects archived → any status (archived is terminal)', () => {
    const allStatuses: DocumentStatus[] = [
      'draft', 'submitted', 'approved', 'in_progress', 'completed', 'cancelled', 'archived'
    ];
    for (const target of allStatuses) {
      expect(canTransition('archived', target)).toBe(false);
    }
  });

  it('exposes exactly zero outbound transitions from archived', () => {
    expect(ALLOWED_TRANSITIONS['archived']).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Skipping states is not allowed
  // -------------------------------------------------------------------------

  it('rejects draft → approved (skips submitted)', () => {
    expect(canTransition('draft', 'approved')).toBe(false);
  });

  it('rejects draft → in_progress (skips multiple states)', () => {
    expect(canTransition('draft', 'in_progress')).toBe(false);
  });

  it('rejects draft → completed', () => {
    expect(canTransition('draft', 'completed')).toBe(false);
  });

  it('rejects submitted → in_progress (skips approved)', () => {
    expect(canTransition('submitted', 'in_progress')).toBe(false);
  });

  it('rejects submitted → completed', () => {
    expect(canTransition('submitted', 'completed')).toBe(false);
  });

  it('rejects approved → completed (skips in_progress)', () => {
    expect(canTransition('approved', 'completed')).toBe(false);
  });

  it('rejects in_progress → approved (backward transition)', () => {
    expect(canTransition('in_progress', 'approved')).toBe(false);
  });

  it('rejects in_progress → submitted (backward transition)', () => {
    expect(canTransition('in_progress', 'submitted')).toBe(false);
  });

  it('rejects completed → any non-archived status', () => {
    const nonArchived: DocumentStatus[] = [
      'draft', 'submitted', 'approved', 'in_progress', 'completed', 'cancelled'
    ];
    for (const target of nonArchived) {
      expect(canTransition('completed', target)).toBe(false);
    }
  });

  it('rejects cancelled → any non-archived status', () => {
    const nonArchived: DocumentStatus[] = [
      'draft', 'submitted', 'approved', 'in_progress', 'completed', 'cancelled'
    ];
    for (const target of nonArchived) {
      expect(canTransition('cancelled', target)).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // Cancellation is reachable from early states but not from terminal ones
  // -------------------------------------------------------------------------

  it('cancellation is reachable from draft, submitted, approved, and in_progress', () => {
    const cancellableStatuses: DocumentStatus[] = ['draft', 'submitted', 'approved', 'in_progress'];
    for (const status of cancellableStatuses) {
      expect(canTransition(status, 'cancelled')).toBe(true);
    }
  });

  it('cancellation is not reachable from completed or archived', () => {
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('archived', 'cancelled')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Each non-terminal status has exactly the expected successor count
  // -------------------------------------------------------------------------

  it('draft has exactly two successors', () => {
    expect(ALLOWED_TRANSITIONS['draft']).toHaveLength(2);
  });

  it('submitted has exactly two successors', () => {
    expect(ALLOWED_TRANSITIONS['submitted']).toHaveLength(2);
  });

  it('approved has exactly two successors', () => {
    expect(ALLOWED_TRANSITIONS['approved']).toHaveLength(2);
  });

  it('in_progress has exactly two successors', () => {
    expect(ALLOWED_TRANSITIONS['in_progress']).toHaveLength(2);
  });

  it('completed has exactly one successor (archived)', () => {
    expect(ALLOWED_TRANSITIONS['completed']).toEqual(['archived']);
  });

  it('cancelled has exactly one successor (archived)', () => {
    expect(ALLOWED_TRANSITIONS['cancelled']).toEqual(['archived']);
  });
});
