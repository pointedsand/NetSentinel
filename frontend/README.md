# NetSentinel Frontend

The frontend is a React and TypeScript single-page application built with Vite. Its current monitoring data is simulated in the browser; it does not yet read captures, persist configuration, or store archived logs on disk.

## Getting started

From this directory:

```sh
npm install
npm run dev
```

Available checks:

```sh
npm test -- --run
npm run build
npm run lint
```

## Application structure

- `src/App.tsx` owns page navigation and shared packet, alert, and alert-rule state. Keeping these values here allows Alerts, Logs, and the overview dashboard to show the same data.
- `src/hooks/usePacketSimulation.ts` requests initial and live packet records from `simulationData.ts`, then shares that stream with the pages while capture is running.
- `src/simulationData.ts` owns the simulated device profiles and packet generation data (hosts, protocols, destinations, and packet sizes) used by Packets and the other views.
- `src/pages/` contains the navigable page components:
  - `DashboardOverview.tsx` is the simulated overview shown by the app navigation.
  - `PacketsPage.tsx` provides packet filtering, bounded DOM rendering, and export controls. `packetExport.ts` formats the selected packet data.
  - `DevicesPage.tsx` derives host activity from the shared packet stream and keeps labels, scan state, and acknowledgments in local component state.
  - `AlertsPage.tsx` evaluates simulated thresholds and manages alert rules and acknowledgments.
  - `LogViewerPage.tsx` derives capture summaries from the shared packet list and reflects the shared alert feed.
  - `SettingsPage.tsx` demonstrates startup settings parsing and editing.
- `src/services/telemetryClient.ts` defines a WebSocket telemetry/control client. `DashboardPage.tsx` is a separate UC09/UC10 backend telemetry view used by its tests; it is not the Dashboard route currently rendered by `App.tsx`.
- `src/styles/` holds page and layout styles. `App.css` imports them in order; keep shared styles last because they provide common component rules.
- `src/components/layout/` contains an alternate sidebar shell prototype. The current navigation shell is defined in `App.tsx`.
- `src/**/__tests__/` contains application and page behavior tests. `setupTests.ts` configures the DOM matchers and cleanup.

## Data and behavior boundaries

- The packet stream, host inventory, alerts, and log summaries are demo data. Values are generated or derived in browser memory and reset on reload.
- A subnet scan adds a simulated unknown device to the Devices page. An unknown local packet source can also create a simulated alert.
- Removing a capture summary in Logs hides that summary without deleting the shared packet stream. Clearing Logs' security-event view updates the shared alert state when used through the main app.
- The Logs Upload action opens a file picker, but selected files are not read or imported yet. Log sizes, archive timestamps, and compression badges are illustrative metadata, not on-disk files.
- The packet export's `PCAP` option currently writes readable text lines with a `.pcap` filename; it does not generate a binary PCAP capture. CSV and JSON options serialize the simulated packet records.
- `SettingsPage` parses the supplied JSON string and updates its local form state. It does not load a file from disk or apply settings to the C++ backend.
- `DashboardPage` and `telemetryClient` provide the interface for future backend telemetry. The app's current Dashboard route remains the simulated `DashboardOverview`.

These boundaries should be updated in this document when the corresponding backend or file-storage integrations are implemented.

## Responsive layout

The app shell and page content use fluid widths, with narrower spacing and reflowed navigation, headings, metrics, and toolbars at smaller viewport widths. Packet, device, log, and alert tables preserve readable column widths and scroll horizontally within their table containers when needed. This also adapts to browser zoom because zoom changes the effective CSS viewport width; the app does not force a fixed page width or disable zoom.
