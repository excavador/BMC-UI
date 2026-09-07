import { filesize } from "filesize";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import TableItem from "@/components/TableItem";
import { type FirmwareSlot, useFirmwareSlotsQuery } from "@/lib/api/get";
import { versionLabel } from "@/lib/format";

const human = (bytes: number) => filesize(bytes, { standard: "jedec" });

/**
 * One slot's cell: the version if it can be read, and the volume behind it.
 *
 * The version is rendered as a version only when the daemon sent one. A null
 * is not an empty string and must not become one: on the rollback slot it is
 * the normal, permanent answer, because that volume is not mounted and its
 * version genuinely cannot be read from a running system. A dash there would
 * read as "the daemon forgot"; a version copied from anywhere else would be
 * a fabrication about the firmware a rollback lands on.
 *
 * The detail line is assembled from whichever parts survive a finiteness
 * check, the same way the switch panel builds its rate line. A daemon that
 * omits `volume_id` loses that fragment rather than printing "id undefined".
 */
function SlotBody({ slot }: { slot: FirmwareSlot | null }) {
  const { t } = useTranslation();

  if (slot === null) {
    return (
      <span className="opacity-60">{t("firmwareUpgrade.slotMissing")}</span>
    );
  }

  const detail = [
    slot.volume,
    Number.isFinite(slot.volume_id)
      ? t("firmwareUpgrade.slotVolumeId", { id: slot.volume_id })
      : null,
    Number.isFinite(slot.size_bytes) ? human(slot.size_bytes) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col items-end gap-0.5 lg:items-start">
      {slot.version === null || slot.version === "" ? (
        <span className="font-semibold opacity-60">
          {t("firmwareUpgrade.slotVersionUnreadable")}
        </span>
      ) : (
        <span className="font-semibold">{versionLabel(slot.version)}</span>
      )}
      {detail !== "" && <span className="text-sm opacity-60">{detail}</span>}
    </div>
  );
}

function SlotsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-row py-1">
          <div className="w-1/2 lg:w-1/4">
            <div className="h-6 w-20 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
          </div>
          <div className="h-6 w-44 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
        </div>
      ))}
    </div>
  );
}

/**
 * The board's A/B firmware state, on the tab that changes it.
 *
 * This board updates firmware into whichever of two root volumes is not
 * running and switches over on the next boot. The page that performs that
 * update has, until now, said nothing about which slot is running, what a
 * rollback would land on, or whether an update is already waiting for a
 * reboot -- so the one screen where those facts decide what you do next was
 * the one screen that did not have them.
 *
 * Four things are shown and they answer four different questions:
 *
 * - **running** -- the version this BMC is executing right now, which is the
 *   same string the header prints and is here so the two can be compared
 *   against what you are about to upload.
 * - **rollback** -- the volume a rollback lands on, with its version left
 *   deliberately unread; see `SlotBody`.
 * - **update staged** -- whether a reboot will switch slots. Three-valued,
 *   because "the environment could not be read" is not "no".
 * - **last promotion** -- the boot-time health gate's own verdict. A board
 *   that came up, failed its own checks and put itself back on the previous
 *   firmware reports that here and in no other place this interface can see.
 *
 * The panel sits above the upload form rather than below it: it describes
 * where the board is, and the form is what changes that.
 */
export default function FirmwareSlots() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useFirmwareSlotsQuery();

  const promotion = data?.last_promotion ?? null;

  return (
    <div>
      <div className="mb-6 text-lg font-bold">
        {t("firmwareUpgrade.firmwareSlots")}
      </div>

      {isPending && <SlotsSkeleton />}

      {isError && (
        <p className="text-sm opacity-60">
          {t("firmwareUpgrade.slotsUnavailable")}
        </p>
      )}

      {data && !data.present && (
        <p className="text-sm opacity-60">{t("firmwareUpgrade.slotsAbsent")}</p>
      )}

      {data?.present && (
        <>
          {/* Amber, and above the rows, because it is the one fact here that
              changes what the next reboot does. Not red: a staged update is
              the expected end of a successful upload, and an interface that
              cries fault at its own success teaches people to ignore it. */}
          {data.update_staged === true && (
            <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-500 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">
                  {t("firmwareUpgrade.slotStagedTitle")}
                </p>
                <p className="mt-1">
                  {t("firmwareUpgrade.slotStagedDescription")}
                </p>
              </div>
            </div>
          )}

          <dl>
            <TableItem term={t("firmwareUpgrade.slotRunning")}>
              <SlotBody slot={data.running} />
            </TableItem>
            <TableItem term={t("firmwareUpgrade.slotRollback")}>
              <SlotBody slot={data.rollback} />
            </TableItem>
            {data.nextboot !== null && data.nextboot !== "" && (
              <TableItem term={t("firmwareUpgrade.slotNextboot")}>
                <span className="font-semibold">{data.nextboot}</span>
              </TableItem>
            )}
            <TableItem term={t("firmwareUpgrade.slotStaged")}>
              {data.update_staged === true && (
                <span className="font-semibold text-amber-600 dark:text-amber-500">
                  {t("firmwareUpgrade.slotStagedYes")}
                </span>
              )}
              {data.update_staged === false && (
                <span className="font-semibold">
                  {t("firmwareUpgrade.slotStagedNo")}
                </span>
              )}
              {data.update_staged === null && (
                <span className="opacity-60">
                  {t("firmwareUpgrade.slotStagedUnknown")}
                </span>
              )}
            </TableItem>
            {promotion && (
              <TableItem term={t("firmwareUpgrade.slotPromotion")}>
                <div className="flex flex-col items-end gap-0.5 lg:items-start">
                  <span className="font-semibold">{promotion.message}</span>
                  <span className="text-sm opacity-60">
                    {promotion.timestamp}
                  </span>
                </div>
              </TableItem>
            )}
          </dl>

          <div className="mt-4 space-y-2 text-sm opacity-60">
            <p>{t("firmwareUpgrade.slotRollbackNote")}</p>
            {promotion && <p>{t("firmwareUpgrade.slotPromotionNote")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
