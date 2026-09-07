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

/** One unit of a rendered duration. The strings live in `src/locale/`. */
export type DurationUnit = "d" | "h" | "m" | "s";

export interface DurationPart {
  unit: DurationUnit;
  value: number;
}

/**
 * Break a number of seconds into at most two units, largest first.
 *
 * Two units and not more, because the question these durations answer is
 * "roughly how long" -- an uptime of `4 d 7 h` is read at a glance and
 * `4 d 7 h 12 m 9 s` is not. Leading zero units are dropped rather than
 * printed, and a trailing zero unit is dropped as well, so 86400 seconds is
 * `1 d` rather than `1 d 0 h`.
 *
 * The units are returned rather than joined, because the caller has the
 * translation function and this file has no business holding English in it.
 *
 * An empty array means *there is no duration to render*: a value that is not
 * a finite number, or a negative one. Negative is not folded to zero on
 * purpose -- an elapsed time that comes out negative means a clock somewhere
 * disagrees, and a caller that renders it as "0 s" has hidden that.
 */
export function durationParts(seconds: number): DurationPart[] {
  if (!Number.isFinite(seconds) || seconds < 0) return [];

  const total = Math.floor(seconds);
  const all: DurationPart[] = [
    { unit: "d", value: Math.floor(total / 86400) },
    { unit: "h", value: Math.floor((total % 86400) / 3600) },
    { unit: "m", value: Math.floor((total % 3600) / 60) },
    { unit: "s", value: total % 60 },
  ];

  const first = all.findIndex((part) => part.value > 0);
  if (first === -1) return [{ unit: "s", value: 0 }];

  return all
    .slice(first, first + 2)
    .filter((part, index) => index === 0 || part.value > 0);
}

/** The unit a clock offset was rescaled to, so the caller can name it. */
export type OffsetUnit = "s" | "ms" | "us";

export interface OffsetReading {
  unit: OffsetUnit;
  /** Already rounded; render it as-is. */
  value: string;
}

/**
 * Rescale a clock offset in seconds to a unit that can be read.
 *
 * bmcd serialises this through serde, which emits a small float in exponent
 * form -- the board sends `-3.077e-6` and means three microseconds. Printed
 * raw that is not a number anyone reads as a time, and `toFixed` on it gives
 * `-0.000003`, which is not much better. It is parsed as the number it is and
 * rescaled to whichever of seconds, milliseconds or microseconds keeps a
 * digit in front of the decimal point.
 *
 * Null for anything that is not a finite number, so a daemon that could not
 * measure produces the words for that rather than `NaN us`.
 */
export function offsetReading(seconds: number): OffsetReading | null {
  if (!Number.isFinite(seconds)) return null;

  const magnitude = Math.abs(seconds);
  if (magnitude >= 1) return { unit: "s", value: seconds.toFixed(3) };
  if (magnitude >= 1e-3)
    return { unit: "ms", value: (seconds * 1e3).toFixed(3) };
  return { unit: "us", value: (seconds * 1e6).toFixed(3) };
}
