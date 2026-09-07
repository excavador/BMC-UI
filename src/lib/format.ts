/**
 * Formatting helpers for values that arrive from bmcd and are rendered as-is.
 *
 * These live here rather than beside a single page because the same value
 * reaches more than one render site: the daemon version is printed both on the
 * About page and in the header on every page, and a helper applied to only one
 * of them is exactly how the doubled "v" survived its first fix.
 */

/** What an absent value renders as, so a missing field looks missing. */
export const EMPTY_VALUE = "—";

/**
 * Render a version string with exactly one leading "v".
 *
 * Our firmware's VERSION already carries one, so the unconditional `v${...}`
 * upstream uses printed "vv2.2.0-unstable-hive.5" on the board. Dropping the
 * "v" at the source is not an option: `tpi info` prints the same string and
 * the flash scripts verify against it, so the doubling has to be fixed here.
 *
 * A value the daemon did not send renders as a dash instead of "vundefined".
 */
export function versionLabel(value: string | undefined | null): string {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  return value.startsWith("v") ? value : `v${value}`;
}
