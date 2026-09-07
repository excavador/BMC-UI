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

### Not verified, and worth knowing

- Node and module names are free text. A name typed in Cyrillic or Greek now
  renders in the system UI font instead of Inter. It degrades to a different
  sans-serif, not to tofu, and it is what already happens to Chinese.
- Nothing here has been rendered in a browser against a live bmcd. The build
  is clean and the CSS was checked to contain six `@font-face` rules, six
  `url()` references, and no reference to any file that is not shipped — but
  that is a build-output check, not a visual one.
- The JS bundle is untouched: 753 KB, one 649 KB chunk. It is now 76 % of the
  output and the obvious next target, and Vite says so on every build.

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
