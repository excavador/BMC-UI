import { createLazyFileRoute } from "@tanstack/react-router";
import TimeAgo from "javascript-time-ago";
import de from "javascript-time-ago/locale/de";
import en from "javascript-time-ago/locale/en";
import es from "javascript-time-ago/locale/es";
import nl from "javascript-time-ago/locale/nl";
import pl from "javascript-time-ago/locale/pl";
import zh from "javascript-time-ago/locale/zh";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import AboutSkeleton from "@/components/skeletons/about";
import TableItem from "@/components/TableItem";
import TabView from "@/components/TabView";
import { useAboutTabData } from "@/lib/api/get";

import { version } from "../../../package.json";

export const Route = createLazyFileRoute("/_tabLayout/about")({
  component: About,
  pendingComponent: AboutSkeleton,
});

TimeAgo.addDefaultLocale(en);
TimeAgo.addLocale(de);
TimeAgo.addLocale(es);
TimeAgo.addLocale(nl);
TimeAgo.addLocale(pl);
TimeAgo.addLocale(zh);

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
function versionLabel(value: string | undefined | null): string {
  if (value === null || value === undefined || value === "") return "\u2014";
  return value.startsWith("v") ? value : `v${value}`;
}

export function About() {
  const {
    t,
    i18n: { language },
  } = useTranslation();
  const { data } = useAboutTabData();

  const timeAgo = useMemo(() => new TimeAgo(language), [language]);

  return (
    <TabView>
      <dl className="flex flex-col">
        <TableItem term={t("about.boardModel")}>
          {data.board_model} (v{data.board_revision})
        </TableItem>
        <TableItem term={t("about.hostname")}>{data.hostname}</TableItem>
        <TableItem term={t("about.daemonVersion")}>
          {versionLabel(data.version)}
        </TableItem>
        <TableItem term={t("about.buildTime")}>
          {data.buildtime.toLocaleString()} (
          {timeAgo.format(new Date(data.buildtime))})
        </TableItem>
        <TableItem term={t("about.buildVersion")}>
          {versionLabel(data.build_version)}
        </TableItem>
        <TableItem term={t("about.buildrootRelease")}>
          {data.buildroot}
        </TableItem>
        <TableItem term={t("about.apiVersion")}>
          {versionLabel(data.api)}
        </TableItem>
        <TableItem term={t("about.bmcUI")}>{versionLabel(version)}</TableItem>
      </dl>
    </TabView>
  );
}
