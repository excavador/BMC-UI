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
import { eepromLabel, versionLabel } from "@/lib/format";

import { version as packageVersion } from "../../../package.json";

// What this build actually is. vite.config.ts injects the release tag when
// one is known; package.json is upstream's and is not bumped by this fork, so
// on its own it would report every build of ours as upstream's v3.3.7.
declare const __BMC_UI_VERSION__: string | null;
const version = __BMC_UI_VERSION__ ?? packageVersion;

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
          {eepromLabel(data.board_model)} ({versionLabel(data.board_revision)})
        </TableItem>
        <TableItem term={t("about.boardSerial")}>
          {eepromLabel(data.board_serial)}
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
