import { useTranslation } from "react-i18next";

import { useDurationLabel } from "@/hooks/use-duration";
import { type NodeInfoResponse, useSwitchPortsQuery } from "@/lib/api/get";

/**
 * One node's line of evidence that something is actually there.
 *
 * The Nodes page has a power toggle and two editable names, and until now said
 * nothing about whether a module is alive. Two endpoints this interface
 * already talks to say a great deal between them, and neither was being read
 * here: `type=node_info` carries each node's `power_on_time`, and
 * `type=network` carries the switch port that node hangs off, where `node1`
 * through `node4` map to modules 1 through 4.
 *
 * Link state is the harder fact of the two and it is deliberately the one on
 * the right: a module drawing power with a dead switch port is a node you
 * cannot reach, and it looked identical to a healthy one on this page.
 *
 * Both halves disappear rather than degrade loudly. A daemon with no
 * `type=network` shows no link fragment at all, because the Nodes page is not
 * the place to report that the switch endpoint is missing -- the Info panel
 * already does that, in a section devoted to it.
 */
export default function NodeLiveness({
  nodeId,
  powerOnTime,
}: {
  nodeId: number;
  powerOnTime: number | null;
}) {
  const { t } = useTranslation();
  const { data: ports } = useSwitchPortsQuery();
  const durationLabel = useDurationLabel();

  const port = ports?.find((candidate) => candidate.name === `node${nodeId}`);

  // `power_on_time` is ALREADY elapsed seconds, not an epoch stamp. The daemon
  // stores a wall-clock instant and hands out the difference, so subtracting it
  // from the current time again dated every module to 1969: the page read
  // "powered on 20703 d 2 h ago" against a module genuinely up for 19 hours.
  // Verified against the board -- node 1 reported 68891 while its own
  // /proc/uptime said 68865.
  const uptime = powerOnTime === null ? null : durationLabel(powerOnTime);

  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {powerOnTime === null && (
        <span className="opacity-60">{t("nodes.powerOff")}</span>
      )}

      {powerOnTime !== null && uptime === null && (
        <span className="opacity-60">{t("nodes.powerOnUnreadable")}</span>
      )}

      {uptime !== null && (
        <span>{t("nodes.powerOnFor", { duration: uptime })}</span>
      )}

      {port && !port.present && (
        <span className="text-red-600 dark:text-red-400">
          {t("nodes.linkAbsent")}
        </span>
      )}

      {port?.present && port.link && (
        <span className="flex flex-wrap gap-x-2">
          <span>{t("nodes.linkUp")}</span>
          {port.speed_mbps !== null && Number.isFinite(port.speed_mbps) && (
            <span className="opacity-60">
              {t("nodes.linkSpeed", { speed: port.speed_mbps })}
            </span>
          )}
        </span>
      )}

      {port?.present && !port.link && (
        <span className="text-amber-600 dark:text-amber-500">
          {t("nodes.linkDown")}
        </span>
      )}
    </div>
  );
}

/**
 * What the power-on times on this page are, and are not.
 *
 * `power_on_time` is a value the daemon derives from a stored instant, not a
 * probe of the module, and on this board it is wrong for three nodes out of
 * four: a firmware bug fixed only in the current build left an earlier boot's
 * value in place, and it stays there until each module is next genuinely
 * power-cycled.
 *
 * There is deliberately no marker for that. The obvious test -- flag a value
 * older than the BMC's own boot -- is built on a premise this firmware makes
 * false: a BMC reboot does NOT power-cycle the modules. That is the whole
 * point of the preserve-boot-state patch, measured across four flashes with
 * every module's uptime climbing straight through. So a stamp surviving a BMC
 * reboot is the system working, and marking it fired on all four nodes after
 * every reboot -- confidently wrong, which is worse than silent.
 *
 * Comparing siblings was rejected too: three modules rebooted this morning and
 * one up for a month is a normal cluster, and the long-running one is not the
 * suspect. Nothing this interface can see distinguishes a stale stamp from a
 * true one, so it says what the board said and says what that means.
 */
export function NodeLivenessNotes({ nodes }: { nodes: NodeInfoResponse[] }) {
  const { t } = useTranslation();

  if (!nodes.some((node) => node.power_on_time !== null)) return null;

  return (
    <div className="mt-6 space-y-2 text-sm opacity-60">
      <p>{t("nodes.powerOnTimeNote")}</p>
    </div>
  );
}
