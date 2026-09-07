# Turing Pi BMC web interface — `excavador` fork

> **This is a fork of [turing-machines/BMC-UI](https://github.com/turing-machines/BMC-UI).**
> `main` tracks upstream. **`hive` is the branch that gets built and released**;
> everything below the fold is upstream's own README, unchanged.
>
> This is the web interface served from `/srv/bmcd/www/` on the BMC. Our
> [firmware fork](https://github.com/excavador/tp2-bmc-firmware) does not build
> it — `bmc-ui.mk` downloads a prebuilt tarball from a GitHub release and pins
> it by sha256. So a fixed UI needs somewhere to publish that tarball from, and
> this is it.
>
> Branched from upstream **v3.3.7** (2025-08-15), which at the time of writing
> is also upstream's newest release and its `main`.

## Nothing here has run on the board

Every number below comes from a build on a workstation. No image containing
this UI has been flashed, so nothing in this fork is verified in a browser
against a real bmcd. Read the tables as "what was changed and how it was
checked", not as "what the board does".

The display bugs behind it *were* observed on hardware — the first three on
firmware `v2.2.0-unstable-hive.5`, the rest on `v2.2.0-unstable-hive.7` — and
that is where they came from. None of the fixes has been. Neither have the two
pieces here that display something no version of this interface has shown
before: the switch panel, written against the documented shape of bmcd's
`type=network` response, and the board temperature, written against
`type=thermal` while that endpoint is still being implemented. Both are
written to a described response shape and a description of what the board
reports, not against a response this code has parsed.

The fan card is a third case and worth separating out, because the facts it
rests on **were** measured on the board, on firmware
`v2.2.0-unstable-hive.8` — the SoC reading about 52 °C, the fan sitting at
step 4 of 6, `cooling-levels = <0 16 32 64 102 170 254>` in the device tree,
and a manual set to maximum that returned `{"result":"ok"}`, read back as 6 of
6, and was back at 4 of 6 eight seconds later. Those are hardware
observations, and they are why the card was rewritten. The card that reports
them has still never run on the board.

The serial console is the fourth case, and the furthest from the board of
any of them. **It has never been connected to a live board** -- not to a
Turing Pi, not to any running bmcd, not to any recorded session. It has never
received a byte of UART output and no module has ever received a keystroke
from it. One part of it *was* exercised: the WebSocket handshake, against a
throwaway server on `127.0.0.1` that implements the documented subprotocol
selection, because that handshake is what a first attempt at this page died
on. Everything from the first byte onwards is written to a description.

That the doubled `v` needed fixing twice is the argument for reading this
section literally. The first pass fixed it where it had been noticed, four
rows on one page, and left the header printing `daemon vv2.2.0-unstable-hive.7`
on every page for another two firmware builds. "Checked by a clean build" is
a real check and it is not the same as having looked.

## What is changed

| change | why | how it was checked |
|---|---|---|
| **The daemon version prints one `v`** | The About page wrapped every version in an unconditional `` `v${...}` ``. Our firmware's `VERSION` already starts with one, so the board showed `vv2.2.0-unstable-hive.5`. Stripping the `v` in the firmware was the wrong end to fix it: `tpi info` prints the same string and our flash scripts verify against it | A helper prefixes `v` only when the value lacks one. It now lives in `src/lib/format.ts` and every render site goes through it — the first pass put it inside `about.lazy.tsx`, where the header could not reach it, and the header went on doubling the `v` until this one. `grep` for a literal `v` in front of a value finds nothing left. `tsc -b` and `eslint` clean; not yet seen in a browser |
| **A missing value renders as `—`, not `vundefined`** | The board showed `Build version: vundefined` because bmcd never populated `build_version`. That is [fixed in our bmcd fork](https://github.com/excavador/bmcd), and the page already reads exactly that field. The dash is so the next missing field looks missing instead of looking like a string | Same helper. The UI side needed no field rename: `data.build_version` goes straight from the API response to the page |
| **The board model has no trailing padding** | `board_model` is a fixed-width EEPROM field and bmcd forwards it byte for byte, so `TuringPi2` arrives with seven NULs after it and the About row read `TuringPi2␀␀␀␀␀␀␀ (v2.5.2)` with the revision pushed out of line. Not a daemon fix: those bytes have been identical for years and `tpi` parses the same JSON, so a trailing-NUL change there is a compatibility risk taken to move whitespace | Stripped for display only, NUL and U+FFFD both. The helper was exercised on the padded, replacement-character, all-padding, null and interior-space cases; not yet seen in a browser |
| **The board serial is on the About page** | bmcd now sends `board_serial`. It is the number an asset register or a support conversation asks for, and until now the only way to read it off a running BMC was over SSH | A row under model and revision. Typed `string \| null`, because an unprogrammed board really does send null, and it renders the same dash an older daemon's missing key does |
| **The switch ports are visible** | The Info page listed the BMC's own addresses and nothing about the six ports the compute modules hang off. A node port that never linked presents as a node you cannot reach while the BMC answers fine, which sends you looking in the wrong place. On the board as it stands, `ge1` is down and no page in this interface says so | A new panel, [described below](#the-switch-panel-in-detail). Built and linted clean, translation keys present in all six locales, helper behaviour exercised in isolation — but **the panel has never received a real response**; see the panel section for exactly what that leaves unverified |
| **The board temperature is on the Info page** | Until this week no Turing Pi 2 could measure its own temperature: the SoC thermal sensor was missing from every device tree, so the fan ran flat out with nothing to regulate against. The sensor and a fan curve exist now and the SoC reads about 52 °C — and the interface showed a fan percentage and no temperature anywhere. A reader looks for it beside the fan, because the fan is what it drives | A `type=thermal` query feeding the Fan Control card, [described below](#the-temperature-and-the-fan-in-detail). Built and linted clean, keys in all six locales, the empty-list and unreadable-sensor paths written before the happy path — but **the card has never received a real response**: the endpoint is being implemented in parallel with this |
| **The fan reads `4 of 6`, not `67%`** | The percentage was wrong twice over. It was `Math.round(state / max_state * 100)` — the step *index* as a fraction — so step 4 of 6 printed as 67 %; and the steps are not evenly spaced, so the real duty at step 4 is 102/254, about 40 %. The number on screen matched neither, and its continuous look invited the reader to believe a seven-position fan could sit anywhere between them | A segmented bar, one filled segment per step, with the step in words beside it. The duty cycle is deliberately **not** shown: the levels table lives in the device tree and no endpoint reports it, so a percentage here would be one board's device tree hardcoded into the interface and presented as a measurement |
| **Automatic fan control is visible** | Firmware hive.8 added a thermal cooling-map, so `step_wise` re-asserts the fan from the temperature every polling interval. Setting the fan through the existing API returns success, reads back correctly, and is silently undone about eight seconds later. A control that reports success and does nothing is worse than no control | The slider is **kept and still works** — on firmware without a cooling-map it is the only fan control there is. What changed is that the card stops hiding the governor: an `automatic` marker on the heading, a standing note that a setting here is an override, and — when a poll that finished *after* a commit disagrees with it — a warning naming the step the board went back to. The slider is what was asked for; the segments are what the fan is doing |
| **A serial console for each module** | This interface can power a module on, flash an image to it and reboot it, and has never shown a line of what it printed. A module that fails before the network comes up — a bad image, the wrong device tree, a panic three seconds in — is invisible from here, and the only recourse is the serial header on the board itself | A new lazy route on `/console` carrying a real terminal, [described below](#the-serial-console-in-detail). Built and linted clean, keys in all six locales, and the handshake the previous attempt at this page died on exercised against a local stand-in — but **the console has never been connected to a live board** |
| **Fonts: 669 KB → 176 KB** | Fonts were 45 % of the bundle on a board with 128 MB of flash, and most of them could not be drawn on any screen this interface renders | See below |
| **A release pipeline** | The firmware pins the UI tarball by sha256 and needs somewhere to fetch it from that is not a dormant upstream | Packaging dry-run against a real build: the tarball unpacks to `dist/`, `sha256sum -c SHA256SUMS` passes, two runs are byte-identical. Nothing has been tagged |
| **`LICENSE` ships inside the tarball** | Upstream's asset omits it while our `.mk` declares `BMC_UI_LICENSE_FILES = LICENSE`, so Buildroot has been looking for a file that was never there. We redistribute a GPL-2.0 work on a device | Buildroot extracts with `--strip-components=1`, so `dist/LICENSE` is exactly where that variable resolves |
| **The toolchain comes from the repo** | Upstream names it twice (`.nvmrc`, `packageManager`) and enforces it neither time. The output here is a hash-pinned artifact, so who builds it matters | `devbox.json` pins nodejs 24.12; `devbox run -- npm ci && npm run build` gives node v24.12.0 and a clean build |

**Not changed: the "Buildroot release" row.** On the board it showed
`Turing Pi v2.2.0` — the firmware name, not a Buildroot version. That is a
daemon bug, and bmcd now sends the real Buildroot version (`2025.02.17`) in
the same `buildroot` field, falling back to the old value on older images. The
page renders that field verbatim, so the label and the value agree again
without a UI change. None of the three bugs was fixed upstream in v3.3.7:
`about.lazy.tsx` is byte-identical to v3.3.6.

## The fonts, in detail

Upstream's `@import '@fontsource/inter/{400,600,700}'` emits **42 files**:
Inter in seven `unicode-range` subsets, in `.woff2` and `.woff`, at three
weights. Not seven typefaces — one, sliced by script.

Two reductions, neither of them a guess:

- **`.woff` dropped** (21 files, 370 KB). It is the fallback for browsers
  without woff2 — IE11, Safari 9. This is a React 19 app built to Vite's
  default baseline target (Chrome 107, Edge 107, Firefox 104, Safari 16); all
  of those have had woff2 for a decade. A browser that cannot parse the
  bundle never reaches the `@font-face` rule.
- **Five subsets dropped** (15 files, 107 KB of woff2). Every non-ASCII
  codepoint in `src/` and `index.html` was enumerated — six locales, 21
  distinct accented letters — and they land in exactly two subsets:

  | subset | kept | evidence |
  |---|---|---|
  | `latin` | **yes** | `ä ö ü ß á é í ó ñ ¡ ¿ ©` — the German, Spanish and Dutch strings |
  | `latin-ext` | **yes** | `ą ć ę ł ń ś ź ż` — the Polish strings |
  | `cyrillic`, `cyrillic-ext` | no | not one codepoint in `U+0400–U+052F` anywhere in the tree; no Russian or Ukrainian locale exists |
  | `greek`, `greek-ext` | no | not one codepoint in `U+0370–U+03FF` or `U+1F00–U+1FFF`; no Greek locale exists |
  | `vietnamese` | no | not one codepoint in `U+1EA0–U+1EF9`; no Vietnamese locale exists |

  The Simplified Chinese locale is not an argument for keeping any of them:
  Inter ships no CJK subset at all, so `zh-Hans` already renders from the
  system font today and this changes nothing for it.

The faces are declared by hand in `src/fonts.css` rather than by importing
fontsource's per-subset stylesheets, because `@fontsource/inter/latin-400.css`
and friends **drop the `unicode-range` descriptor**. Two faces for one family
and weight with no range collide, one wins outright for all text, and the
`latin-ext` file contains no ASCII glyphs. The ranges here are copied verbatim
from fontsource's own `400/600/700.css`, so per-character fallback behaves as
upstream does.

Result — and the six surviving files are byte-identical to the six of the same
name in the previous build, so anything the interface can display renders from
exactly the same bytes:

| | v3.3.7 as upstream ships it | this fork |
|---|---|---|
| total `dist/` | 1477.3 KB, 61 files | **995.1 KB, 25 files** |
| JS | 752.9 KB (14 files) | 752.9 KB (14 files) |
| CSS | 48.9 KB | 44.2 KB |
| fonts | 668.9 KB (21 `.woff2` + 21 `.woff`) | **175.6 KB (6 `.woff2`)** |
| SVG | 20.9 KB (2 logos) | 20.9 KB |
| release tarball | 912,530 B (upstream's v3.3.6 asset) | **442,217 B** |

Those are the figures for the font change itself, measured at the commit
that made it. The dependency review below moved them; see
[Dependencies](#dependencies) for what the build produces now.

### Not verified, and worth knowing

- Node and module names are free text. A name typed in Cyrillic or Greek now
  renders in the system UI font instead of Inter. It degrades to a different
  sans-serif, not to tofu, and it is what already happens to Chinese.
- Nothing here has been rendered in a browser against a live bmcd. The build
  is clean and the CSS was checked to contain six `@font-face` rules, six
  `url()` references, and no reference to any file that is not shipped — but
  that is a build-output check, not a visual one.
- The JS bundle was untouched by the font work: 753 KB, one 649 KB chunk (as
  Vite counts it). The 2026-09-07 minor review took it to 812 KB and one
  698 KB chunk, and called that chunk the obvious next target. The majors
  pass the same day split it: JS is 812 KB across 21 files, the largest of
  them 426 KB, and Vite no longer prints its "chunks are larger than 500 kB"
  warning at all. That was not a code-splitting exercise — it is what vite 8
  emits — so the JS is still 77 % of the output and still the thing to shrink
  if the output ever needs shrinking.

## The switch panel, in detail

`GET /api/bmc?opt=get&type=network` is new in our bmcd fork. It reports the
six ports of the on-board switch — `node1`–`node4` carrying one compute
module each, `ge0` and `ge1` as uplinks — and the Info page now renders all of
them under **Switch Ports**, beside the BMC addresses it already listed. Each
port arrives as `{name, kind, present, link, operstate, speed_mbps, duplex,
rx_bytes, tx_bytes, rx_errors, tx_errors}`.

| what is shown | when |
|---|---|
| the port name, under a node/uplink heading | always. A `kind` bmcd grows later gets its own group rather than being dropped by a filter that knows two |
| link up / down | whenever the port was probed |
| negotiated speed and duplex | when linked. A gigabit port that came up 100/half is a bad cable, and it reads as healthy everywhere else |
| rx/tx bytes, in the jedec units the storage bars already use | whenever the port was probed. They are cumulative, so a down port with traffic behind it is a link that dropped rather than one that never came up |
| rx/tx errors | only when non-zero |
| the kernel `operstate` | only for a down port, and only when it says more than "down". `lowerlayerdown` — what `ge1` reports — is the difference between "nothing plugged in" and "the layer under me is gone" |

The three port states are deliberately not styled alike:

| state | rendering | why |
|---|---|---|
| `present: false` | red, plus an alarm above the list | the switch driver did not probe the port. On the four node ports that is every compute module cut off from the network while the BMC serving this page stays perfectly reachable — the failure that looks like nothing at all. It must not render as an empty table or a blank row |
| probed, `link: false` | amber | normal for an unplugged uplink or a powered-off node, and still worth seeing at a glance |
| probed, `link: true` | plain, with the rate beside it | |

Zero ports at all is treated as that same alarm rather than as nothing to draw.

**One deliberate departure from the rest of `get.ts`.** Every other Info query
is a `useSuspenseQuery`, and a suspense query that throws takes the whole
route to its `errorComponent` — storage, fans, addresses and the reboot
buttons go with it. `type=network` exists only in our bmcd fork, so on an
older daemon that is exactly what would happen. This one is a plain
`useQuery` which renders a line of prose in its own space instead. It is also
the only Info query that polls: five seconds, stopping once it has failed,
because a link state read once when the tab was opened is the thing the panel
exists to avoid.

Everything else is the page's own furniture — `TableItem` rows inside a `dl`,
the red from the toast's destructive variant, `filesize` with the `jedec`
standard the storage section already passes, the muted lowercase label from
the header. No new dependency and no new styling idiom. All sixteen new
strings go through `src/locale/`, in all six locales.

### What the panel leaves unverified

More than anything else in this fork, so it is worth being exact. The panel
has never received a response from a bmcd — not a live one, not a recorded
one. What was checked:

- `tsc -b` and `eslint .` clean, and the build emits the panel's chunk.
- Every `t("…")` key used anywhere in `src/` exists in `en.ts`, and the
  sixteen keys this panel adds — along with the board-serial key added beside
  them — exist in all six locale files. That check was a script over the tree,
  not a reading.
- `versionLabel` and `eepromLabel` were exercised directly on the padded,
  replacement-character, all-padding, null, undefined, empty and
  interior-space cases.

What was not, and what it would cost:

- **No rendered check.** Not in a browser, not in a snapshot. The layout, the
  colours, the wrapping of a six-port list on a phone: all of it is
  build-output reasoning.
- **The wire is not typed.** `SwitchPort` describes what bmcd is documented
  to send; TypeScript checks nothing at runtime. A renamed or missing field
  would render as `undefined` or `NaN` in a cell rather than fail loudly.
- **The alarm has never been seen.** No board has been observed reporting
  `present: false`, so the one state the panel exists to make unmissable is
  the one state nothing has rendered. Same for a port with non-zero errors.
- **`duplex` passes through verbatim** unless it is exactly `full` or `half`,
  which are the only two values translated. A kernel that says something else
  shows that something else, untranslated.
- **The five non-English locales were written without a native reviewer.**
  They are translations, not English placeholders, but they have had one pair
  of eyes.

### Panels pass: proof it still builds

The same battery the dependency passes used, from an empty `node_modules`:
`devbox run -- npm ci && npm run lint && npm run build` clean, `npm audit`
still **zero**, `eslint .` back to the same 3 warnings and 0 errors, `git
status` clean after a build — `routeTree.gen.ts` does not move, because none
of this adds a route. **Two consecutive builds are byte-identical across all
32 files**, which is the assertion the sha256-pinned tarball actually rests
on.

The font pipeline is hand-rolled and a panel is not the kind of change that
should touch it. It did not:

| assertion | before | after |
|---|---|---|
| `@font-face` rules in `dist/` | 6 | **6** |
| `url()` references | 6 | **6** |
| `.woff2` files shipped | 6 | **6** |
| bare `.woff` references | 0 | **0** |
| every `url()` target present in `dist/` | yes | **yes** |
| the six `.woff2` files, byte for byte | — | **all six unchanged** |

The two logo SVGs are byte-identical as well.

| | `hive` | with the panels |
|---|---|---|
| total `dist/` | 1,080,364 B, 32 files | **1,092,645 B, 32 files** |
| JS | 831,246 B (21 files) | 841,359 B (21 files) |
| CSS | 45,788 B | 47,956 B |
| fonts | 179,976 B (6 `.woff2`) | 179,976 B (6 `.woff2`) |
| SVG | 21,355 B (2 logos) | 21,355 B |
| `index.html` | 1,973 B | 1,973 B |
| release tarball | 460,685 B | **463,883 B** |

**+12,281 B, +1.14 %.** Roughly 10 KB of it is JS and 2 KB is CSS. The JS is
the panel plus ninety-six new translation strings across six locales, all of
which ship in the main chunk because `src/locale/` is imported eagerly by
`i18n.ts`; the CSS is the utilities the panel's classes pull in. Both tarball
figures were taken with the same fixed `mtime`, so they are comparable to each
other rather than to the number recorded in the previous section.

## The temperature and the fan, in detail

`GET /api/bmc?opt=get&type=thermal` is new in our bmcd fork and is being
implemented in parallel with this. It answers with two lists:

```json
{"response":[{"result":{"sensors":[
  {"name":"bmc-thermal","temperature_c":52.5,"present":true}
],"cooling":[
  {"name":"pwm-fan","cur_state":4,"max_state":6,"present":true}
]}}]}
```

Both go into the Info page's **Fan Control** card, which until now showed a
slider and a percentage and no temperature at all. That is the right place for
it: the fan is the thing the temperature drives, and a reader who sees
`52.5 °C` above `pwm-fan 4 of 6` understands the machine, where one who sees
`67 %` alone does not.

### Empty is not zero

**Both lists are allowed to be empty, and empty is not an error.** It is the
correct answer from any board or firmware older than this week, and it means
*cannot measure* — which is a different fact from 0 °C and must not be drawn
as a reading. The card has four states and they say four different things:

| state | rendering |
|---|---|
| the request failed | one muted line: this daemon does not report board temperature. The rest of the card, including the fan slider, carries on |
| `sensors` empty | one muted line: this board reports no thermal sensor, so there is no temperature to read, and the fan runs at whatever it was last set to with nothing to regulate against |
| a sensor with `present: false`, or a `temperature_c` that is not a finite number | that sensor's row reads *not detected*, in amber. A daemon that sends null for a sensor it could not read must not produce `0.0 °C` or `NaN °C` on a page whose only job is to say whether the board is hot |
| a present sensor | `52.5 °C`, one decimal, from `toFixed(1)` so a daemon that sends `52` still renders `52.0 °C` |

Neither empty state is drawn as an alarm. That is the deliberate difference
from the switch panel, where zero ports **is** an alarm: a board with no
switch ports has every compute module cut off, whereas a board with no thermal
sensor is every Turing Pi 2 that has ever shipped.

### The fan, as steps

The old readout was `Math.round(speed / max_speed * 100)` with a percent sign.
It was wrong in two independent ways:

- it is the step **index** as a fraction of the highest index, so state 4 of 6
  printed as 67 %;
- the steps are not evenly spaced. The device tree declares
  `cooling-levels = <0 16 32 64 102 170 254>` — seven discrete PWM duty
  values — so state 4 is a duty of 102/254, about **40 %**.

The number on screen matched neither the index nor the duty nor the airflow,
and a continuous-looking percentage invited the reader to believe a fan with
seven fixed positions could sit anywhere between them.

It is now a segmented bar: six segments for states 1–6, filled up to the
current step, all empty at state 0, with `4 of 6` beside it. **The duty cycle
is not shown.** It could only come from the `cooling-levels` table, that table
lives in the device tree, and no endpoint reports it — so printing a
percentage here would mean hardcoding one board's device tree into the
interface and presenting it as a measurement. The step is the truthful number
and it is the only one this interface can actually know.

### The governor, and a control that used to lie

Firmware `v2.2.0-unstable-hive.8` added a thermal cooling-map, so the kernel's
`step_wise` governor re-asserts the fan from the temperature on every polling
interval. On the board, setting the fan to maximum through the existing API
returned `{"result":"ok"}`, read back as 6 of 6 immediately — and was back at
4 of 6 eight seconds later. The slider appeared to work, reported success, and
was quietly reverted.

**The slider is kept.** On firmware without a cooling-map — which is every
Turing Pi 2 before this week, and upstream's firmware today — it is the only
fan control there is, and removing it would break boards to fix a board.
What changed is that the card stops hiding what happens next:

| treatment | what it rests on |
|---|---|
| an `automatic` marker beside the **Fan Control** heading, and a note that a setting here is an override the governor undoes at its next poll | an **inference**. A sensor the board can read plus a cooling device the thermal layer reports are what a governor needs, but whether the device tree maps one to the other is not something any endpoint says. So it is worded as a standing condition, not as a claim about this instant |
| a warning naming the step the board went back to, and the step it was set to | a **measurement**. A commit is recorded with its timestamp; a thermal poll that finished *after* it and disagrees with it is the evidence. `dataUpdatedAt` supplies the ordering, so no timer is involved and the immediate read-back that still shows the new value cannot trigger it |
| the segments read `cur_state` from the polled response; the slider is left uncontrolled, so its thumb stays where it was put | the two are deliberately not synchronised. The slider is what was **asked for**, the segments are what the fan is **doing**, and watching them disagree is the whole point |

Everything else is the page's own furniture: `TableItem` rows in a `dl`, the
`bg-neutral-900 dark:bg-neutral-100` fill and `bg-neutral-100
dark:bg-neutral-800` track the `Progress` and `Slider` components already use,
the muted lowercase label from the switch panel, the bordered alert box with
the `TriangleAlert` icon the switch panel introduced — in amber rather than
red, because a governor doing its job is news and not a fault. No new
dependency and no new styling idiom. All ten new strings go through
`src/locale/`, in all six locales.

Like the switch ports, the query is a plain `useQuery` rather than a
`useSuspenseQuery`, and it polls at five seconds. Both for the reasons the
switch panel gives: `type=thermal` exists only in our fork, so a suspense
query that threw would take the whole Info route to its `errorComponent` and
lose storage, addresses and the reboot buttons because a temperature was
unavailable; and a fan step read once when the tab opened is exactly the
number the governor is about to change.

### What the fan card leaves unverified

The hardware facts behind it were measured on the board. The code was not run
there. What was checked:

- `tsc -b` and `eslint .` clean, and the build emits the card in the Info
  chunk.
- The ten new keys exist in all six locale files, and every `t("…")` key used
  anywhere in `src/` — 146 of them — resolves in `en.ts`. That is a script
  over the tree, not a reading.

What was not:

- **No rendered check.** Not in a browser, not in a snapshot. The segments,
  the two-line fan row, the amber alert, how six segments and a slider wrap on
  a phone: all of it is build-output reasoning.
- **The card has never parsed a `type=thermal` response,** live or recorded.
  The endpoint is being written in parallel; this is coded to the shape above
  and nothing has confirmed the shape by answering.
- **The revert warning has never fired.** The behaviour it reports was
  observed on the board through other means, but no run of this code has seen
  a poll disagree with a commit.
- **`temperature_c` is not validated beyond `Number.isFinite`.** A daemon that
  sent degrees Fahrenheit, or millidegrees, would render a plausible-looking
  wrong number. Nothing here can tell.
- **No thresholds.** Nothing colours the temperature as hot, because nothing
  here knows what hot is for this SoC. 52 °C is one reading on one board and
  is not a scale.
- **A user-visible behaviour change.** The percentage is gone. Anyone who was
  reading `67%` will now read `4 of 6` and a bar with four of six segments
  filled. That is the same fan, described correctly for the first time, but it
  is a different screen and it will be noticed.
- **The five non-English locales were written without a native reviewer**, as
  before.

### Temperature pass: proof it still builds

The same battery, from an empty `node_modules`: `devbox run -- npm ci && npm
run lint && npm run build` clean, `npm audit` still **zero**, `eslint .` back
to the same 3 warnings and 0 errors, `git status` clean after a build —
`routeTree.gen.ts` does not move, because this adds no route. **Two
consecutive builds are byte-identical across all 32 files**, which is the
assertion the sha256-pinned tarball rests on.

The hand-rolled font pipeline is untouched, and measured rather than assumed:

| assertion | before | after |
|---|---|---|
| `@font-face` rules in `dist/` | 6 | **6** |
| `url()` references | 6 | **6** |
| `.woff2` files shipped | 6 | **6** |
| bare `.woff` references | 0 | **0** |
| every `url()` target present in `dist/` | yes | **yes** |
| the six `.woff2` files, byte for byte | — | **all six unchanged** |

The two logo SVGs are byte-identical as well. `index.html` is the same 1,973
bytes and differs only in the content hashes it points at.

| | with the panels | with the temperature |
|---|---|---|
| total `dist/` | 1,092,645 B, 32 files | **1,101,301 B, 32 files** |
| JS | 841,359 B (21 files) | 849,499 B (21 files) |
| CSS | 47,956 B | 48,472 B |
| fonts | 179,976 B (6 `.woff2`) | 179,976 B (6 `.woff2`) |
| SVG | 21,355 B (2 logos) | 21,355 B |
| `index.html` | 1,973 B | 1,973 B |
| release tarball | 463,891 B | **465,628 B** |

**+8,656 B, +0.79 %.** 8,140 B of it is JS — the card plus sixty new
translation strings across six locales, all of which ship in the main chunk
because `src/locale/` is imported eagerly by `i18n.ts` — and 516 B is the CSS
utilities the segmented bar and the amber alert pull in. Both tarball figures
were taken here with the same fixed `mtime`, so they are comparable to each
other; neither is comparable to the figure recorded in the previous section,
which used a different one.

## The serial console, in detail

`/console` is a new tab and the first thing in this interface that shows what
a compute module is saying. Everything else here reads the BMC.

### The handshake, which is where the previous attempt died

This page was written once before and correctly abandoned: a browser cannot
put an `Authorization` header on a WebSocket handshake, and the daemon had no
other way to authenticate one. That is fixed in bmcd, and the fix is a
fallback that applies only when no `Authorization` header is present — which
is the browser's situation by construction. The session token is offered as a
second subprotocol instead.

```js
new WebSocket(`wss://${host}/api/bmc/serial/ws?node=${n}`,
              ["bmcd.serial.v1", `bmcd.bearer.${token}`]);
```

Three things about that list matter and none of them is guessable from
reading it:

- **`node` is 0-indexed.** Modules 1 to 4 are `node=0` to `node=3`, the same
  convention `type=uart` and the power endpoint already use.
- **The credential goes last.** The server selects the first offered entry
  that is not a `bmcd.bearer.` one.
- **A plain name has to be offered at all.** A list with nothing selectable
  in it leaves the server no subprotocol to name in its response, and a
  browser rejects a handshake that selects nothing. Offering only the
  credential does not work, and does not work as a close with no reason.

The token is the `id` from `POST /api/bmc/authenticate`, verbatim, 64
characters of `[A-Za-z0-9]` — the same value `AuthContext` already holds for
the `Authorization` header on every other call. It is checked against that
character class before the socket is constructed, because a subprotocol name
is an RFC 6455 token: a stray character makes `new WebSocket(...)` *throw*
rather than fail to connect, and a constructor that throws inside an effect
takes the page down instead of showing a state.

### The bytes

Server to client is binary frames of raw UART, untranscoded. They go to the
terminal as a `Uint8Array` rather than a decoded string, because xterm's
decoder carries state across writes: a multi-byte sequence split across two
frames still comes out as one character. `binaryType` is set to
`arraybuffer` rather than left at the default `blob` for a related reason —
a Blob has to be read asynchronously, and two reads can finish out of order.

Client to server is whatever the terminal produced, sent verbatim with
nothing appended. That is the entire reason this is a WebSocket: Ctrl-C is
one byte, tab completion is one byte, an arrow key is three, and a writer
that appends CRLF cannot send any of them.

The daemon pings every five seconds and closes after thirty without a
response. Browsers answer pings themselves, so there is no keepalive in this
code and nothing in it to get wrong.

### What is on the page

- **A module selector**, four entries, the same `Select` the USB and Flash
  Node tabs use.
- **The reader task's state** for the selected module, from
  `POST /api/bmc/serial/status`, with a line saying what it is not. It
  reports whether bmcd's own UART reader is alive. A module that is powered
  off, one that is booted and silent, and one mid-boot all have a reader in
  the same state, so it is not module health and is not labelled as such. It
  is worth showing because a `Stopped` reader explains an empty terminal
  that no amount of looking at the module would.
- **The connection state**, at all times: connecting, connected, closed, not
  connected. A terminal that has gone quiet and a socket that closed under it
  look identical on screen, so the state is never left to be inferred from
  the absence of output. `closed` and `failed` are kept apart — one is a
  connection that ended, the other one that never opened — and the close
  code, and any reason, is printed beside it.
- **Reconnect**, which rebuilds the socket without reloading the page and
  keeps the scrollback, and **Clear**, which empties it.
- **The REST fallback**, in two lines, described below.

One terminal exists at a time and it is mounted with `key={node}`. Selecting
another module unmounts the panel, which disposes the terminal and closes the
socket together: nothing from the old module can land in the new one's
buffer, and nothing is left running behind the tab.

The route is lazy, by the repo's `.lazy.tsx` convention, so all 339 KB of
terminal is fetched when `/console` is opened and never by the five other
tabs.

### The REST endpoint it does not use

`type=uart` has been in the API the whole time, and the page says so, because
somebody debugging with `curl` should not have to find that out from the
source:

- `GET /api/bmc?opt=get&type=uart&node=<0..3>` returns the node's whole
  16 KiB circular buffer.
- `POST /api/bmc?opt=set&type=uart&node=<0..3>&cmd=<text>` writes one line.

The writer **always appends CRLF**, which is what makes it a different tool
rather than a worse one: it cannot send a bare control character. No Ctrl-C,
no tab completion, no arrow keys, nothing that needs a single key pressed at
a boot prompt. From a shell script it is the right thing; at a `u-boot`
prompt it is not.

### What the console leaves unverified

**The console has never been connected to a live board.** Not to any Turing
Pi, not to any running bmcd, not to a recorded session. It has never received
a byte of real UART output. What was checked:

- `tsc -b` and `eslint .` clean, and the build emits the route as its own
  chunk with xterm inside it — `grep` finds no mention of xterm in the main
  bundle or in any other chunk.
- Every `t("…")` key used anywhere in `src/` — 179 of them — resolves in
  `en.ts`, and all 185 keys in `en.ts` exist in all six locale files with no
  extras and none missing. That is a script over the tree, not a reading.
- **The handshake was exercised**, which is the one part of this that
  defeated the previous attempt. A throwaway server on `127.0.0.1`
  implementing the documented selection rule was driven with the same
  subprotocol list this code builds, using Node's own WebSocket client. It
  showed that a 64-character alphanumeric token survives the client's
  subprotocol validation and arrives in `Sec-WebSocket-Protocol` verbatim and
  second; that a server selecting the first non-bearer entry yields
  `socket.protocol === "bmcd.serial.v1"` and that a binary frame arrives as
  an `ArrayBuffer`; and that a server selecting *nothing* makes the client
  refuse to open. That last one is the failure the contract warns about, and
  it is now something observed rather than something believed.

What was not:

- **No rendered check.** Not in a browser, not in a snapshot. The terminal's
  size, how a 22-row terminal and a select and two buttons wrap on a phone,
  whether the dark theme reads: all of it is build-output reasoning.
- **xterm has never been mounted.** `Terminal.open`, the fit addon, the
  resize observer and the disposal path have not run anywhere. The leak this
  is written to avoid — a terminal or a socket outliving a module switch —
  has been argued, not demonstrated.
- **No escape sequence has been rendered.** Boot output being full of them is
  the reason for taking a 339 KB dependency, and not one has been drawn.
- **`POST /api/bmc/serial/status` has never answered.** Three states are
  handled by name and anything else prints verbatim, which is a guess at a
  response shape rather than a parse of one.
- **No keystroke has reached a module.** That Ctrl-C leaves as one byte is a
  property of xterm's `onData` and of a socket that appends nothing; both
  halves are read from documentation, not watched.
- **The client's own scheme is derived from the page's.** `wss:` on the
  board, `ws:` behind `vite dev`. A deployment that served this page over
  plain HTTP while expecting `wss:` would fail, and nothing here would say so
  usefully.
- **The five non-English locales were written without a native reviewer**, as
  before.

### Serial console pass: proof it still builds

The same battery, from an empty `node_modules`: `devbox run -- npm ci && npm
run lint && npm run build` clean, `npm audit` **zero** with the two new
dependencies in the tree, `eslint .` back to the same 3 warnings and 0
errors. `git status` clean after a build — but **`routeTree.gen.ts` does
move this time**, because this is the first change here that adds a route; it
is regenerated and committed. **Two consecutive builds are byte-identical
across all 35 files**, which is the assertion the sha256-pinned tarball rests
on.

The hand-rolled font pipeline is untouched, measured rather than assumed:

| assertion | before | after |
|---|---|---|
| `@font-face` rules in `dist/` | 6 | **6** |
| `url()` references | 6 | **6** |
| `.woff2` files shipped | 6 | **6** |
| bare `.woff` references | 0 | **0** |
| every `url()` target present in `dist/` | yes | **yes** |
| the six `.woff2` files, byte for byte | — | **all six unchanged** |

The two logo SVGs are byte-identical as well. `index.html` grows by 77 bytes,
and the diff is one added `modulepreload` line; the console route is not
preloaded, which is the point of it being lazy.

| | `hive` | with the console |
|---|---|---|
| total `dist/` | 1,101,301 B, 32 files | **1,456,302 B, 35 files** |
| JS | 849,499 B (21 files) | 1,199,692 B (23 files) |
| CSS | 48,472 B (1 file) | 53,203 B (2 files) |
| fonts | 179,976 B (6 `.woff2`) | 179,976 B (6 `.woff2`) |
| SVG | 21,355 B (2 logos) | 21,355 B |
| `index.html` | 1,973 B | 2,050 B |
| release tarball | 465,628 B | **555,148 B** |

**+355,001 B, +32.2 %** — by far the largest change this fork has made, and
worth breaking down, because most of it never reaches a browser that does not
open this tab:

| chunk | bytes | gzipped |
|---|---|---|
| `console.lazy-*.js` — the route, xterm, the fit addon | **338,695** | **84,524** |
| `console-*.css` — xterm's stylesheet | **3,939** | **1,029** |
| main chunk `index-*.js` | 447,554 → 458,705 (**+11,151**) | 144.0 → 148.2 kB |
| `index-*.css` | 48,472 → 49,264 (**+792**) | 8.94 → 9.05 kB |

The two console chunks are 342,634 B of the 355,001 and are fetched only when
`/console` is opened. The main chunk's 11 KB is the twenty-eight new strings
across six locales: `src/locale/` is imported eagerly by `i18n.ts`, so
translations ship in the main bundle no matter which route uses them.

One more line in the build listing moved, and it is not weight: react-dom used
to be merged into `set-*.js` (79,790 B) and is now emitted as its own chunk
(70,588 B) with `set-*.js` down to 9,204 B. The two together are 79,792 B,
two bytes more than the single chunk they replace — rolldown re-split them
because a third route entry now shares the graph.

For the firmware image the number that matters is the tarball: **+89,520 B**.
The slot occupancy that decision was weighed against — roughly 78 % to
78.75 % of a slot that fails at 90 % — is a figure from the firmware build,
not from anything measured here.

## Dependencies

**Last reviewed: 2026-09-07.** This is a manual review, not automation —
there is no Renovate or Dependabot configuration in this repo, so the date
above is the whole of the freshness guarantee and it goes stale on its own.

It ran in two passes. The first took every patch and minor and cleared the
advisories; the second took the majors the first had listed and declined.
Both are recorded below, because the reasoning in the first pass is what the
second one had to answer.

### First pass: what the review found

`npm audit` reported **20 advisories: 2 critical, 13 high, 3 moderate, 2 low**.
A raw count is the wrong way to read that, because this project's output is
static files served by bmcd from `/srv/bmcd/www/` on an isolated management
board. A flaw in the bundler runs on whoever builds the tarball; a flaw in
what the bundle contains runs in the browser of whoever opens the BMC.

| | packages | what it can reach |
|---|---|---|
| **runtime** — ships to the board | `axios` (high), `seroval` (critical, via `@tanstack/react-router`) | code executed in the browser against a live bmcd |
| **build-time** — runs on the build machine | `tar`, `rollup`, `postcss`, `vite`, `nanoid`, `picomatch`, `browserslist`, `js-yaml`, `flatted`, `minimatch`, `brace-expansion`, `ajv`, `@babel/core`, `@humanfs/node`, `diff`, `form-data`, `follow-redirects`, `solid-js` | this repo's CI and a developer's workstation; nothing is served |

So: **one advisory that matters on the board** — `axios`, a direct dependency,
the thing that talks to bmcd, and below the fix line for a long list of
prototype-pollution issues — and nineteen that are a supply-chain question
about the build, not about the device. `seroval` is a critical, but it is a
serializer that `@tanstack/react-router` uses for SSR; this is a client-only
SPA, so its deserialisation RCE has no reachable entry point here.

One trap in reading that table with npm's own tooling: `npm ls --omit=dev`
puts `vite`, `rollup`, `postcss`, `tar`, `nanoid` and `picomatch` in the
*production* tree, because upstream declares `tailwindcss` and
`@tailwindcss/vite` under `dependencies`. npm's prod/dev split is not the
runtime/build-time split that matters here.

### First pass: what was applied

Every patch and minor bump (`npm update`), plus `npm audit fix` **without**
`--force`. No major was taken in this pass. `package.json` floors were
rewritten to the versions actually installed and verified, so the declared
range and the lockfile agree.

`npm audit` now reports **zero**.

Two things had to move with it. `@tanstack/router-vite-plugin` changed the
order it emits `src/routeTree.gen.ts` in, and that file is generated but
committed, so it was regenerated. prettier 3.9 and typescript-eslint 8.69
reported three errors on source that was previously clean — two `extends`
clauses reformatted, and `error.response && error.response.status === 401`
rewritten as `error.response?.status === 401` — so `npm run lint` is back to
zero errors and the Quality workflow will still pass.

### First pass: proof it still builds

`devbox run -- npm ci && npm run lint && npm run build` is clean, and the font
pipeline is intact — which is the regression worth catching, because a
dependency bump that quietly reintroduces `.woff` or a dropped subset would
undo the fonts work above without failing anything:

| assertion | before | after |
|---|---|---|
| `@font-face` rules in `dist/` | 6 | **6** |
| `url()` references | 6 | **6** |
| bare `.woff` references | 0 | **0** |
| `.woff2` references | 6 | **6** |
| every `url()` target present in `dist/` | yes | **yes** |

The bundle grew, and it is worth saying by how much rather than rounding it
away:

| | before | after |
|---|---|---|
| total `dist/` | 995.1 KB, 25 files | **1055.0 KB, 25 files** |
| JS | 753.0 KB, largest chunk 634.2 KB | 812.5 KB, largest chunk 681.6 KB |
| CSS | 44.2 KB | 44.5 KB |
| fonts | 175.6 KB (6 `.woff2`) | 175.8 KB (6 `.woff2`) |
| SVG | 20.9 KB | 20.9 KB |
| release tarball | 442,217 B | 463,373 B |

**+59.9 KB, +6.0 %.** All of it is JavaScript, and none of it is one
regression — bisected by holding groups back and rebuilding, it is roughly
24 KB from the app libraries (`@tanstack/react-query`, `i18next`,
`react-i18next`, `axios`, `filesize`, `javascript-time-ago`,
`tailwind-merge`), 15 KB from the eleven Radix primitives, 7 KB from React
19.1 → 19.2, and 5 KB from `@tanstack/react-router`. That is what 39 minor
releases of a UI stack cost. On a board with 128 MB of flash it is affordable;
it is also a reminder that the 682 KB chunk is still the thing to fix.
(The majors pass below split that chunk; it is 426 KB now.)
(Vite prints that chunk as `698.0 kB`, counting a kB as 1000 bytes; every
figure in these tables is 1024. The tarball figure is 463,373 B measured
here; an earlier revision of this table said 463,375 B, which is the same
`dist/` packaged with a different `SOURCE_DATE_EPOCH` — the mtime in the tar
header gzips to two bytes more. The sha256 the firmware pins is of a tarball
built at a tag, so it is that build's bytes that matter, not this one's.)

The 112 B of font growth is real and not a pipeline change:
`@fontsource/inter` 5.2.6 → 5.3.0 revised the two 700-weight subsets
(`latin-700` 24,248 → 24,356 B, `latin-ext-700` 36,240 → 36,244 B). The
400- and 600-weight files are byte-identical. So the claim further up that the
six shipped files match the pre-trim build byte for byte now holds for four of
the six.

### Second pass: the majors

The table that used to sit here listed twelve majors and declined every one,
with the note that "the decision on each is the owner's". The owner asked for
them. Eleven were taken, one is still declined, and each went in as its own
commit so a bisect can find a bad one and a `git revert` can drop it without
losing the rest. The rows below pair the two that could not move apart.

| package | from | to | what it cost |
|---|---|---|---|
| `eslint` + `eslint-plugin-react-hooks` | 9.39.5, 5.2.0 | **10.10.0, 7.1.1** | The set that had to move together — and `typescript-eslint` was not part of it, because 8.69.0 already declares `eslint ^10` and there is no 9.x to take. react-hooks 7 turns `recommended` into the sixteen-rule React Compiler set and seven fired. Six were fixed in source, one silenced with its reason in the file. See below |
| `i18next` + `react-i18next` | 25.10.10, 15.7.4 | **26.4.2, 17.0.13** | The runtime pair, uninstallable apart. No source change; `tsc -b` covers the `t()` call sites and the locales were exercised outside the browser |
| `typescript` | undeclared (5.9.3) | **declared, 6.0.3** | Was not in `package.json` at all. Now it is, at the estate standard. One deprecated `baseUrl` removed |
| `vite` | 7.3.6 | **8.2.2** | Rolldown underneath, so every content hash moved and the chunking changed shape. Better shape: the 682 KB chunk is now 426 KB |
| `vite-plugin-svgr` | 4.5.0 | **5.2.0** | Nothing. `dist/` came out byte-identical |
| `lucide-react` | 0.539.0 | **1.42.0** | Two of fourteen icons redrawn upstream (`menu`, `file-up`); same symbols |
| `eslint-plugin-react-refresh` | 0.4.26 | **0.5.6** | A new check that TanStack Router's file routes cannot satisfy as written. Nine route components are now exported, which is how the router's own docs write them |
| `eslint-plugin-simple-import-sort` | 12.1.1 | **14.0.0** | Nothing. `eslint --fix` is a no-op; the predicted rewrite of every import block did not happen |
| `prettier-plugin-tailwindcss` | 0.6.14 | **0.8.1** | Nothing. Same six unformatted files before and after, all of them pre-existing |
| `globals` | 16.5.0 | **17.12.0** | Nothing. Ten names left the browser set; none is used here |

`npm outdated` now lists two packages, and both are declined on purpose:

| package | now | latest | why not |
|---|---|---|---|
| `@types/node` | 24.13.3 | 26.5.0 | **Policy, not risk.** The estate target is Node 24 and `devbox.json` pins `nodejs@24.12`. Types for a runtime we do not run would only hide errors. Unchanged from the first pass |
| `typescript` | 6.0.3 | 7.0.2 | 6.0.3 *is* the estate standard, so this is not a hold so much as the target. It is also enforced: `typescript-eslint` 8.69.0 — the newest there is — declares `typescript >=4.8.4 <6.1.0`, so 7 will not install here until typescript-eslint ships support for it |

Two undeclared imports were fixed along the way, both the same bug in
different clothes. `npm run build` runs `tsc -b` but `typescript` appeared
nowhere in `package.json` — it resolved as a transitive of `i18next`,
`react-i18next` and `typescript-eslint`, so the compiler that type-checks a
sha256-pinned artifact was whichever transitive range won the dedupe, and
these very majors would have moved it silently. `eslint.config.js` imports
`@eslint/js`, which was also undeclared and also arrived via `eslint`. Both
are now direct devDependencies.

TypeScript 6.0.3 needed exactly one source change, and it was in
configuration rather than code: `tsc -b` refused `baseUrl`, which
`tsconfig.json` and `tsconfig.app.json` both set purely to anchor the `@/*`
path mapping. `paths` have not needed `baseUrl` since TypeScript 4.1, both
files sit at the repo root, and every bare import in `src/` and
`vite.config.ts` names a real package rather than a folder — so dropping it
cannot change which file an import resolves to. Nothing in `src/` was edited
for 6.x.

### What react-hooks 7 found

Worth its own list, because these are the only *behavioural* edits in the
whole pass and none of them has been seen in a browser:

- **A real bug.** `ConfirmationCheckbox` in `nodes.lazy.tsx` was declared
  inside `NodeRow`'s body, so every render made a new component type and
  React discarded and remounted the subtree. Hoisted to module scope.
- **A redundant latch.** `firmware-upgrade.lazy.tsx` and
  `flash-node.lazy.tsx` each copied the context's `statusMessage` into local
  state through an effect. `FlashContext` only ever sets that field to a
  non-empty string and never clears it, so the copy was the context value one
  commit late. Deleted.
- **A derivation written as state.** `usb.lazy.tsx` forced the node-1
  checkbox off from an effect whenever flash mode was picked for node 1. It
  is now derived, so the value the form submits and the value the checkbox
  shows cannot disagree for a render. One deliberate difference: switching
  away from flash mode restores the earlier choice instead of leaving it
  stuck off.
- **A textbook `useSyncExternalStore`.** `use-media-query.tsx` reported
  `false` for one render before its effect ran, so a desktop viewport
  rendered the mobile drawer first. It no longer does.
- **One silenced.** The polling effect in `FlashContext` is the
  external-system sync the rule's own message carves out, except bmcd's flash
  status arrives as react-query render data rather than in a subscription
  callback, so the rule cannot tell. The honest fix is to move the flash
  state machine into the query layer; that is not a thing to do inside a lint
  bump, on the one code path that writes images to a board. Disabled at that
  effect, with the reasoning in the source.

### Second pass: proof it still builds

Same battery as the first pass, from an empty `node_modules` each time:
`devbox run -- npm ci && npm run lint && npm run build` clean, `npm audit`
still **zero**, `git status` clean after a build, and `eslint .` back to the
same 3 warnings and 0 errors it had before. The `eslint@9.39.5: This version
is no longer supported` line no longer prints on install.

Running that battery turned up a bug none of the majors caused. Editing this
README changed `dist/` by 22 bytes: Tailwind 4 has no `content` array, it
auto-detects by scanning every non-gitignored file in the project, and it was
pulling class-name candidates out of prose — the word "shrink" in a sentence
about bundle size emitted `.shrink{flex-shrink:1}`, and `contents: write` in
a workflow's permissions block emitted `.contents{display:contents}`. For an
artifact pinned by sha256 that is not a rounding error, so `src/globals.css`
now scopes detection to `index.html` and `src/`. Four unused rules leave the
stylesheet and none is added; deleting README.md outright now leaves `dist/`
byte-identical.

The font assertions exist because the pipeline is hand-rolled, and a bundler
major is exactly the kind of change that could quietly undo it. It did not:

| assertion | before | after |
|---|---|---|
| `@font-face` rules in `dist/` | 6 | **6** |
| `url()` references | 6 | **6** |
| `.woff2` files shipped | 6 | **6** |
| bare `.woff` references | 0 | **0** |
| every `url()` target present in `dist/` | yes | **yes** |
| the six `.woff2` files, byte for byte | — | **all six unchanged** |

The two logo SVGs are byte-identical too, which is the check that matters for
the `vite-plugin-svgr` major.

**Two consecutive builds are byte-identical across all 32 files.** That is
not a nicety here: the firmware pins the tarball by sha256, so a
non-reproducible build would break the pin rather than fail a test.

The output barely moved in total, and moved a great deal in shape:

| | after the first pass | after the majors |
|---|---|---|
| total `dist/` | 1055.0 KB, 25 files | **1055.0 KB, 32 files** |
| JS | 812.5 KB (14 files), largest chunk 681.6 KB | **811.8 KB (21 files), largest chunk 426.4 KB** |
| CSS | 44.5 KB | 44.7 KB |
| fonts | 175.8 KB (6 `.woff2`) | 175.8 KB (6 `.woff2`) |
| SVG | 20.9 KB | 20.9 KB |
| `index.html` | 1.4 KB | 1.9 KB |
| release tarball | 463,373 B | **460,701 B** |

**+32 bytes, +0.003 %** — 1,080,332 B to 1,080,364 B. Eleven majors
including a bundler, a compiler and the entire icon set, for the price of a
tweet. The first pass's +59.9 KB is not recovered, but it is not compounded
either.

Where it did move is worth naming. vite 8 costs 5.7 KB *less* than vite 7 and
splits the one 682 KB chunk into route- and API-shaped pieces, taking the
largest down 255 KB; lucide 1.x adds 2.4 KB for the redrawn paths and a
slightly larger per-icon wrapper; i18next 26 adds 3.4 KB; exporting the nine
route components adds 12 bytes; scoping Tailwind's content detection takes
100 B of phantom utilities back off the CSS. `index.html` grows because it
now preloads more chunks. The tarball shrinks 2,672 B despite the file count
going up, because more, smaller chunks gzip better than one large one.

One assumption was re-checked rather than carried forward. Dropping `.woff`
rests on Vite's default browser baseline, and vite 8 changes it — from
chrome107/edge107/firefox104/safari16 to
chrome111/edge111/firefox114/safari16.4 plus ios16.4. It moves *up*, so the
argument holds a fortiori (every browser in either baseline has had woff2 for
a decade), but it is a real change in what this interface will run on and is
recorded here rather than discovered later.

## Building

```bash
devbox run -- npm ci
devbox run -- npm run build
```

`direnv allow` once, and the `npm`/`node` on your `PATH` are the pinned ones.
`npm` still works without devbox — nothing about the project changed — but the
release pipeline builds through devbox, so that is the toolchain the published
sha256 belongs to.

## Releasing

Push a tag matching `v*`. `.github/workflows/release.yaml` builds the project
and publishes a release holding:

- `bmc-ui-<tag>.tar.gz` — upstream's asset name, wrapping a top-level `dist/`
  with `LICENSE` inside it, so Buildroot's `generic-package` finds it under the
  filename it derives by default and our `bmc-ui.mk` changes only
  `BMC_UI_SITE` and `BMC_UI_VERSION`;
- `SHA256SUMS` — **bare basenames**. `sha256sum -c` resolves each name against
  the working directory, so a line carrying a path fails to *open* the file
  rather than report a mismatch, and that error reads like a pass in a build
  script. The workflow generates the file from inside the artifact directory,
  fails the run if a `/` ever appears in it, and verifies it in the same step.

Every action is pinned by full commit SHA: the job holds `contents: write`, and
a tag is a pointer its author can move.

> Upstream's `tag-and-build.yml` is still in the tree and still watches `main`,
> where it tags from `package.json` and releases what it tagged. We build
> `hive`, so it would never fire in normal use — but "normal use" is a rule
> someone has to remember, and one push to `main` would cut a release under
> upstream's versioning. Its `tag` job is therefore guarded with
> `if: github.repository == 'turing-machines/BMC-UI'`, which makes it inert
> here and in every other fork. The file is otherwise untouched, so it still
> rebases cleanly, and the guard is correct upstream too.

---

# BMC-UI

BMC-UI is a web-based user interface for managing and configuring the BMC of a Turing Pi cluster.

## Technologies Used

- [React](https://reactjs.org/) - JavaScript library for building user interfaces
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [TanStack Router](https://tanstack.com/router) - Routing library for React applications
  - Handles route management and route protection
- [TanStack Query](https://tanstack.com/query) - Data fetching and caching library for React
- [react-i18next](https://react.i18next.com/) - Internationalization library for React
- [Vite](https://vitejs.dev/) - Fast build tool and development server
- [TypeScript](https://www.typescriptlang.org/) - Typed superset of JavaScript

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/turing-machines/BMC-UI.git
   ```

2. Install dependencies:

   ```bash
   cd BMC-UI
   npm install
   ```

3. Start the development server:

   There are multiple ways to run the development server:

   a. Connect to a local Turing Pi cluster (default):

   ```bash
   npm run dev
   ```

   This will connect to `https://turingpi.local` for the API by default.

   b. Connect to a specific Turing Pi cluster:

   If your Turing Pi cluster is using a different hostname, domain or IP address, you can specify it using the `CLUSTER_URL` environment variable:

   ```bash
   CLUSTER_URL=https://your-cluster.lan npm run dev
   ```

   or

   ```bash
   CLUSTER_URL=https://192.168.1.100 npm run dev
   ```

   c. Use bmcd-api-mock:

   If you want to use [bmcd-api-mock](https://github.com/barrenechea/bmcd-api-mock) as the API for development:

   - Clone and set up the bmcd-api-mock repository.
   - Run the mock server (usually on `http://localhost:4460`).
   - Start the BMC-UI development server with the CLUSTER_URL environment variable:

     ```bash
     CLUSTER_URL=http://localhost:4460 npm run dev
     ```

4. Open your browser and visit `http://localhost:5173` to see the application running.

## Deployment

The deployment process for BMC-UI is automated using GitHub Actions. The version management is handled by the `version` field defined in the `package.json` file.

Whenever a pull request targeting the `main` branch is created and the `package.json` file is modified with an updated version, a new build is triggered automatically. Once the pull request is merged into the `main` branch, the version change will be detected, and the built files will be packaged into a tarball and released as an artifact on GitHub.

To deploy a new version:

1. Create a new branch and update the `version` field in the `package.json` file following semantic versioning (e.g., `2.1.0`, `2.1.1`, `3.0.0`).

2. Commit the changes and push the branch to the repository.

3. Open a pull request from the branch targeting the `main` branch.

4. Review and merge the pull request into the `main` branch.

5. GitHub Actions will automatically detect the version change, trigger a new build, and create a release with the tarball artifact.

6. The release artifact can be downloaded and deployed to the target environment.

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request.

Please note that due to memory restrictions on the BMC, the final bundle size of the application cannot exceed 4MB. To ensure this limit is maintained, every pull request will report its bundle size, allowing us to track the bundle size over time. When contributing, please be mindful of the bundle size impact of your changes.

## License

This project is licensed under the [GNU General Public License v2.0](LICENSE).
