# Captivate Control

A desktop app for driving [NewBlue Captivate](https://www.newbluefx.com/products/captivate) broadcast graphics from a custom playout UI. Build a touch-friendly button surface, manage data tables, bind everything to Captivate titles, and push variable data to on-air graphics in real time.

Captivate Control runs on macOS and Windows, talks to Captivate over a small bridge plugin, and exposes a local HTTP data API that Captivate's HTML data controllers can read from.

## Features

- **Playout UI** — drag-and-drop canvas of buttons and text labels, snapped to a 20px grid. Buttons fire Captivate actions: `animate-in`, `animate-out`, `animate-in-out`, `cut-in`, `cut-out`, `table-select`, or a custom command. Save layouts as `.ccgui` snapshots.
- **Data tables** — author the data that drives your graphics. Per-table destination control: `captivate` (exposed over the data API), `local-file`, or `both`.
- **Project + Playlist + Broadcast Control pages** — game state, scene playlist, and live operator controls for shoutout-style workflows.
- **Captivate Integration** — one-click install of the HTML data controller and the NodeRuntime bridge plugin into Captivate's content folders. Restart Captivate from inside the app.
- **Per-instance Table Select** — declare a Table Select button bound to a data table; clicking it at broadcast time opens a dropdown of rows, and picking one pushes that row's columns as variables to a dedicated Captivate input.
- **Local data API** — HTTP server on `127.0.0.1:45455` exposing `/tables`, `/tables/:id`, and `/table-selects/:instanceId` so any Captivate HTML controller can fetch live data.
- **TCP bridge** — push channel on `127.0.0.1:45454` for forwarding button triggers and variable data to the Captivate-side bridge plugin.

## Install

> **Unsigned builds.** v0.1.0 ships unsigned. macOS will warn "Captivate Control can't be opened because Apple cannot check it for malicious software." — right-click the app and pick **Open** the first time. Windows SmartScreen will show a similar warning — click **More info → Run anyway**.

1. Download the latest installer from the [Releases page](../../releases):
   - macOS: `Captivate.Control_<version>_aarch64.dmg` (Apple Silicon) or `_x64.dmg` (Intel)
   - Windows: `Captivate.Control_<version>_x64-setup.exe` or `.msi`
2. Install and launch.
3. Open Captivate at least once before configuring the integration.

## Configure the Captivate integration

1. In Captivate Control, open the **Integration** page.
2. Click **Install / Reinstall Captivate Integration**. macOS will prompt for administrator privileges (the bridge plugin lives under `/Library/Application Support/...` and needs sudo).
3. Click **Restart Captivate** so it picks up the new controller XML and bridge plugin.
4. In Captivate, drop a title onto the timeline, open the title's input panel, and select **Captivate Control: Data API Browser** (or one of the per-instance `Captivate Control: <label>` inputs created by Table Select buttons).
5. Right-click each variable in the controller's variable panel → **Assign to title field** to wire it to a text layer.

## Use

- **Data page** — author tables and rows. Mark each table's destination so Captivate sees what you intend.
- **Playout UI page** — enter Edit Mode, drop buttons/text, set each button's Captivate Layer + Target + action. Save the layout as a `.ccgui` snapshot to disk for reuse across shows.
- **Table Select buttons** — bind one to a data table id (the `sourceTable` field on the button). At showtime, click the button → pick a row → those values push to a dedicated Captivate input.
- **Project & Playlist pages** — manage game state and playlist sequencing for the show.
- **Broadcast Control page** — operator console for live show control.
- **Integration page** — install/reinstall the controller and bridge, restart Captivate, view the data API URL for debugging.

## Known limitations (v0.1.0)

- Builds are **unsigned**. See install warnings above.
- **Windows installer** is built via GitHub Actions; the project hasn't been smoke-tested on real Windows hardware yet.
- **No live preview** of the Captivate output back into the app. Variable bindings are confirmed visually inside Captivate.
- Table Select setup-time controller UI for per-instance inputs is partially implemented — initial variable binding works through Captivate's standard right-click flow.

## Build from source

### Prerequisites

- [Node.js 20+](https://nodejs.org/) and `npm`
- [Rust toolchain](https://rustup.rs/) (stable)
- Tauri 2 platform deps:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio 2022 with the **Desktop development with C++** workload, plus the WebView2 runtime
  - **Linux**: see [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/)

### Run

```bash
git clone https://github.com/<owner>/captivate-control.git
cd captivate-control
npm install
npm run tauri dev
```

### Build installers locally

```bash
npm run tauri build
```

Bundle output lands under `src-tauri/target/release/bundle/`:

- macOS: `dmg/Captivate Control_<version>_<arch>.dmg`
- Windows: `nsis/Captivate Control_<version>_x64-setup.exe` and `msi/Captivate Control_<version>_x64_en-US.msi`

### Release workflow

Pushing a tag matching `v*` (e.g. `v0.1.0`) triggers `.github/workflows/release.yml`, which builds macOS (aarch64 + x64) and Windows installers in parallel and uploads them to a draft GitHub Release.

## Architecture

```
┌──────────────────────────┐         ┌────────────────────────────┐
│ Captivate Control (Tauri)│         │ NewBlue Captivate          │
│                          │         │                            │
│  React UI (Playlist,     │  HTTP   │  HTML Data Controller      │
│  Data, Project, Playout, │◄────────│  (/tables, /table-selects) │
│  Integration, Broadcast) │  :45455 │                            │
│  ────────────────        │         │  ────────────────          │
│  Rust core               │  TCP    │  NodeRuntime bridge plugin │
│   - Data API server      │◄───────►│   - forwards triggers      │
│   - Bridge server        │  :45454 │   - pushes variables to    │
│   - Integration installer│         │     ServiceHandler.scheduler│
└──────────────────────────┘         └────────────────────────────┘
```

- The **bridge plugin** (`tools/captivate-plugin/captivate-control-bridge.plugin.js`) is installed into Captivate's `Service Handlers/NodeRuntime/plugins/` and runs inside Captivate.
- The **HTML data controller** (`tools/captivate-data-controller/Captivate Control/`) is installed into Captivate's `LiveEngine/DataControllers/` and is loaded by Captivate's embedded Qt WebEngine when an operator opens a "Captivate Control: ..." input.
- See [docs/captivate-plugin-protocol.md](docs/captivate-plugin-protocol.md) for the wire format used by the TCP bridge.

## License

This project is licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

You're free to share and adapt the material for any purpose, including commercially, as long as you:

- **Give appropriate credit** — link back to this repository and indicate any changes.
- **Share alike** — if you remix, transform, or build upon the material, distribute your contributions under the same license.

See the [LICENSE](LICENSE) file for the full legal text.

## Credits

Alexander Malinsky — alexandermalinsky@icloud.com — Brutal Güet AG
