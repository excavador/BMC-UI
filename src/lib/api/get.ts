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
