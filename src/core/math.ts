/** Small numeric helpers shared by the tools. */

/**
 * Constrain a value to `[min, max]`.
 *
 * Returns `min` when given `NaN`, because every caller here uses this to keep a
 * user-supplied number inside a legal range and a silent `NaN` would propagate
 * into canvas transforms and CSS values.
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Round to the nearest multiple of `step`. */
export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Parse a number the way a person types one, accepting a comma as the decimal
 * separator so German input works without a locale switch.
 */
export function parseDecimal(input: string): number | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}
