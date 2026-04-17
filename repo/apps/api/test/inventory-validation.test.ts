import { describe, expect, it } from 'vitest';
import {
  areTemperatureBandsCompatible,
  normalizeTemperatureBand,
  CANONICAL_TEMPERATURE_BANDS,
  ACCEPTED_INPUT_TEMPERATURE_BANDS
} from '../src/domain/temperature-band.js';

// ---------------------------------------------------------------------------
// normalizeTemperatureBand
// ---------------------------------------------------------------------------

describe('normalizeTemperatureBand', () => {
  it('returns ambient for "ambient"', () => {
    expect(normalizeTemperatureBand('ambient')).toBe('ambient');
  });

  it('returns chilled for "chilled"', () => {
    expect(normalizeTemperatureBand('chilled')).toBe('chilled');
  });

  it('returns frozen for "frozen"', () => {
    expect(normalizeTemperatureBand('frozen')).toBe('frozen');
  });

  it('normalizes uppercase input', () => {
    expect(normalizeTemperatureBand('AMBIENT')).toBe('ambient');
    expect(normalizeTemperatureBand('FROZEN')).toBe('frozen');
  });

  it('normalizes input with surrounding whitespace', () => {
    expect(normalizeTemperatureBand('  chilled  ')).toBe('chilled');
  });

  it('returns null for an unrecognized band when legacy aliases are disabled', () => {
    expect(normalizeTemperatureBand('cold')).toBeNull();
  });

  it('resolves legacy alias "cold" → chilled when allowLegacyAliases is true', () => {
    expect(normalizeTemperatureBand('cold', { allowLegacyAliases: true })).toBe('chilled');
  });

  it('returns null for null input', () => {
    expect(normalizeTemperatureBand(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeTemperatureBand(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeTemperatureBand('')).toBeNull();
  });

  it('returns null for a completely unknown string', () => {
    expect(normalizeTemperatureBand('warm')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CANONICAL_TEMPERATURE_BANDS / ACCEPTED_INPUT_TEMPERATURE_BANDS constants
// ---------------------------------------------------------------------------

describe('temperature band constants', () => {
  it('canonical bands are ambient, chilled, frozen', () => {
    expect([...CANONICAL_TEMPERATURE_BANDS]).toEqual(['ambient', 'chilled', 'frozen']);
  });

  it('accepted input bands include all canonical bands', () => {
    for (const band of CANONICAL_TEMPERATURE_BANDS) {
      expect(ACCEPTED_INPUT_TEMPERATURE_BANDS).toContain(band);
    }
  });

  it('accepted input bands include the legacy alias "cold"', () => {
    expect(ACCEPTED_INPUT_TEMPERATURE_BANDS).toContain('cold');
  });
});

// ---------------------------------------------------------------------------
// areTemperatureBandsCompatible
// These rules are enforced inside InventoryService when moving, receiving,
// or transferring inventory.
// ---------------------------------------------------------------------------

describe('areTemperatureBandsCompatible', () => {
  it('ambient is compatible with ambient', () => {
    expect(areTemperatureBandsCompatible('ambient', 'ambient')).toBe(true);
  });

  it('chilled is compatible with chilled', () => {
    expect(areTemperatureBandsCompatible('chilled', 'chilled')).toBe(true);
  });

  it('frozen is compatible with frozen', () => {
    expect(areTemperatureBandsCompatible('frozen', 'frozen')).toBe(true);
  });

  it('ambient is not compatible with chilled', () => {
    expect(areTemperatureBandsCompatible('ambient', 'chilled')).toBe(false);
  });

  it('ambient is not compatible with frozen', () => {
    expect(areTemperatureBandsCompatible('ambient', 'frozen')).toBe(false);
  });

  it('chilled is not compatible with frozen', () => {
    expect(areTemperatureBandsCompatible('chilled', 'frozen')).toBe(false);
  });

  it('frozen is not compatible with ambient', () => {
    expect(areTemperatureBandsCompatible('frozen', 'ambient')).toBe(false);
  });

  it('returns false when left band is null', () => {
    expect(areTemperatureBandsCompatible(null, 'ambient')).toBe(false);
  });

  it('returns false when right band is null', () => {
    expect(areTemperatureBandsCompatible('ambient', null)).toBe(false);
  });

  it('returns false when both bands are null', () => {
    expect(areTemperatureBandsCompatible(null, null)).toBe(false);
  });

  it('returns false when either band is unrecognized', () => {
    expect(areTemperatureBandsCompatible('warm', 'ambient')).toBe(false);
    expect(areTemperatureBandsCompatible('ambient', 'warm')).toBe(false);
  });

  it('resolves legacy alias "cold" to chilled for compatibility checks', () => {
    expect(areTemperatureBandsCompatible('cold', 'chilled')).toBe(true);
    expect(areTemperatureBandsCompatible('chilled', 'cold')).toBe(true);
    expect(areTemperatureBandsCompatible('cold', 'cold')).toBe(true);
  });

  it('cold is not compatible with ambient', () => {
    expect(areTemperatureBandsCompatible('cold', 'ambient')).toBe(false);
  });

  it('cold is not compatible with frozen', () => {
    expect(areTemperatureBandsCompatible('cold', 'frozen')).toBe(false);
  });

  it('is symmetric — order of arguments does not affect the result', () => {
    const bands = ['ambient', 'chilled', 'frozen', 'cold'];
    for (const a of bands) {
      for (const b of bands) {
        expect(areTemperatureBandsCompatible(a, b)).toBe(areTemperatureBandsCompatible(b, a));
      }
    }
  });
});
