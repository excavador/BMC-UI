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

The three display bugs behind it *were* observed on hardware, on firmware
`v2.2.0-unstable-hive.5` — that is where they came from. The fixes have not
been.

## What is changed

| change | why | how it was checked |
|---|---|---|
| **The daemon version prints one `v`** | The About page wrapped every version in an unconditional `` `v${...}` ``. Our firmware's `VERSION` already starts with one, so the board showed `vv2.2.0-unstable-hive.5`. Stripping the `v` in the firmware was the wrong end to fix it: `tpi info` prints the same string and our flash scripts verify against it | A helper prefixes `v` only when the value lacks one, applied to all four version rows. `tsc -b` and `eslint` clean; not yet seen in a browser |
| **A missing value renders as `—`, not `vundefined`** | The board showed `Build version: vundefined` because bmcd never populated `build_version`. That is [fixed in our bmcd fork](https://github.com/excavador/bmcd), and the page already reads exactly that field. The dash is so the next missing field looks missing instead of looking like a string | Same helper. The UI side needed no field rename: `data.build_version` goes straight from the API response to the page |
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
