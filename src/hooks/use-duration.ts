import { useTranslation } from "react-i18next";

import { durationParts, type DurationUnit } from "@/lib/format";

const UNIT_KEYS: Record<DurationUnit, string> = {
  d: "ui.durationDays",
  h: "ui.durationHours",
  m: "ui.durationMinutes",
  s: "ui.durationSeconds",
};

/**
 * A translated duration label, e.g. `4 d 7 h`.
 *
 * `durationParts` does the arithmetic and returns units rather than words;
 * this joins them through the translation function, so a locale that writes
 * its units differently gets to. It lives in a hook rather than beside either
 * caller because two pages render durations -- the BMC's own uptime and each
 * node's power-on time -- and they must not drift apart.
 *
 * Returns null when there is no duration to render, which is the caller's cue
 * to say so in words rather than to print a zero.
 */
export function useDurationLabel() {
  const { t } = useTranslation();

  return (seconds: number): string | null => {
    const parts = durationParts(seconds);
    if (parts.length === 0) return null;
    return parts
      .map((part) => t(UNIT_KEYS[part.unit], { value: part.value }))
      .join(" ");
  };
}
