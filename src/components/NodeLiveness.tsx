import { useTranslation } from "react-i18next";

import { useBmcBootReference, useBoardNow } from "@/hooks/use-bmc-boot";
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
  const { predatesBoot } = useBmcBootReference();
  const now = useBoardNow();

  const port = ports?.find((candidate) => candidate.name === `node${nodeId}`);

  // Elapsed as of the last time the board was read, against the browser's
  // clock. The stamp is the board's, so the two clocks have to agree for the
  // duration to mean anything; the Info page's clock row is where that gets
  // checked, and this page says so under the list.
  const elapsed = powerOnTime === null ? null : now - powerOnTime;
  const uptime = elapsed === null ? null : durationLabel(elapsed);
  const stale = predatesBoot(powerOnTime);

  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {powerOnTime === null && (
        <span className="opacity-60">{t("nodes.powerOff")}</span>
      )}

      {powerOnTime !== null && uptime === null && (
        <span className="opacity-60">{t("nodes.powerOnUnreadable")}</span>
      )}

      {uptime !== null && (
        <span className={stale ? "opacity-60" : undefined}>
          {t("nodes.powerOnFor", { duration: uptime })}
        </span>
      )}

      {/* The quiet marker. Amber and in words, beside the value rather than
          instead of it: the stamp is data the board really sent, and hiding it
          would be its own kind of lie. What it is not is evidence that this
          module has been up that long, and this says exactly that much. */}
      {stale && (
        <span className="text-amber-600 dark:text-amber-500">
          {t("nodes.powerOnBeforeBmcBoot")}
        </span>
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
 * `power_on_time` is a stored wall-clock stamp, not a probe, and on this board
 * it is wrong for three nodes out of four: a firmware bug fixed only in the
 * current build left the previous boot's value in place, and it will stay
 * there until each module is next genuinely power-cycled. Rendering those
 * durations as fact would put four confident numbers on screen of which one is
 * true.
 *
 * The alternative considered and rejected was to compare each node against its
 * siblings and mark whichever disagrees. That marks the wrong node as often as
 * the right one: a cluster where three modules were rebooted this morning and
 * one has been up for a month is completely normal, and the long-running one
 * is not the suspect. The BMC's own boot time is used instead, because it is a
 * fact about causality rather than about distribution.
 *
 * The second sentence appears only when something is actually marked, so a
 * board where every stamp is plausible does not carry a paragraph about a
 * marker nobody can see.
 */
export function NodeLivenessNotes({ nodes }: { nodes: NodeInfoResponse[] }) {
  const { t } = useTranslation();
  const { predatesBoot } = useBmcBootReference();

  if (!nodes.some((node) => node.power_on_time !== null)) return null;

  return (
    <div className="mt-6 space-y-2 text-sm opacity-60">
      <p>{t("nodes.powerOnTimeNote")}</p>
      {nodes.some((node) => predatesBoot(node.power_on_time)) && (
        <p>{t("nodes.powerOnTimeStaleNote")}</p>
      )}
    </div>
  );
}
