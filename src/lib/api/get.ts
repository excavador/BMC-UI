import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { useAxiosWithAuth } from "./_core";

interface APIResponse<T> {
  response: {
    result: T;
  }[];
}

interface USBTabResponse {
  bus_type: "Single bus" | "Usb hub";
  mode: "Host" | "Device" | "Flash";
  node: "Node 1" | "Node 2" | "Node 3" | "Node 4";
  route: "Bmc" | "AlternativePort";
}

interface PowerTabResponse {
  node1: "0" | "1";
  node2: "0" | "1";
  node3: "0" | "1";
  node4: "0" | "1";
}

interface AboutTabResponse {
  board_model: string;
  board_revision: string;
  /** Absent on an unprogrammed board, and on any bmcd older than ours. */
  board_serial: string | null;
  hostname: string;
  api: string;
  version: string;
  buildtime: Date;
  buildroot: string;
  build_version: string;
}

export interface FlashStatus {
  Transferring?: {
    id: number;
    process_name: string;
    size: number;
    cancelled: boolean;
    bytes_written: number;
  };
  Done?: [{ secs: number; nanos: number }, number];
  Error?: string;
}

/**
 * One half of the board's A/B firmware layout, as `type=firmware_slots`
 * reports it.
 *
 * `version` is null whenever the version cannot be read rather than whenever
 * it is empty, and on the rollback slot that is the normal case: the volume
 * is not mounted, so nothing on the board can open the file that carries it.
 * The volume name and its size are what is left, and they are what gets
 * rendered -- a guessed version on the slot a rollback would land on is the
 * one number in this panel that must never be invented.
 */
export interface FirmwareSlot {
  /** The UBI volume name, e.g. "rootfs" or "rootfs_prev". */
  volume: string;
  volume_id: number;
  /** Null when the volume could not be read, not when it is blank. */
  version: string | null;
  size_bytes: number;
}

/**
 * The verdict the board's boot-time health gate reached the last time it
 * promoted a slot: when it ran, and what it decided.
 *
 * `timestamp` arrives as the board's own `date(1)` output rather than as
 * ISO 8601, so it is rendered verbatim. Handing that string to `new Date()`
 * would print "Invalid Date" on any engine that parses it differently, and
 * the board's own words are more use here than a reformatting of them.
 */
export interface FirmwarePromotion {
  timestamp: string;
  message: string;
}

/** What the daemon sends. Every key is allowed to be missing. */
interface FirmwareSlotsWire {
  running?: FirmwareSlot | null;
  rollback?: FirmwareSlot | null;
  update_staged?: boolean | null;
  nextboot?: string | null;
  present?: boolean | null;
  last_promotion?: FirmwarePromotion | null;
}

/**
 * The A/B firmware state, normalised so every field is answerable.
 *
 * `update_staged` is a three-valued field on purpose. True means the next
 * reboot switches slots; false means it does not; **null means the boot
 * environment could not be read**, which is not the same claim and must not
 * be drawn as "no". A panel that renders a failed read as a reassuring "no"
 * is how a board reboots into firmware nobody expected.
 */
export interface FirmwareSlotsResponse {
  running: FirmwareSlot | null;
  rollback: FirmwareSlot | null;
  update_staged: boolean | null;
  nextboot: string | null;
  present: boolean;
  last_promotion: FirmwarePromotion | null;
}

interface InfoTabResponse {
  ip: { device: string; ip: string; mac: string }[];
  storage: { name: string; total_bytes: number; bytes_free: number }[];
}

/**
 * One port of the on-board switch, as `type=network` reports it.
 *
 * `node1`..`node4` carry a compute module each; `ge0`/`ge1` are the uplinks.
 * `present` is the switch driver's own answer to "did I probe this port": it
 * is false when the driver never came up, which is a different and much worse
 * condition than a port that probed and has no link.
 */
export interface SwitchPort {
  name: string;
  kind: "node" | "uplink";
  present: boolean;
  link: boolean;
  /** The kernel operstate, e.g. "up", "down", "lowerlayerdown". */
  operstate: string;
  /** Null whenever the port is not linked; there is no speed to report. */
  speed_mbps: number | null;
  duplex: string | null;
  rx_bytes: number;
  tx_bytes: number;
  rx_errors: number;
  tx_errors: number;
}

interface NetworkTabResponse {
  ports: SwitchPort[];
}

interface CoolingDevice {
  device: string;
  max_speed: number;
  speed: number;
}

/**
 * One thermal sensor, as `type=thermal` reports it.
 *
 * Until this week no Turing Pi 2 could measure its own temperature at all:
 * the SoC thermal sensor was missing from every device tree, so the fan ran
 * flat out with nothing to regulate against. `bmc-thermal` is that sensor,
 * now that it exists.
 *
 * `present` is the daemon's answer to "did the read succeed". It is false
 * when the zone is declared but unreadable, and `temperature_c` means
 * nothing in that case -- which is why it is checked before the number is
 * ever formatted. A board that cannot measure must not be shown as 0 degrees.
 */
export interface ThermalSensor {
  name: string;
  /** Degrees Celsius, one decimal. Meaningless unless `present`. */
  temperature_c: number;
  present: boolean;
}

/**
 * One cooling device as the kernel's thermal layer sees it.
 *
 * The same fan `type=cooling` exposes, reported the other way round: as the
 * discrete step the thermal governor has it at, out of the steps the device
 * tree declares. `type=cooling` reports the setpoint somebody wrote;
 * `cur_state` here is where the fan actually is, which on firmware carrying
 * a thermal cooling-map is whatever the governor last decided rather than
 * whatever was last written.
 */
export interface ThermalCooling {
  name: string;
  cur_state: number;
  max_state: number;
  present: boolean;
}

/**
 * Both lists are allowed to be empty, and empty is not an error: it is the
 * correct answer from any board or firmware that predates the thermal
 * sensor. It means "cannot measure", which the interface has to render as
 * unavailable rather than as a reading of zero.
 */
export interface ThermalResponse {
  sensors: ThermalSensor[];
  cooling: ThermalCooling[];
}

/**
 * The kernel load average, as `type=health` reports it.
 *
 * `present` is the daemon's answer to "could I read /proc/loadavg", not a
 * claim about the numbers. A board that could not read it must not render as
 * an idle one.
 */
export interface HealthLoad {
  one_minute: number;
  five_minutes: number;
  fifteen_minutes: number;
  present: boolean;
}

/**
 * The BMC's own RAM.
 *
 * This board has 116 MB of it in total, and that is not a decoration: a
 * firmware upload has already failed on this machine for want of memory,
 * while every page of this interface said the board was fine. `available` is
 * the kernel's own estimate of what a new allocation could actually get, so
 * `total - available` is what is in use and not reclaimable, and that is the
 * number the bar draws. `free` is the smaller, less useful figure and is
 * shown beside it rather than instead of it.
 */
export interface HealthMemory {
  total_bytes: number;
  free_bytes: number;
  available_bytes: number;
  present: boolean;
}

/**
 * The NAND the firmware lives on, in the eraseblocks UBI counts it in.
 *
 * On a board that is reflashed often this is the number that runs out. Bad
 * eraseblocks are the ones that never come back; reserved ones are the pool
 * held aside to replace them.
 */
export interface HealthNand {
  total_eraseblocks: number;
  available_eraseblocks: number;
  bad_eraseblocks: number;
  reserved_eraseblocks: number;
  eraseblock_size_bytes: number;
  available_bytes: number;
  present: boolean;
}

/** One real-time clock device the board carries. */
export interface HealthRtc {
  device: string;
  name: string;
}

/**
 * The board's clock, and what is keeping it.
 *
 * `synchronised` is three-valued. True and false are chrony's answer; **null
 * means chrony could not be reached**, which is a different fact and must not
 * be drawn as "not synchronised" -- one says the clock is wrong, the other
 * says nobody knows.
 *
 * `offset_seconds` arrives from serde in exponent form for small values; see
 * `offsetReading` in `src/lib/format.ts`.
 */
export interface HealthClock {
  synchronised: boolean | null;
  source: string | null;
  stratum: number | null;
  offset_seconds: number | null;
  /** How the offset was obtained, e.g. "chronyc tracking". */
  measured_by: string | null;
  rtc: HealthRtc[];
}

/** What the daemon sends. Every key, and every sub-key, may be missing. */
interface HealthWire {
  uptime_seconds?: number | null;
  load?: HealthLoad | null;
  memory?: HealthMemory | null;
  nand?: HealthNand | null;
  clock?: (Partial<HealthClock> & { rtc?: HealthRtc[] | null }) | null;
}

/**
 * Board health, normalised so every section is answerable.
 *
 * A null section means the daemon did not report it at all, which is not the
 * same as a section that reported `present: false` -- the first is an older
 * daemon, the second is a board that tried and could not read. Both render as
 * words rather than as zeroes.
 */
export interface HealthResponse {
  uptime_seconds: number | null;
  load: HealthLoad | null;
  memory: HealthMemory | null;
  nand: HealthNand | null;
  clock: HealthClock | null;
}

export interface NodeInfoResponse {
  module_name: string | null;
  name: string | null;
  power_on_time: number | null;
  uart_baud: string | null;
}

export function useUSBTabData() {
  const api = useAxiosWithAuth();

  return useSuspenseQuery({
    queryKey: ["usbTabData"],
    queryFn: async () => {
      const response = await api.get<APIResponse<USBTabResponse[]>>("/bmc", {
        params: {
          opt: "get",
          type: "usb",
        },
      });
      return response.data.response[0].result[0];
    },
  });
}

export function usePowerTabData() {
  const api = useAxiosWithAuth();

  return useSuspenseQuery({
    queryKey: ["powerTabData"],
    queryFn: async () => {
      const response = await api.get<APIResponse<PowerTabResponse>>("/bmc", {
        params: {
          opt: "get",
          type: "power",
        },
      });
      return response.data.response[0].result;
    },
  });
}

export function useAboutTabData() {
  const api = useAxiosWithAuth();

  return useSuspenseQuery({
    queryKey: ["aboutTabData"],
    staleTime: 1000 * 60 * 60, // Valid for 1 hour
    queryFn: async () => {
      const response = await api.get<APIResponse<AboutTabResponse>>("/bmc", {
        params: {
          opt: "get",
          type: "about",
        },
      });
      return {
        ...response.data.response[0].result,
        buildtime: new Date(response.data.response[0].result.buildtime),
      };
    },
  });
}

export function useInfoTabData() {
  const api = useAxiosWithAuth();

  return useSuspenseQuery({
    queryKey: ["infoTabData"],
    queryFn: async () => {
      const response = await api.get<APIResponse<InfoTabResponse>>("/bmc", {
        params: {
          opt: "get",
          type: "info",
        },
      });
      return response.data.response[0].result;
    },
  });
}

export function useNodesTabData() {
  const api = useAxiosWithAuth();

  return useSuspenseQuery({
    queryKey: ["nodesTabData"],
    queryFn: async () => {
      const response = await api.get<APIResponse<NodeInfoResponse[]>>("/bmc", {
        params: {
          opt: "get",
          type: "node_info",
        },
      });
      return response.data.response[0].result;
    },
  });
}

export function useFlashStatusQuery(enabled: boolean) {
  const api = useAxiosWithAuth();

  return useQuery({
    queryKey: ["flashStatus"],
    staleTime: 1000, // Valid for 1 second
    queryFn: async () => {
      const response = await api.get<FlashStatus>("/bmc", {
        params: {
          opt: "get",
          type: "flash",
        },
      });
      return response.data;
    },
    refetchInterval: 1000, // Refetch every 1 second
    enabled, // Enable/disable the query based on the provided boolean value
  });
}

export function useFirmwareStatusQuery(enabled: boolean) {
  const api = useAxiosWithAuth();

  return useQuery({
    queryKey: ["firmwareStatus"],
    staleTime: 1000, // Valid for 1 second
    queryFn: async () => {
      const response = await api.get<FlashStatus>("/bmc", {
        params: {
          opt: "get",
          type: "firmware",
        },
      });
      return response.data;
    },
    refetchInterval: 1000, // Refetch every 1 second
    enabled, // Enable/disable the query based on the provided boolean value
  });
}

/**
 * Which firmware slot is running, and what a rollback would land on.
 *
 * `type=firmware_slots` is new in our bmcd fork, so this is a plain
 * `useQuery` for the reason the switch and thermal panels are: a suspense
 * query that throws takes the whole route to its error component, and on this
 * route that would mean losing the upload form -- the one control the page
 * exists for -- because a status panel could not be filled in.
 *
 * Polled at ten seconds rather than the five the Info page uses. Slot state
 * moves at the pace of a flash or a reboot, not of a fan, and the one
 * transition worth catching from this page is `update_staged` turning true
 * once an upload finishes writing. Ten seconds catches that well inside the
 * time it takes to read the panel, on a board with 116 MB of RAM that is
 * being asked to write firmware at the same moment.
 *
 * Missing keys are normalised rather than trusted. `present` in particular
 * falls back to the evidence -- a running slot is what an A/B layout looks
 * like -- because the panel must neither invent slots nor hide ones the
 * daemon actually sent.
 */
export function useFirmwareSlotsQuery() {
  const api = useAxiosWithAuth();

  return useQuery({
    queryKey: ["firmwareSlots"],
    queryFn: async () => {
      const response = await api.get<APIResponse<FirmwareSlotsWire>>("/bmc", {
        params: {
          opt: "get",
          type: "firmware_slots",
        },
      });
      const result = response.data.response[0].result;
      return {
        running: result.running ?? null,
        rollback: result.rollback ?? null,
        update_staged: result.update_staged ?? null,
        nextboot: result.nextboot ?? null,
        present: result.present ?? Boolean(result.running),
        last_promotion: result.last_promotion ?? null,
      } satisfies FirmwareSlotsResponse;
    },
    // Stop polling once it has failed: an older daemon answers the same way
    // in ten seconds' time, and a panel reporting its own absence has no
    // reason to keep asking.
    refetchInterval: (query) => (query.state.error ? false : 10000),
    retry: false,
  });
}

export function useCoolingDevicesQuery() {
  const api = useAxiosWithAuth();

  return useSuspenseQuery({
    queryKey: ["coolingDevices"],
    queryFn: async () => {
      const response = await api.get<APIResponse<CoolingDevice[]>>("/bmc", {
        params: {
          opt: "get",
          type: "cooling",
        },
      });
      return response.data.response[0].result;
    },
  });
}

/**
 * Board temperature and the cooling devices the kernel drives from it.
 *
 * `useQuery`, not `useSuspenseQuery`, for the same reason the switch panel
 * is one: `type=thermal` exists only in our bmcd fork, and a suspense query
 * that throws takes the whole Info route to its `errorComponent` -- storage,
 * fans, addresses and the reboot buttons vanishing because a temperature was
 * unavailable. The card degrades to one line of prose instead.
 *
 * Polled at five seconds, because a temperature read once when the tab was
 * opened is not a temperature. It is also what makes the fan's step honest:
 * the kernel governor re-asserts the fan from the temperature on its own
 * schedule, so a manual setting is undone within seconds, and a card that
 * only read the fan at mount would show the setting rather than the fan.
 *
 * Missing lists are normalised to empty ones. A daemon that answers this
 * endpoint at all is ours, but "answers it" and "sends both keys" are
 * different promises, and `undefined.length` is not a useful failure.
 */
export function useThermalQuery() {
  const api = useAxiosWithAuth();

  return useQuery({
    queryKey: ["thermal"],
    queryFn: async () => {
      const response = await api.get<APIResponse<ThermalResponse>>("/bmc", {
        params: {
          opt: "get",
          type: "thermal",
        },
      });
      const result = response.data.response[0].result;
      return {
        sensors: result.sensors ?? [],
        cooling: result.cooling ?? [],
      };
    },
    // Stop polling once it has failed: an older daemon answers the same way
    // in five seconds' time, and a card reporting its own absence has no
    // reason to keep asking.
    refetchInterval: (query) => (query.state.error ? false : 5000),
    retry: false,
  });
}

/**
 * Switch port state.
 *
 * `useQuery`, not `useSuspenseQuery` like the rest of this file, on purpose.
 * `type=network` is new in our bmcd fork, so an older daemon answers it with
 * an error -- and a suspense query that throws takes the whole Info route to
 * its `errorComponent`, losing storage, fans, addresses and the reboot
 * buttons along with the panel. A panel that reports its own absence is worth
 * more than one that takes the page down with it.
 *
 * Polled, unlike the other Info queries, because link state is the point:
 * a panel showing an uplink that came back three minutes ago as still down is
 * worse than no panel. Five seconds is slow enough to be free on a BMC and
 * fast enough that a cable pull is visible before you reach for the page.
 */
/**
 * How the BMC itself is doing: uptime, load, memory, NAND and the clock.
 *
 * `type=health` is new in our bmcd fork, so this is a plain `useQuery` for
 * the reason the switch and thermal panels are: a suspense query that throws
 * takes the whole Info route to its error component, and losing storage, the
 * fan and the reboot buttons because a load average was unavailable is a bad
 * trade. Five seconds, the same cadence as the two panels beside it, so the
 * page has one tick rather than three.
 *
 * Each section is normalised to null when absent, and the clock is rebuilt
 * field by field because it is the one section whose sub-keys carry meaning
 * when missing: `synchronised` has to stay three-valued through this, and
 * `rtc` has to become an empty list rather than an undefined one.
 */
export function useHealthQuery() {
  const api = useAxiosWithAuth();

  return useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await api.get<APIResponse<HealthWire>>("/bmc", {
        params: {
          opt: "get",
          type: "health",
        },
      });
      const result = response.data.response[0].result;
      const clock = result.clock;
      return {
        uptime_seconds: result.uptime_seconds ?? null,
        load: result.load ?? null,
        memory: result.memory ?? null,
        nand: result.nand ?? null,
        clock: clock
          ? {
              synchronised: clock.synchronised ?? null,
              source: clock.source ?? null,
              stratum: clock.stratum ?? null,
              offset_seconds: clock.offset_seconds ?? null,
              measured_by: clock.measured_by ?? null,
              rtc: clock.rtc ?? [],
            }
          : null,
      } satisfies HealthResponse;
    },
    // Stop polling once it has failed, as the panels beside it do: an older
    // daemon answers the same way in five seconds' time.
    refetchInterval: (query) => (query.state.error ? false : 5000),
    retry: false,
  });
}

export function useSwitchPortsQuery() {
  const api = useAxiosWithAuth();

  return useQuery({
    queryKey: ["switchPorts"],
    queryFn: async () => {
      const response = await api.get<APIResponse<NetworkTabResponse>>("/bmc", {
        params: {
          opt: "get",
          type: "network",
        },
      });
      return response.data.response[0].result.ports;
    },
    // Stop polling once it has failed: an older daemon will fail the same
    // way in five seconds' time, and a panel reporting its own absence has no
    // reason to keep asking a BMC that has already answered.
    refetchInterval: (query) => (query.state.error ? false : 5000),
    retry: false,
  });
}

export function useUSBNode1Query() {
  const api = useAxiosWithAuth();

  return useSuspenseQuery({
    queryKey: ["usbNode1"],
    queryFn: async () => {
      const response = await api.get<APIResponse<boolean>>("/bmc", {
        params: {
          opt: "get",
          type: "usb_node1",
        },
      });

      return response.data.response[0].result;
    },
  });
}

/**
 * The state of bmcd's UART reader task, per node.
 *
 * `Initialized` is a task that exists and has not started reading;
 * `Running` is one that is reading; `Stopped` is one that has ended. Typed
 * as a plain string rather than a union of those three, on purpose: nothing
 * checks the wire at runtime, and a daemon that grows a fourth state should
 * put that state on the screen rather than have it narrowed away into a
 * value the renderer believes is one of three.
 */
export type SerialReaderState = string;

/**
 * Whether the daemon is reading each node's UART.
 *
 * `POST`, not `GET`, and not because anything is being changed -- that is
 * simply the method bmcd exposes `/api/bmc/serial/status` under. It sits in
 * this file rather than `set.ts` because it reads.
 *
 * This says nothing about the modules. It reports the liveness of four
 * reader tasks inside bmcd: a node that is powered off, or booted and
 * silent, has a reader in exactly the same state as one mid-boot. It is
 * worth showing because a `Stopped` reader explains an empty terminal that
 * no amount of looking at the module would, and it must not be labelled as
 * module health.
 *
 * `useQuery`, like the other endpoints new in our bmcd fork, so a daemon
 * that does not have it degrades to one line of prose instead of taking the
 * route to its `errorComponent`. A non-array body is normalised away for the
 * same reason: an older daemon answering this path with something else must
 * not put `undefined` in a status cell.
 */
export function useSerialStatusQuery() {
  const api = useAxiosWithAuth();

  return useQuery({
    queryKey: ["serialStatus"],
    queryFn: async () => {
      const response =
        await api.post<SerialReaderState[]>("/bmc/serial/status");
      return Array.isArray(response.data) ? response.data : [];
    },
    // Stop polling once it has failed: an older daemon answers the same way
    // in five seconds' time.
    refetchInterval: (query) => (query.state.error ? false : 5000),
    retry: false,
  });
}
