import { filesize } from "filesize";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import TableItem from "@/components/TableItem";
import { type SwitchPort, useSwitchPortsQuery } from "@/lib/api/get";

const human = (bytes: number) => filesize(bytes, { standard: "jedec" });

/**
 * The right-hand side of one port row.
 *
 * Three states, and they are not the same kind of news:
 *
 * - **not present** -- the switch driver never probed the port. Red. On a
 *   node port this means a compute module is cut off from the network while
 *   the BMC that reports it stays perfectly reachable, which is precisely the
 *   failure that used to be invisible from this interface.
 * - **down** -- probed, no link. Amber. Normal for an unplugged uplink or a
 *   powered-off node, and still worth being able to see at a glance.
 * - **up** -- speed and duplex, because a gigabit port that negotiated
 *   100/half is a bad cable and reads as fine everywhere else.
 *
 * Byte counters show in every present state. They are cumulative since the
 * switch came up, so a down port with traffic behind it is a link that
 * dropped rather than one that never came up.
 */
function PortStatus({ port }: { port: SwitchPort }) {
  const { t } = useTranslation();

  if (!port.present) {
    return (
      <span className="font-semibold text-red-600 dark:text-red-400">
        {t("network.switchPortAbsent")}
      </span>
    );
  }

  const duplex =
    port.duplex === "full"
      ? t("network.switchPortDuplexFull")
      : port.duplex === "half"
        ? t("network.switchPortDuplexHalf")
        : port.duplex;

  const rate = [
    port.speed_mbps === null
      ? null
      : t("network.switchPortSpeed", { speed: port.speed_mbps }),
    duplex,
  ]
    .filter(Boolean)
    .join(" · ");

  const errors = port.rx_errors + port.tx_errors;

  return (
    <div className="flex flex-wrap justify-end gap-x-3 lg:justify-start">
      {port.link ? (
        <span className="font-semibold">{t("network.switchPortUp")}</span>
      ) : (
        <span className="font-semibold text-amber-600 dark:text-amber-500">
          {t("network.switchPortDown")}
        </span>
      )}
      {port.link && rate !== "" && <span className="opacity-60">{rate}</span>}
      {!port.link && port.operstate !== "down" && (
        <span className="opacity-60">{port.operstate}</span>
      )}
      <span className="opacity-60">
        {t("network.switchPortTraffic", {
          rx: human(port.rx_bytes),
          tx: human(port.tx_bytes),
        })}
      </span>
      {errors > 0 && (
        <span className="text-amber-600 dark:text-amber-500">
          {t("network.switchPortErrors", {
            rx: port.rx_errors,
            tx: port.tx_errors,
          })}
        </span>
      )}
    </div>
  );
}

function PortsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-row py-1">
          <div className="w-1/2 lg:w-1/4">
            <div className="h-6 w-16 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
          </div>
          <div className="h-6 w-48 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
        </div>
      ))}
    </div>
  );
}

/**
 * The on-board switch, port by port.
 *
 * The Network page lists the BMC's own addresses above this, and they say
 * nothing about the switch ports the nodes actually hang off. A downed
 * uplink, or a node port that never linked, was not visible anywhere in this
 * interface, so the first symptom is a node that cannot be reached while the
 * BMC answers fine.
 *
 * Ports are grouped by kind, because the two kinds fail differently: an
 * uplink down means this board is cut off from the network, a node port down
 * means one module is.
 */
export default function SwitchPorts() {
  const { t } = useTranslation();
  const { data: ports, isPending, isError } = useSwitchPortsQuery();

  const groups = ports
    ? [
        {
          key: "node",
          label: t("network.switchNodePorts"),
          ports: ports.filter((port) => port.kind === "node"),
        },
        {
          key: "uplink",
          label: t("network.switchUplinkPorts"),
          ports: ports.filter((port) => port.kind === "uplink"),
        },
        // A kind bmcd grows later still gets rendered rather than dropped
        // on the floor by a filter that only knows about two of them.
        {
          key: "other",
          label: t("network.switchOtherPorts"),
          ports: ports.filter(
            (port) => port.kind !== "node" && port.kind !== "uplink"
          ),
        },
      ].filter((group) => group.ports.length > 0)
    : [];

  const unprobed = ports?.some((port) => !port.present) ?? false;
  const empty = ports?.length === 0;

  return (
    <div>
      <div className="mb-6 text-lg font-bold">{t("network.switchPorts")}</div>

      {isPending && <PortsSkeleton />}

      {isError && (
        <p className="text-sm opacity-60">
          {t("network.switchPortsUnavailable")}
        </p>
      )}

      {(unprobed || empty) && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-red-500 bg-red-500 p-4 text-neutral-100 dark:border-red-900 dark:bg-red-900">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">{t("network.switchNotProbed")}</p>
            <p className="mt-1">
              {empty
                ? t("network.switchNoPorts")
                : t("network.switchNotProbedDescription")}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-1 text-sm font-semibold lowercase opacity-60">
              {group.label}
            </div>
            <dl>
              {group.ports.map((port) => (
                <TableItem key={port.name} term={port.name}>
                  <PortStatus port={port} />
                </TableItem>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
