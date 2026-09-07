import { filesize } from "filesize";
import { useTranslation } from "react-i18next";

import TableItem from "@/components/TableItem";
import { Progress } from "@/components/ui/progress";
import { useDurationLabel } from "@/hooks/use-duration";
import {
  type HealthClock,
  type HealthLoad,
  type HealthMemory,
  type HealthNand,
  useHealthQuery,
} from "@/lib/api/get";
import { EMPTY_VALUE, offsetReading, type OffsetUnit } from "@/lib/format";

const human = (bytes: number) => filesize(bytes, { standard: "jedec" });

const OFFSET_KEYS: Record<OffsetUnit, string> = {
  s: "info.healthClockOffsetSeconds",
  ms: "info.healthClockOffsetMillis",
  us: "info.healthClockOffsetMicros",
};

/** What a section that reported `present: false` renders as. */
function Absent() {
  const { t } = useTranslation();

  return (
    <span className="font-semibold text-amber-600 dark:text-amber-500">
      {t("info.healthAbsent")}
    </span>
  );
}

/**
 * The three load averages, in the order every other tool prints them.
 *
 * Formatted to two decimals here rather than trusted: a daemon that sends an
 * integer 0 for an idle board should still read `0.00`, in line with the two
 * numbers beside it, and one that sends something that is not a number at all
 * should not print `NaN`.
 */
function LoadReading({ load }: { load: HealthLoad }) {
  const { t } = useTranslation();

  const values = [load.one_minute, load.five_minutes, load.fifteen_minutes];
  if (!load.present || values.some((value) => !Number.isFinite(value))) {
    return <Absent />;
  }

  return (
    <div className="flex flex-wrap justify-end gap-x-3 lg:justify-start">
      <span className="font-semibold">
        {values.map((value) => value.toFixed(2)).join(" · ")}
      </span>
      <span className="opacity-60">{t("info.healthLoadWindows")}</span>
    </div>
  );
}

/**
 * Memory, as the bar the storage section already uses.
 *
 * The bar is `total - available`, not `total - free`: `available` is the
 * kernel's own estimate of what a new allocation could get, and on a board
 * with 116 MB of RAM the difference between the two is most of the answer to
 * "will this firmware upload fit". `free` is printed beside it because it is
 * the number `/proc/meminfo` readers expect to see, not because it is the one
 * to act on.
 *
 * `warningOnHigh` is the Progress component's own 75/90 colouring, the same
 * behaviour user storage has had all along. It is not a threshold invented
 * here.
 */
function MemoryReading({ memory }: { memory: HealthMemory }) {
  const { t } = useTranslation();

  const total = memory.total_bytes;
  const available = memory.available_bytes;
  if (
    !memory.present ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isFinite(available)
  ) {
    return <Absent />;
  }

  const used = Math.max(total - available, 0);

  return (
    <div className="space-y-1">
      <Progress
        aria-label={t("info.ariaMemoryUtilization")}
        value={Math.round((used / total) * 100)}
        label={`${human(used)} / ${human(total)}`}
        warningOnHigh
      />
      <div className="text-sm opacity-60">
        {t("info.healthMemoryDetail", {
          free: Number.isFinite(memory.free_bytes)
            ? human(memory.free_bytes)
            : EMPTY_VALUE,
          available: human(available),
        })}
      </div>
    </div>
  );
}

/**
 * NAND, in eraseblocks, with no bar and no threshold.
 *
 * Free eraseblocks are the number that runs out on a board reflashed as often
 * as this one, and on this board they are down to single digits out of two
 * thousand. They are still not coloured: how much headroom a UBI volume needs
 * before it is in trouble is not something any endpoint reports, and a red
 * bar drawn from a guess would be the fan percentage all over again.
 *
 * Bad eraseblocks are coloured, and that is not a threshold: zero and
 * non-zero are different kinds of fact. A bad block never comes back.
 */
function NandReading({ nand }: { nand: HealthNand }) {
  const { t } = useTranslation();

  if (
    !nand.present ||
    !Number.isFinite(nand.total_eraseblocks) ||
    !Number.isFinite(nand.available_eraseblocks)
  ) {
    return <Absent />;
  }

  return (
    <div className="flex flex-wrap justify-end gap-x-3 lg:justify-start">
      <span className="font-semibold">
        {t("info.healthNandFree", {
          available: nand.available_eraseblocks,
          total: nand.total_eraseblocks,
        })}
      </span>
      {Number.isFinite(nand.available_bytes) && (
        <span className="opacity-60">{human(nand.available_bytes)}</span>
      )}
      {Number.isFinite(nand.bad_eraseblocks) && (
        <span
          className={
            nand.bad_eraseblocks > 0
              ? "text-amber-600 dark:text-amber-500"
              : "opacity-60"
          }
        >
          {t("info.healthNandBad", { blocks: nand.bad_eraseblocks })}
        </span>
      )}
      {Number.isFinite(nand.reserved_eraseblocks) && (
        <span className="opacity-60">
          {t("info.healthNandReserved", {
            blocks: nand.reserved_eraseblocks,
          })}
        </span>
      )}
    </div>
  );
}

/**
 * The clock, its source, and how far off it is.
 *
 * `synchronised` has three states and they say three different things. True
 * is plain, false is amber -- a BMC whose clock has drifted stamps every log
 * line and every power-on time with the wrong moment -- and **null is muted
 * prose**: chrony could not be reached, so nothing here knows either way, and
 * drawing that as "not synchronised" would be an accusation the daemon never
 * made.
 *
 * `measured_by` is carried through rather than dropped. It says where the
 * offset came from, and an offset with no provenance is a number to be
 * believed rather than checked.
 */
function ClockReading({ clock }: { clock: HealthClock }) {
  const { t } = useTranslation();

  const offset =
    clock.offset_seconds === null ? null : offsetReading(clock.offset_seconds);

  const detail = [
    clock.source === null || clock.source === ""
      ? null
      : t("info.healthClockSource", { source: clock.source }),
    Number.isFinite(clock.stratum)
      ? t("info.healthClockStratum", { stratum: clock.stratum })
      : null,
    offset === null
      ? null
      : t(OFFSET_KEYS[offset.unit], { value: offset.value }),
  ].filter(Boolean);

  return (
    <div className="flex flex-col items-end gap-0.5 lg:items-start">
      <div className="flex flex-wrap justify-end gap-x-3 lg:justify-start">
        {clock.synchronised === true && (
          <span className="font-semibold">{t("info.healthClockSynced")}</span>
        )}
        {clock.synchronised === false && (
          <span className="font-semibold text-amber-600 dark:text-amber-500">
            {t("info.healthClockNotSynced")}
          </span>
        )}
        {clock.synchronised === null && (
          <span className="opacity-60">{t("info.healthClockUnknown")}</span>
        )}
        {detail.length > 0 && (
          <span className="opacity-60">{detail.join(" · ")}</span>
        )}
      </div>
      {clock.measured_by !== null && clock.measured_by !== "" && (
        <span className="text-sm opacity-60">
          {t("info.healthClockMeasuredBy", { tool: clock.measured_by })}
        </span>
      )}
      {clock.rtc.length > 0 && (
        <span className="text-sm opacity-60">
          {clock.rtc
            .map((rtc) =>
              rtc.name ? `${rtc.device} · ${rtc.name}` : rtc.device
            )
            .join(" · ")}
        </span>
      )}
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex flex-row py-1">
          <div className="w-1/2 lg:w-1/4">
            <div className="h-6 w-20 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
          </div>
          <div className="h-6 w-40 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
        </div>
      ))}
    </div>
  );
}

/**
 * How the BMC itself is doing.
 *
 * The Info page reported the user storage volume, the fan, the addresses and
 * the switch, and nothing at all about the computer serving the page. That
 * board has **116 MB of RAM**, and a firmware upload has already failed on
 * this machine for want of it while every screen here said the board was
 * fine. It has **five free eraseblocks out of 2040** on a NAND it reflashes
 * regularly. Neither number was visible from a browser.
 *
 * Five rows, each of which is a different question:
 *
 * - **uptime** -- how long ago this BMC booted, which is also the frame every
 *   other duration on this interface has to be read against.
 * - **load** -- what it is being asked to do.
 * - **memory** -- what is left to ask it with, drawn as the same bar user
 *   storage uses.
 * - **NAND** -- what is left to write firmware into, with no bar and no
 *   colour, because nothing here knows what a healthy margin is.
 * - **clock** -- whether the timestamps anything on this board produces mean
 *   anything, including the ones this interface renders.
 *
 * Every section degrades on its own. A daemon that omits one renders that row
 * as words; a section that reports `present: false` renders as *not detected*
 * in amber; a request that fails leaves one muted line and the rest of the
 * page untouched.
 */
export default function BoardHealth() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useHealthQuery();
  const durationLabel = useDurationLabel();

  const uptime =
    data?.uptime_seconds === null || data?.uptime_seconds === undefined
      ? null
      : durationLabel(data.uptime_seconds);

  return (
    <div>
      <div className="mb-6 text-lg font-bold">{t("info.boardHealth")}</div>

      {isPending && <HealthSkeleton />}

      {isError && (
        <p className="text-sm opacity-60">{t("info.healthUnavailable")}</p>
      )}

      {data && (
        <>
          <dl>
            <TableItem term={t("info.healthUptime")}>
              {uptime === null ? (
                <Absent />
              ) : (
                <span className="font-semibold">{uptime}</span>
              )}
            </TableItem>
            <TableItem term={t("info.healthLoad")}>
              {data.load === null ? (
                <Absent />
              ) : (
                <LoadReading load={data.load} />
              )}
            </TableItem>
            <TableItem term={t("info.healthMemory")}>
              {data.memory === null ? (
                <Absent />
              ) : (
                <MemoryReading memory={data.memory} />
              )}
            </TableItem>
            <TableItem term={t("info.healthNand")}>
              {data.nand === null ? (
                <Absent />
              ) : (
                <NandReading nand={data.nand} />
              )}
            </TableItem>
            <TableItem term={t("info.healthClock")}>
              {data.clock === null ? (
                <Absent />
              ) : (
                <ClockReading clock={data.clock} />
              )}
            </TableItem>
          </dl>

          {data.nand !== null && data.nand.present && (
            <p className="mt-4 text-sm opacity-60">
              {t("info.healthNandNote")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
