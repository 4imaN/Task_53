export const CANONICAL_TEMPERATURE_BANDS = ['ambient', 'chilled', 'frozen'] as const;
export type CanonicalTemperatureBand = (typeof CANONICAL_TEMPERATURE_BANDS)[number];

const LEGACY_TEMPERATURE_BAND_ALIASES = {
  cold: 'chilled'
} as const;

type LegacyTemperatureBandAlias = keyof typeof LEGACY_TEMPERATURE_BAND_ALIASES;

export const ACCEPTED_INPUT_TEMPERATURE_BANDS = [
  ...CANONICAL_TEMPERATURE_BANDS,
  ...Object.keys(LEGACY_TEMPERATURE_BAND_ALIASES) as LegacyTemperatureBandAlias[]
] as const;

const canonicalTemperatureBandSet = new Set<string>(CANONICAL_TEMPERATURE_BANDS);
const aliasTemperatureBandMap = new Map<string, CanonicalTemperatureBand>(
  Object.entries(LEGACY_TEMPERATURE_BAND_ALIASES) as Array<[LegacyTemperatureBandAlias, CanonicalTemperatureBand]>
);

type NormalizeTemperatureBandOptions = {
  allowLegacyAliases?: boolean;
};

export const normalizeTemperatureBand = (
  value: string | null | undefined,
  options: NormalizeTemperatureBandOptions = {}
): CanonicalTemperatureBand | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (canonicalTemperatureBandSet.has(normalized)) {
    return normalized as CanonicalTemperatureBand;
  }

  if (options.allowLegacyAliases) {
    return aliasTemperatureBandMap.get(normalized) ?? null;
  }

  return null;
};

export const areTemperatureBandsCompatible = (
  left: string | null | undefined,
  right: string | null | undefined
): boolean => {
  const normalizedLeft = normalizeTemperatureBand(left, { allowLegacyAliases: true });
  const normalizedRight = normalizeTemperatureBand(right, { allowLegacyAliases: true });
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

export const canonicalTemperatureBandListText = CANONICAL_TEMPERATURE_BANDS.join(', ');
