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

/**
 * The padding a fixed-width EEPROM field arrives with: NUL, and the U+FFFD a
 * byte that was not valid UTF-8 has already been turned into by the time the
 * string reaches us. Sitting in a padding run, that is padding too.
 *
 * Split/join rather than a regular expression: a character class holding NUL
 * is exactly what `no-control-regex` exists to catch, and the rule is right
 * that such a class is usually a mistake. Here it is not, but a lint
 * suppression on a two-character replacement is a worse trade than this.
 */
const EEPROM_PADDING = ["\u0000", "\uFFFD"];

/**
 * Render a string the daemon read out of a fixed-width EEPROM field.
 *
 * `board_model` is such a field and bmcd forwards it byte for byte, so
 * "TuringPi2" arrives with seven NULs after it and the browser lays out seven
 * characters of nothing. The padding is stripped for display only: bmcd has to
 * keep sending the field verbatim, because `tpi` reads the same JSON and those
 * bytes have been identical for years.
 */
export function eepromLabel(value: string | undefined | null): string {
  if (value === null || value === undefined) return EMPTY_VALUE;
  const trimmed = EEPROM_PADDING.reduce(
    (text, pad) => text.split(pad).join(""),
    value
  ).trim();
  return trimmed === "" ? EMPTY_VALUE : trimmed;
}
