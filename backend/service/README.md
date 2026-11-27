# Local telemetry service

## Demonstrate device discovery and security alerts

After the Windows setup below, create the offline fixture once in the existing build directory and launch replay from the repository root.

~~~powershell
node backend/service/security-demo.mjs backend/build/device-arrival-fixture.pcap
node dev.mjs --replay backend/build/device-arrival-fixture.pcap
~~~

Open **http://127.0.0.1:5173/** → **Open local dashboard** → **Start capture**. The fixture contains three ordinary ARP requests on a documentation subnet. Two belong to the baseline device. A second device first appears 75 seconds later in the file. Replay completes immediately using the recorded timestamps for discovery. Devices shows both MAC identities. Alerts shows one replay-labeled device arrival for `192.0.2.20`. Acknowledge it, label and trust that device, then reload the browser. Clear Capture Log resets the packet history and dashboard totals while keeping the monitoring history. The fixture generator uses exclusive creation. Reuse the existing file on subsequent runs.

**Live monitoring.** Launch `node dev.mjs --live`, choose an Ethernet-format adapter, and start capture. On Windows the bridge reads that adapter’s on-link routes, default next hops, network profile, and OS neighbor cache. Linux uses `ip -j` from iproute2. Refresh runs asynchronously every 45 seconds during capture. ARP sender and IPv6 Neighbor Discovery link-layer options supply additional evidence. Rejected or ambiguous records and tagged VLAN observations do not seed identities. The endpoint table still includes remote peers seen by the capture interface. No active scanning runs.

**Identity and retention.** Trust belongs to a MAC scoped by adapter and network context. A device can have up to 16 observed IPs. A changed or randomized MAC starts as a separate untrusted identity. Labels, rules, acknowledgments, up to 512 identities, and the latest 512 events are saved locally. On Windows the default is `%LOCALAPPDATA%\NetSentinel\monitor-v1.json`. Set `NETSENTINEL_STATE_FILE` to choose another live state file. Replay uses a separate in-memory inventory and event history. The UI reports storage and inventory-capacity problems. These are observations and operator preferences; MACs do not authenticate a device.

**Detection rules.** The first 60 seconds of each capture or network context establish a quiet baseline. Thereafter discovery can report every arrival, untrusted arrivals only, or none. An identity seen again after 24 hours can produce a return notification. Discovery allows at most five notices per minute. An ARP conflict requires alternating recent claims for one address within 30 seconds. A gateway change requires two consistent replacement observations at least a second apart. The live rate rule defaults to 1,000 frames/s and requires a mature rolling window and a sustained crossing. Each anomaly control is independent and repeats have a one-minute cooldown per rule/address. Gateway failover, duplicate addresses, and legitimate traffic bursts are possible explanations.

**Device names.** A saved label takes precedence over a current hostname. The bridge can identify its own computer from the adapter’s OS name, MAC and IP. For other devices it can use a matching mDNS announcement, a DHCPv4 client hostname (option 12 with matching Ethernet and client MACs), or a unique NetBIOS name reply advertising the sender’s own IPv4 address. None of these passive observations sends a query. DHCP observations expire after five minutes. NetBIOS and mDNS use the advertised lifetime capped at one day. Settings can also enable bounded asynchronous PTR lookups. Names retain their source and expiry. A device with no current name appears as **Unknown Device**, alongside its addresses. Open **Details** to inspect the discovery method, full capture source, timestamps and previous hostname. **View packets** opens the matching retained observations for that adapter and network.

**Reviewing alerts.** In **Alerts**, filter by acknowledgment, severity or detection type across the retained history. Open an entry to inspect its recorded evidence, UTC timestamp and capture identifier. Related packet links require matching retained observations on the same adapter and network near the event time. New rate alerts retain their threshold and measurement window. **Configure alert rules** controls discovery notifications, ARP conflicts, gateway changes and rate spikes. Acknowledgments and live settings are stored alongside device preferences.

**Coverage.** The rolling dashboard rate uses original wire lengths across all delivered frames and roughly three seconds of worker counter snapshots. Cumulative byte statistics retain their original parsed-frame meaning. Replay throughput measures file processing speed; replay does not generate live-rate advisories. Display filters do not affect detection. Detail-dependent rules can miss records dropped by the worker mailbox. Aggregate rates include those records. The UI also reports neighbor observations missed while adapter metadata was unavailable. Network changes between OS refreshes, packets the interface cannot see, and driver drops limit coverage.

**Logs.** Upload accepts NetSentinel packet metadata exports in CSV or JSON, up to 4 MiB and 4,096 rows. The imported table has its own label and pagination and stays separate from capture, discovery and detection. The browser reads the selected file through a standard input and exports a Blob through its download manager. Its download settings control the destination. Use replay to read an Ethernet pcap file.

## Windows setup and launch

Use 64-bit Node 24.15 or later in the 24.x series, npm, CMake 3.20+, Ninja, a C++17 compiler, the Npcap runtime, and the x64 Npcap SDK. From the repository root in PowerShell, adjust the two installation paths for your machine.

~~~powershell
$env:PATH = "C:\msys64\ucrt64\bin;$env:SystemRoot\System32\Npcap;" + $env:PATH
$env:NPCAP_SDK_ROOT = 'C:\Libraries\Npcap-SDK'
cmake -S backend -B backend/build/capture -G Ninja "-DNPCAP_SDK_ROOT=$env:NPCAP_SDK_ROOT"
cmake --build backend/build/capture
npm.cmd ci --prefix backend/service
npm.cmd ci --prefix frontend
~~~

Launch both services in the same terminal. Choose one command.

~~~powershell
node dev.mjs --live
~~~

~~~powershell
node dev.mjs --replay
~~~

Open **http://127.0.0.1:5173/** and choose **Open local dashboard**. For live capture, select an Npcap source and press **Start capture**. The list comes from the capture executable. On Windows, `Get-NetAdapter | Select-Object Name,InterfaceGuid` maps physical adapter names to their NPF GUIDs. Choose an Ethernet-format source. Loopback or monitor-mode sources may report an unsupported link type. The bridge allows one controller tab at a time. Ctrl+C stops the services.

Replay without a filename creates a temporary fixture with three UDP records from 10.0.0.1 to 10.0.0.2 on destination port 53. Run it twice to display six captured frames. Filter for TCP to hide all six, then switch to UDP and click a packet number to inspect it. Reload to restore history. Stop capture before using **Clear Capture Log**. **Explore offline simulation** runs the original browser-generated demonstration separately.

Supply one or more pcap paths after `--replay` or limit the available interfaces with `--interface DEVICE [DEVICE ...]`. The launcher defaults to the capture executable in `backend/build/capture`. Set `NETSENTINEL_BIN` for another build location. Set `NETSENTINEL_DNS=1` for active PTR lookups at startup, or enable them under Settings. `NETSENTINEL_BUFFER` sets the worker mailbox capacity between 1 and 4096 (default 256).

On Linux, install the libpcap development package, pkg-config, the same JavaScript dependencies and a C++17 toolchain. Omit the Windows PATH and SDK settings. Configure with `cmake -S backend -B backend/build/capture`, build, then use the same Node launcher. A separate build with `-DBUILD_CAPTURE_APP=OFF` runs the platform-independent core tests.

For separate processes, `node backend/service/start.mjs backend/build/capture/netsentinel.exe --replay sample.pcap` starts the bridge with its original localhost origin. Run `npm.cmd --prefix frontend run dev -- --host localhost --port 5173 --strictPort` and visit `http://localhost:5173/`. Use the matching hostname for the chosen launch method.

To run the browser integration check, build the frontend with `npm.cmd --prefix frontend run build`. The check uses separate loopback ports and temporary state. Run `node backend/service/browser-smoke.mjs` from the root. The check uses installed Edge, the production bundle, the bridge and a temporary replay. Set `NETSENTINEL_SMOKE_DEVICE` to exercise a real interface.

Connect to ws://127.0.0.1:8080. The service accepts one local client and, for browsers, an exact Origin match (default http://localhost:5173; override with NETSENTINEL_ORIGIN). Start/stop commands match the dashboard client. Set a display filter before starting a session:

~~~json
{"type":"control","command":"set_filter","filter":{"protocol":"UDP","destination_port":53}}
{"type":"control","command":"start_capture"}
{"type":"control","command":"stop_capture"}
~~~

Filter fields are optional and combined with AND. Supported keys are protocol (TCP, UDP, ICMP, OTHER), source_ip, destination_ip, source_port and destination_port. An empty object clears the filter.

Each batch is a JSON object with type=batch, captureState (RUNNING or PAUSED), failed, packetCount, bytes, protocolCounts (TCP, UDP, ICMP, Other), bandwidthMbps, activeConnections, filtered, rejected, outputDrops and packets. Counts are cumulative per session. packetCount and bytes include all successfully classified frames regardless of display filtering; bytes uses the original record length. bandwidthMbps is the session average based on monotonic processing time; replay throughput uses playback time. activeConnections counts distinct bidirectional TCP/UDP address-port pairs with transport ports in the current one-minute observation window, capped at 4096. This is a traffic estimate. Rejected frames failed parsing. Unsupported Ethernet payloads count as Other. Driver drops are outside these counters.

Packet fields are source, destination, protocol, sourcePort and destinationPort (nullable), sizeBytes, capturedBytes and timestampUs (Unix epoch microseconds). Optional sourceHostname and destinationHostname are nullable. No payload bytes are transmitted. The capture worker discards new display records when its 256-record buffer fills and increments outputDrops. A writer drains it approximately every 200 ms. Interim counters reflect the latest sampled snapshot and can lag the batch; the final PAUSED snapshot includes final totals. Slow WebSocket clients are disconnected. Errors use type=error and message. Disconnecting the controller requests capture shutdown.

The live workspace subscribes with the history command, which pages retained metadata in groups of 128. For this client, totals and sequence numbers span capture restarts and source changes until Clear Capture Log (while stopped) or bridge exit. Captured frames includes rejected frames. Retained counts records held by the bridge; Displayed counts rows matching both UI filters. Evicted counts retained records aged out at 4096. Output drops are mailbox losses before retention. Driver loss is not measured. The bandwidth denominator sums capture time across runs; paused time is excluded. Active connections is a per-run estimate. Older clients that omit history continue to receive per-run batches.

Click a row or its number to inspect headers, capture source, original and captured lengths, EtherType, VLANs, decode status and available names. The legacy four protocol counters describe transport buckets. Network and application labels are separate. Non-IP rows can show Ethernet addresses. Truncated or malformed records can still have useful header metadata.

Active reverse DNS lookups can be toggled in the live workspace. Positive PTR updates apply to retained rows with the same source interface and numerical address. DNS A/AAAA records and CNAME chains from visible responses are associated with the client, interface and capture time within the observed TTL. Associations describe evidence observed at capture time. SNI comes from a complete visible TLS ClientHello and is associated with its flow for at most five minutes. ECH, encrypted DNS, split handshakes and reassembly are outside the decoder's coverage. Port-based classifications are labeled as heuristics. No HTTP contents or packet payload are stored.

The memory limit applies to packet metadata, including diagnostic frames. Keeping a complete long-running capture would require a disk archive with quotas and rotation plus a paged index. The bridge currently keeps the newest 4096 records in memory; restarting it starts a fresh history.

Run the resolver and end-to-end replay tests after building the capture executable:

~~~powershell
$env:NETSENTINEL_BIN = (Resolve-Path backend/build/capture/netsentinel.exe).Path
npm.cmd test --prefix backend/service
~~~

