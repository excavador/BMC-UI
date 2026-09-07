import "@xterm/xterm/css/xterm.css";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/**
 * What the socket is doing, as four states a reader can act on.
 *
 * A terminal that has gone quiet is ambiguous -- a module can be silent for
 * hours and look exactly like a socket that closed under it. So the state is
 * rendered beside the terminal at all times rather than inferred from the
 * absence of output.
 *
 * `closed` and `failed` are kept apart deliberately. `closed` is a socket
 * that opened and then ended: the daemon restarted, the heartbeat lapsed, the
 * network went away. `failed` is a socket that never opened at all, which on
 * this endpoint almost always means the handshake was rejected.
 */
type ConnectionState = "connecting" | "open" | "closed" | "failed";

/**
 * The session token goes into a WebSocket subprotocol name, and subprotocol
 * names are RFC 6455 tokens -- a restricted character set the browser
 * validates before it sends anything. bmcd's session id is 64 characters of
 * `[A-Za-z0-9]`, which is well inside that, but a token read back from
 * storage is not something this code controls: a stray quote or space would
 * make `new WebSocket(...)` throw a SyntaxError rather than fail a
 * connection, and a thrown constructor inside an effect takes the page down
 * instead of showing a state. Checked first, and reported as a failure.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9]+$/;

/**
 * The terminal draws its own text, so it cannot inherit the page's font
 * stack: it needs a monospace face and this fork ships only Inter. A system
 * stack is the whole answer -- shipping a terminal webfont would add a
 * seventh `.woff2` to a firmware image that is already 78 % of its slot, to
 * render characters every platform can draw from a font it already has.
 */
const MONOSPACE =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** Terminal colours for the light theme, taken from the page's own palette. */
const LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#171717",
  cursor: "#171717",
  cursorAccent: "#ffffff",
  selectionBackground: "#d4d4d4",
};

/** The same, for dark: `bg-neutral-900` on `text-neutral-100`. */
const DARK_THEME = {
  background: "#171717",
  foreground: "#f5f5f5",
  cursor: "#f5f5f5",
  cursorAccent: "#171717",
  selectionBackground: "#404040",
};

/** How a close event arrived, kept unrendered so it survives a language switch. */
interface CloseInfo {
  code: number;
  reason: string;
}

/**
 * One module's serial console.
 *
 * The daemon exposes the UART as a WebSocket at
 * `/api/bmc/serial/ws?node=<0..3>`, authenticated by a second subprotocol
 * entry -- `bmcd.bearer.<session token>` -- because a browser cannot put an
 * `Authorization` header on a WebSocket handshake. The first entry has to be
 * a plain name (`bmcd.serial.v1`): the server selects the first offered entry
 * that is not a bearer, and a handshake with nothing to select is one the
 * browser rejects.
 *
 * Server to client is raw UART bytes in binary frames, so they go to the
 * terminal untouched. Client to server is whatever the terminal produced,
 * forwarded verbatim with no line ending appended -- which is the whole
 * reason this exists rather than the REST endpoint documented below it:
 * Ctrl-C, tab completion and the arrow keys are bytes, and a writer that
 * appends CRLF cannot send them.
 *
 * The panel is mounted with `key={node}` by the route, so selecting another
 * module unmounts this one: the terminal is disposed and the socket closed
 * together, and nothing from the old node can land in the new node's buffer.
 */
export default function SerialConsole({ node }: { node: number }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { resolvedTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const [state, setState] = useState<ConnectionState>("connecting");
  const [closeInfo, setCloseInfo] = useState<CloseInfo | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);

  // Bumped by the reconnect button. It is a dependency of the socket effect
  // and of nothing else, so a reconnect tears down the socket and builds a
  // new one while the terminal -- and everything already scrolled into it --
  // stays exactly where it is.
  const [generation, setGeneration] = useState(0);

  const usable = token !== null && TOKEN_PATTERN.test(token);
  const dark = resolvedTheme === "dark";

  // With no usable token there is no socket to have a state, so the panel's
  // state is derived rather than stored. Writing "failed" into state from
  // the effect would be a render triggering a render, which is what
  // `react-hooks/set-state-in-effect` is there to catch; every other
  // transition below is written from a socket callback or a click, which is
  // where a state change belongs.
  const shown: ConnectionState = usable ? state : "failed";

  // The terminal, created once and disposed on unmount. Deliberately not
  // keyed on the node: this component is what gets replaced when the node
  // changes, so a terminal that outlived a node switch would be a bug.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: MONOSPACE,
      fontSize: 13,
      // A module's boot is a few hundred lines and the daemon holds only the
      // last 16 KiB, so scrollback here is the only place a full boot can be
      // read back.
      scrollback: 5000,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);

    terminalRef.current = terminal;
    fitRef.current = fit;

    // The first fit has to wait for a size: `open()` measures a cell, and a
    // container that has not been laid out yet measures zero and proposes
    // nothing. The observer fires once on observe, which is that first fit,
    // and again on every later resize.
    const observer = new ResizeObserver(() => {
      fit.fit();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      terminalRef.current = null;
      fitRef.current = null;
      terminal.dispose();
    };
  }, []);

  // Theme changes are an option write, not a rebuild: re-creating the
  // terminal to change its colours would throw away the scrollback.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.theme = dark ? DARK_THEME : LIGHT_THEME;
    }
  }, [dark]);

  // The socket. Runs after the effect above, so the terminal it writes into
  // already exists; a token that cannot be put in a subprotocol name means
  // there is nothing to connect with and the panel renders `failed` instead.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !usable) return;

    // Same origin as the page, so the scheme follows the page's: the BMC
    // serves this over TLS, a `vite dev` proxy does not.
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${scheme}//${window.location.host}/api/bmc/serial/ws?node=${node}`,
      // Credential last. The daemon selects the first entry that is not a
      // `bmcd.bearer.` one, so the plain name has to be offered and has to
      // come first.
      ["bmcd.serial.v1", `bmcd.bearer.${token}`]
    );
    // Binary frames as ArrayBuffers rather than Blobs: a Blob would have to
    // be read asynchronously, which reorders UART output.
    socket.binaryType = "arraybuffer";

    let opened = false;
    let errored = false;

    socket.onopen = () => {
      opened = true;
      setState("open");
      setProtocol(socket.protocol === "" ? null : socket.protocol);
      fitRef.current?.fit();
    };

    socket.onmessage = (event: MessageEvent<unknown>) => {
      const target = terminalRef.current;
      if (!target) return;

      // Bytes go to the terminal as bytes. Decoding them here would break
      // any multi-byte sequence a frame happens to split, and the terminal
      // has a decoder that carries state across writes.
      if (event.data instanceof ArrayBuffer) {
        target.write(new Uint8Array(event.data));
      } else if (typeof event.data === "string") {
        target.write(event.data);
      }
    };

    // The event carries nothing a browser is willing to expose. All it is
    // good for is telling a close that follows a failure apart from a clean
    // one, which is the difference between "it ended" and "it never started".
    socket.onerror = () => {
      errored = true;
    };

    socket.onclose = (event) => {
      setState(opened && !errored ? "closed" : "failed");
      setCloseInfo({ code: event.code, reason: event.reason });
    };

    // Keystrokes go to this socket and no other: registered with the socket
    // and disposed with it, so input cannot reach a socket that is closing.
    const input = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    return () => {
      input.dispose();
      // Detached before the close so the teardown does not set state on a
      // component that is unmounting, or overwrite the state the next
      // connection attempt has already set.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    };
  }, [node, token, usable, generation]);

  const stateLabel: Record<ConnectionState, string> = {
    connecting: t("console.stateConnecting"),
    open: t("console.stateOpen"),
    closed: t("console.stateClosed"),
    failed: t("console.stateFailed"),
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className={cn(
              "font-semibold",
              shown === "connecting" && "opacity-60",
              shown === "closed" && "text-amber-600 dark:text-amber-500",
              shown === "failed" && "text-red-600 dark:text-red-400"
            )}
          >
            {stateLabel[shown]}
          </span>

          {shown === "open" && protocol !== null && (
            <span className="text-sm opacity-60">
              {t("console.negotiated", { protocol })}
            </span>
          )}

          {(shown === "closed" || shown === "failed") && closeInfo !== null && (
            <span className="text-sm opacity-60">
              {closeInfo.reason === ""
                ? t("console.closeCode", { code: closeInfo.code })
                : t("console.closeCodeReason", {
                    code: closeInfo.code,
                    reason: closeInfo.reason,
                  })}
            </span>
          )}
        </div>

        <div className="flex gap-4">
          <Button
            type="button"
            variant="bw"
            onClick={() => terminalRef.current?.clear()}
          >
            {t("console.clearButton")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setState("connecting");
              setCloseInfo(null);
              setProtocol(null);
              setGeneration((previous) => previous + 1);
            }}
          >
            {t("console.reconnectButton")}
          </Button>
        </div>
      </div>

      {!usable && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">
          {t("console.noSession")}
        </p>
      )}

      {shown === "failed" && usable && (
        <p className="mb-4 text-sm opacity-60">{t("console.failedHint")}</p>
      )}

      <div
        ref={containerRef}
        role="region"
        aria-label={t("console.ariaTerminal", { nodeId: node + 1 })}
        className="h-96 w-full overflow-hidden rounded-md border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900"
      />

      <p className="mt-2 text-sm opacity-60">{t("console.inputNote")}</p>
    </div>
  );
}
