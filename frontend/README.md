# NetSentinel Frontend

The React and TypeScript application uses the local capture bridge for live and replay sessions. The six workspace pages share one WebSocket connection. Follow the [integrated startup guide](../backend/service/README.md) to launch the complete application.

## Getting started

For frontend-only development, from this directory:

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

## Capture workspace

Open the local dashboard from the welcome screen. Choose a source in the Dashboard header or the Packets rail. Start and stop from the header on any page. Stopping keeps packet history and restarting appends to it. The Dashboard plots the rate of packets or bytes in retained observations by capture time. Its KPI cards use backend totals and recent throughput. Replay throughput measures file processing speed.

Packets owns display filters, packet details, CSV/JSON export, and Clear Capture Log. Settings controls optional reverse DNS. Devices shows trusted local identities and observed endpoints. Alerts shows the recorded severity and evidence in expanded details. Logs imports metadata independently of live monitoring.

## Application structure

- `src/App.tsx` owns page navigation and shared packet, alert, and alert-rule state. Keeping these values here allows Alerts, Logs, and the overview dashboard to show the same data.
- `src/hooks/usePacketSimulation.ts` requests initial and live packet records from `simulationData.ts`, then shares that stream with the pages while capture is running.
- `src/simulationData.ts` owns the simulated device profiles and packet generation data (hosts, protocols, destinations, and packet sizes) used by Packets and the other views.
- `src/pages/` contains the navigable page components:
  - `AuthPage.tsx` provides the sign-in and account-creation screens before the app, with a demo skip route.
  - `DashboardOverview.tsx` renders the traffic chart, summary cards, and bounded packet and alert previews.
  - `PacketsPage.tsx` provides packet filtering, bounded DOM rendering, and export controls. `packetExport.ts` formats the selected packet data.
  - `DevicesPage.tsx` derives host activity from the shared packet stream and keeps labels, scan state, and acknowledgments in local component state.
  - `AlertsPage.tsx` evaluates simulated thresholds and manages alert rules and acknowledgments.
  - `LogViewerPage.tsx` derives capture summaries from the shared packet list and reflects the shared alert feed.
  - `SettingsPage.tsx` provides monitoring preferences and an Account section for sign-in details and network selection.
- `src/components/NetworkAuthorizationPanel.tsx` shares the network selection UI between account creation and Settings.
- `src/services/telemetryClient.ts` defines a WebSocket telemetry/control client. `DashboardPage.tsx` is a separate UC09/UC10 backend telemetry view used by its tests; it is not the Dashboard route currently rendered by `App.tsx`.
- `src/styles/` holds page and layout styles. `App.css` imports the shared rules followed by desktop workspace styles.
- `src/components/layout/` contains the active sidebar, shared session header, and scrollable desktop workspace. `App.tsx` supplies navigation and capture state.
- `src/**/__tests__/` contains application and page behavior tests. `setupTests.ts` configures the DOM matchers and cleanup.

## Offline simulation and account preview

- The packet stream, host inventory, alerts, and log summaries are demo data. Values are generated or derived in browser memory and reset on reload.
- A subnet scan adds a simulated unknown device to the Devices page. An unknown local packet source can also create a simulated alert.
- Removing a capture summary in Logs hides that summary without deleting the shared packet stream. Clearing Logs' security-event view updates the shared alert state when used through the main app.
- The Logs Upload action reads validated CSV and JSON packet metadata into a separate table. Log sizes, archive timestamps, and compression badges are illustrative metadata, not on-disk files.
- The packet export's `PCAP` option currently writes readable text lines with a `.pcap` filename; it does not generate a binary PCAP capture. CSV and JSON options serialize the simulated packet records.
- `SettingsPage` parses the supplied JSON string and updates its local form state. It does not load a file from disk or apply settings to the C++ backend.
- Sign-in, account creation, email/password updates, and network selection are frontend-only screens. Credentials and selected networks are not saved or authenticated. Network names are samples; the frontend cannot detect the current SSID or verify network access/ownership. Selecting a network is a user confirmation of permission to monitor it, not technical verification of ownership.
- The integrated dashboard reuses the telemetry metrics from `DashboardPage`. The shared `useCapture` hook manages session commands, late names and history across pages.

These boundaries should be updated in this document when the corresponding backend or file-storage integrations are implemented.

## Responsive layout

The app shell and page content use fluid widths, with narrower spacing and reflowed navigation, headings, metrics, and toolbars at smaller viewport widths. Packet, device, log, and alert tables preserve readable column widths and scroll horizontally within their table containers when needed. This also adapts to browser zoom because zoom changes the effective CSS viewport width; the app does not force a fixed page width or disable zoom.
