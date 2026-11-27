# Local telemetry service

From the repository root, configure and build with CMake 3.20 or later and a C++17 compiler. On Windows with MSYS2 UCRT64, add its bin directory and the Npcap runtime DLL directory to PATH. Configure the x64 Npcap SDK:

~~~powershell
$env:PATH = "C:\msys64\ucrt64\bin;C:\Windows\System32\Npcap;" + $env:PATH
cmake -S backend -B backend/build/capture -G Ninja -DNPCAP_SDK_ROOT=C:/Libraries/Npcap-SDK
cmake --build backend/build/capture
ctest --test-dir backend/build/capture --output-on-failure
~~~

On Linux, install the libpcap development package and pkg-config, then omit NPCAP_SDK_ROOT. For core-only tests on either platform use a separate build directory and -DBUILD_CAPTURE_APP=OFF.

Run netsentinel without arguments for interactive interface selection and a 100-frame console capture. For WebSocket delivery install the backend service dependencies with Node 22 and npm. Launch from the repository root, supplying an adapter device name or a pcap file:

~~~powershell
npm.cmd ci --prefix backend/service
node backend/service/start.mjs backend/build/capture/netsentinel.exe --replay sample.pcap
~~~

Use --interface DEVICE for live capture. You can pass several device names (or several files in replay mode); React offers the operator-supplied list while capture is paused. list_sources returns a sources message, and select_source accepts an integer index into that list. Set NETSENTINEL_DNS=1 to enable PTR lookups. Names appear alongside numeric addresses on subsequent records while cached. Cache lifetime is five minutes for a successful answer and 30 seconds for a negative answer. Pending work is capped at 64, with two concurrent lookups and 512 cached addresses.

With Node 24.15 or later in the 24.x series, run the following in a separate PowerShell terminal at the repository root:

~~~powershell
npm.cmd ci --prefix frontend
npm.cmd --prefix frontend run dev -- --host localhost --port 5173 --strictPort
~~~

Open http://localhost:5173/?mode=live or select Connect to live backend from the simulation. The bridge accepts that exact browser origin by default. Select a source and optional display protocol before Start capture. The Packets tab searches the newest 4096 retained rows. Backend totals include filtered packets. NETSENTINEL_BUFFER sets the capture mailbox capacity from 1 to 4096 records (default 256). The output drop counter counts records lost at this mailbox.

For a reproducible demo, create a new file with node backend/service/demo-pcap.mjs backend/build/demo.pcap and use that path after --replay. To run the automated browser check, first build frontend with npm.cmd --prefix frontend run build. With ports 5173/8080 available, run node backend/service/browser-smoke.mjs from the root using the same PATH as the capture tests. This launches Edge headlessly with a temporary three-packet replay. NETSENTINEL_SMOKE_DEVICE selects a live interface instead.

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

