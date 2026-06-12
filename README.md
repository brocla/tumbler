# Tumbler  ---  Under Development
## I'm pausing work on this path and start afresh with a different tech stack

A personal PDF viewer and editor built with Tauri, React, PDF.js, and pdf-lib.
Runs on Windows 10 and Windows 11. No cloud hosting required.

## Features

### Phase 1 — Viewer (this build)
- Page navigation and zoom (25%–400%)
- Full-text search across all pages
- Dark mode: invert and sepia display filters
- Page thumbnail sidebar
- View and edit document metadata (title, author, subject, etc.)

### Phase 2 — Document operations (next)
- Merge multiple PDFs
- Split PDF into parts
- Add, delete, reorder pages
- Rotate and crop pages

### Phase 3 — Forms
- Fill existing PDF forms
- Save filled form data

### Phase 4 — Utilities
- Extract plain text from any PDF
- Print with custom page ranges

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org |
| Rust | stable | https://rustup.rs |
| WebView2 | any | Pre-installed on Windows 11; Windows 10 installs automatically |

---

## Development

```bash
# Install dependencies
npm install

# Start dev server + Tauri window
npm run tauri dev
```

The app window opens automatically. Changes to React files hot-reload instantly;
changes to Rust files trigger a Rust recompile.

---

## Building a release

```bash
npm run tauri build
```

The unsigned installer lands at:
```
src-tauri/target/release/bundle/nsis/Tumbler_<version>_x64-setup.exe
```

---

## Releasing via GitHub Actions

Push a version tag to trigger the full build → sign → release pipeline:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow will:
1. Build the Tauri NSIS installer on `windows-latest`
2. Submit it to SignPath Foundation for free code signing
3. Attach the signed `.exe` to a GitHub Release automatically

### Setting up SignPath (one-time)

1. Go to https://about.signpath.io/product/foundation
2. Create a free Foundation account and link your GitHub repository
3. SignPath will review your open-source project (usually 1–3 business days)
4. Once approved, add these three secrets to your GitHub repo
   (Settings → Secrets → Actions):

| Secret name | Where to find it |
|-------------|-----------------|
| `SIGNPATH_API_TOKEN` | Injected automatically by the SignPath GitHub App |
| `SIGNPATH_ORGANIZATION_ID` | SignPath dashboard → Organization settings |
| `SIGNPATH_PROJECT_SLUG` | SignPath dashboard → your project |
| `SIGNPATH_SIGNING_POLICY_SLUG` | SignPath dashboard → Signing policies (e.g. `release-signing`) |

5. Create an **Artifact Configuration** named `installer` in SignPath that
   covers PE files (`.exe`). SignPath's setup wizard walks you through this.

---

## Project structure

```
tumbler/
├── src/                        # React frontend
│   ├── components/
│   │   ├── Toolbar.tsx         # Navigation, zoom, search toggle, dark mode
│   │   ├── Sidebar.tsx         # Tab container for panels
│   │   ├── ViewerArea.tsx      # PDF.js canvas renderer
│   │   ├── ThumbnailPanel.tsx  # Page thumbnail strip
│   │   ├── SearchPanel.tsx     # Full-text search UI
│   │   └── MetadataPanel.tsx   # Document info editor
│   ├── store/
│   │   └── usePdfStore.ts      # Zustand global state
│   ├── utils/
│   │   ├── pdfEngine.ts        # PDF.js + pdf-lib operations
│   │   └── fileHelpers.ts      # Tauri dialog open/save wrappers
│   ├── styles/
│   │   └── global.css          # Design tokens and layout
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                  # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── tauri.conf.json
│   └── Cargo.toml
├── .github/
│   └── workflows/
│       ├── release.yml         # Build → SignPath → GitHub Release
│       └── ci.yml              # Type-check on PRs
├── index.html
├── vite.config.ts
└── package.json
```

---

## Tech stack

| Role | Library |
|------|---------|
| Desktop shell | Tauri v2 |
| UI framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| PDF rendering | PDF.js (Mozilla) |
| PDF modification | pdf-lib |
| State management | Zustand |
| File dialogs | @tauri-apps/plugin-dialog |

---

## Updating the app version

Version is set in two places — keep them in sync:

- `package.json` → `"version"`
- `src-tauri/tauri.conf.json` → `"version"`

Then tag and push:
```bash
git tag v<new-version>
git push origin v<new-version>
```

---

## License

MIT

---

## Updating the app icon

Replace `tumbler.png` with a new 1024×1024 PNG, then run:

```powershell
# 1. Regenerate all icon variants (Windows, macOS, iOS, Android)
npm run tauri -- icon tumbler.png

# 2. Force Rust to recompile with the new icon
(Get-Item "src-tauri\build.rs").LastWriteTime = Get-Date

# 3. Restart the dev server
npm run tauri dev
```
