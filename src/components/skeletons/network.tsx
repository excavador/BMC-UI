import TabView from "../TabView";

/**
 * The Network tab while `type=info` is still in flight.
 *
 * Only the interface list is drawn. The switch panel below it is a plain
 * `useQuery` rather than a suspense one, so it never reaches this state: it
 * mounts with the rest of the page and draws its own pending rows.
 */
export default function NetworkSkeleton() {
  return (
    <TabView>
      <div>
        <div className="mb-8 h-7 w-2/5 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
        <div className="mb-6 h-7 w-40 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
        <div className="flex flex-row border-b border-neutral-200 pb-3 dark:border-neutral-700">
          <div className="w-1/2 lg:w-1/4">
            <div className="h-6 w-10 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
          </div>
        </div>
        <div className="flex flex-row border-b border-neutral-200 py-3 dark:border-neutral-700">
          <div className="w-1/2 lg:w-1/4">
            <div className="h-6 w-10 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
          </div>
          <div className="h-6 w-48 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
        </div>
        <div className="flex flex-row py-3">
          <div className="w-1/2 lg:w-1/4">
            <div className="h-6 w-10 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
          </div>
          <div className="h-6 w-48 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
        </div>
        <div className="mt-4">
          <div className="h-9 w-36 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700"></div>
        </div>
      </div>
    </TabView>
  );
}
