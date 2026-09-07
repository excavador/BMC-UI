import { createLazyFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import NetworkSkeleton from "@/components/skeletons/network";
import SwitchPorts from "@/components/SwitchPorts";
import TableItem from "@/components/TableItem";
import TabView from "@/components/TabView";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useInfoTabData } from "@/lib/api/get";
import { useNetworkResetMutation } from "@/lib/api/set";

export const Route = createLazyFileRoute("/_tabLayout/network")({
  component: Network,
  errorComponent: () => <div>Error loading Network</div>,
  pendingComponent: NetworkSkeleton,
});

/**
 * How the board is connected.
 *
 * These two panels were the second half of the Info page, which had grown to
 * six sections and answered two unrelated questions at once: what condition
 * the board is in, and how it is wired. Storage, health, the fan and the
 * reboot buttons stayed there; the addresses and the switch came here,
 * because a person looking for one of them is not looking for the other.
 *
 * The addresses come from `type=info`, the same endpoint and the same cached
 * query the Info page reads for its storage volumes -- `useInfoTabData` is
 * named for the endpoint, not for the page, and both routes share one entry
 * in the query cache rather than fetching twice. Reset Network invalidates
 * that key, so the Info page's storage rows stay current whichever tab the
 * reset was pressed from.
 */
export function Network() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data } = useInfoTabData();
  const { mutate: mutateResetNetwork, isPending: resetNetworkPending } =
    useNetworkResetMutation();

  const handleResetNetwork = () => {
    mutateResetNetwork(undefined, {
      onSuccess: () => {
        toast({
          title: t("network.resetNetworkButton"),
          description: t("network.resetNetworkSuccess"),
        });
      },
      onError: (e) => {
        toast({
          title: t("network.resetNetworkButton"),
          description: e.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <TabView title={t("network.header")}>
      <div>
        <div className="mb-6 text-lg font-bold">
          {t("network.networkInterfaces")}
        </div>
        <div className="space-y-4">
          {data.ip.map((ip) => (
            <dl key={ip.device}>
              <TableItem term={ip.device} />
              <TableItem term="ip">{ip.ip}</TableItem>
              <TableItem term="mac">{ip.mac}</TableItem>
            </dl>
          ))}
        </div>
        <div className="mt-4">
          <Button
            type="button"
            onClick={() => handleResetNetwork()}
            isLoading={resetNetworkPending}
            disabled={resetNetworkPending}
          >
            {t("network.resetNetworkButton")}
          </Button>
        </div>
      </div>

      <SwitchPorts />
    </TabView>
  );
}
