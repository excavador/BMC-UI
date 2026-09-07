import { useHealthQuery, useNodesTabData } from "@/lib/api/get";

/**
 * How far a node's power-on stamp may predate the BMC's own boot before it is
 * called stale.
 *
 * The comparison mixes two clocks -- the stamp is the board's wall clock, and
 * the boot instant is derived from the browser's -- so a browser running a few
 * minutes ahead of the BMC would otherwise mark a node that was powered on
 * seconds after boot. Five minutes swallows any skew worth worrying about on a
 * board that reports its own chrony state on the Info page, and costs nothing:
 * the values this exists to catch are from an entirely different boot, hours or
 * days earlier.
 */
const CLOCK_TOLERANCE_SECONDS = 300;

/**
 * The moment the board was last successfully read, in seconds.
 *
 * Durations derived from a board stamp need a "now", and `Date.now()` during
 * render is both impure and the wrong answer: it says when the browser painted,
 * not when the board was asked. `dataUpdatedAt` is the timestamp of a query's
 * last successful fetch, which is exactly the moment the value being subtracted
 * came from -- the same reasoning that already gives the fan card its evidence
 * that the governor moved something.
 *
 * The freshest of the two reads is used. On our fork the health query polls, so
 * this advances every five seconds; on an older daemon it falls back to the
 * node query's own fetch, and a duration then reads as of the last time this
 * page heard from the board, which is the honest frame for it.
 */
export function useBoardNow(): number {
  const health = useHealthQuery();
  const nodes = useNodesTabData();

  return Math.max(health.dataUpdatedAt, nodes.dataUpdatedAt) / 1000;
}

/**
 * When this BMC booted, and whether a wall-clock stamp predates it.
 *
 * `type=health` reports the BMC's uptime, and that turns out to be the one
 * piece of evidence this interface has about whether a node's `power_on_time`
 * can be believed. Rebooting the BMC cuts power to every node -- upstream's
 * own reboot dialog says so -- so a node stamp from before the current BMC
 * boot describes a power cycle that has since happened, and cannot be the one
 * the node is running from now.
 *
 * That is a comparison, not a diagnosis, and it is worded as one everywhere it
 * surfaces. `known` is false on any daemon that does not report health, and
 * then nothing is marked at all: a marker that cannot be computed is better
 * absent than guessed.
 *
 * The uptime is paired with the timestamp of the fetch that carried it rather
 * than with the current instant, so the boot moment this derives does not
 * drift between polls.
 */
export function useBmcBootReference() {
  const { data, dataUpdatedAt } = useHealthQuery();

  const uptime = data?.uptime_seconds ?? null;
  const bootAt =
    uptime === null || !Number.isFinite(uptime) || dataUpdatedAt === 0
      ? null
      : dataUpdatedAt / 1000 - uptime;

  return {
    known: bootAt !== null,
    predatesBoot: (stamp: number | null) =>
      bootAt !== null &&
      stamp !== null &&
      Number.isFinite(stamp) &&
      stamp < bootAt - CLOCK_TOLERANCE_SECONDS,
  };
}
