# Requirements traceability matrix

Identifiers and ordering follow the Group 5 SE Document, pp. 3–4. FR use-case numbers follow its p. 13 matrix. NFR use cases below identify the subsystem exercised by the verification procedure. “Implemented” identifies a working path at the stated scope. The verification column defines what an execution established. Read the [functional cases and evidence](functional.md), [non-functional measurements](nonfunctional.md) and [execution logs](README.md) together.

| Requirement | Description | Use case | Implementation | Cases or procedure | Verification and limits |
|---|---|---|---|---|---|
| FR01 | Capture raw frames on a selected interface | 1 | Implemented for Ethernet-format links | TC13/14, UT-03/04 | Pass on live Intel Ethernet and replay. Unsupported link types are rejected. |
| FR02 | Filter TCP, UDP and ICMP by protocol | 1 | Implemented | UT-05/08, TC07 | Pass for protocol predicate and Edge TCP/UDP display. |
| FR03 | Extract source and destination IP addresses | 1, 9 | Implemented | UT-01/02/11 | Pass for IPv4 and supported IPv6 headers. |
| FR04 | Decode payload data for basic inspection | 1 | Partial | UT-03/04/11, TC07 | Selected header and application fields are decoded. General byte-level payload inspection is unavailable. |
| FR05 | Calculate packet sizes and session byte counts | 1, 5, 9 | Implemented | UT-01/04/09/10, RATE-01 | Pass for original wire lengths, host-pair sample and rolling counters. |
| FR06 | Save captured data to local logs | 2 | Implemented for metadata | TC06 | Pass for selected, filtered and all rows. CSV/JSON contain parsed metadata. No raw pcap writer. |
| FR07 | Scan local subnet for devices | 3 | Unsupported as specified | DEV-01 (related) | Not Run. Discovery uses passive evidence and the OS neighbor cache. |
| FR08 | Identify hostnames and MAC addresses during discovery | 3 | Partial | DEV-01, Node inventory/name tests | MAC and available names verified on fixtures. Naming is best effort and active scan identification is unavailable. |
| FR09 | Ping active IPs and measure response times | 3 | Unsupported | — | Not Run. No ping or RTT workflow. |
| FR10 | Maintain inventory of discovered devices | 3 | Implemented, bounded | DEV-01, SEC-05 | Pass for scoped device identities, persisted trust and continued observations with rules disabled. |
| FR11 | Flag newly observed arrivals | 3, 7 | Implemented | SEC-01/05 | Pass for quiet baseline, later arrivals, trust suppression and rate cap. |
| FR12 | Allow operators to label known devices | 4 | Implemented | DEV-01, AUTH-01 | Pass for authorized label edit and persistence after reopening store. |
| FR13 | Detect unusual traffic spikes | 7 | Implemented for sustained packet rate | SEC-04 | Pass for frames/s, window maturity and cooldown. No learned baseline or per-device Mbps threshold. |
| FR14 | Alert when an unauthorized device joins | 7 | Partial | SEC-01 | Advisory for observed untrusted arrivals after baseline. Cannot establish actual network admission or immediate observation. |
| FR15 | Record timestamped security warnings | 7 | Implemented, bounded | SEC-02/03, TC01, Edge replay | Pass for fixture event generation, evidence, viewing and controlled purge. Live store retains the latest 512. |
| FR16 | Configure custom security thresholds | 8 | Partial | SEC-04, AUTH-01 | Sustained packet-rate threshold is configurable and validated. UC8 bandwidth-unit thresholds are unavailable. |
| FR17 | Mute specific alert types | 7 | Implemented with rule switches | SEC-01/05 | Pass for per-rule disabling and retained inventory. Disabling a rule suppresses event creation. |
| FR18 | Provide an audit trail for acknowledgments | 7 | Partial | SEC-02, Edge replay, Node store tests | Acknowledged state is retained on events. No immutable actor/time acknowledgment history. |
| FR19 | Provide CLI for core scanning tools | System | Partial | TC13, worker and invalid-interface probes | Worker supports interface listing, selected capture and replay. No active scan CLI. |
| FR20 | Provide a local visual dashboard | 9 | Implemented | TC10/12/13 | Pass for production dashboard in Edge and Firefox. |
| FR21 | Update dashboard metrics in real time | 9 | Implemented | TC10/11, RATE-01, NFR03 | Pass for live updates to the Edge DOM under sampled load. |
| FR22 | Start and stop with a button | 1, 10 | Implemented | TC13/14/15 | Pass across Dashboard and Packets on live Windows and replay. |
| FR23 | Show monitor running status | 9, 10 | Implemented | TC12/13/14/15 | Pass for running, paused and disconnected states at specified test levels. |
| FR24 | Clear historical logs from local UI | 11 | Implemented for retained history | TC01/02/03, AUTH-01 | Security-event and packet-history purge verified in Edge. Archive empty/cancel also covered at component level. |
| FR25 | Restrict settings with user authentication | System security | Implemented | AUTH-01/02, TC01 | Pass for enrollment, unlock/lock, direct-command authorization, session revocation and credential persistence. |
| FR26 | Load external startup configuration | 12 | Partial | TC04/05, DEV-01, AUTH-02 | Supplied JSON parser and warning tested. Live monitor preferences and credentials load on restart. General operator-supplied startup JSON is unintegrated. |
| FR27 | Capture baseline traffic without frame loss | 1 | Partial instrumentation | NFR01/13; live and burst probes | Fail for complete output. 12,066 detail drops in the three-minute baseline. Driver-level capture loss is unverified. |
| FR28 | Show per-device bandwidth and download rates | 5 | Partial | UT-09/10, RATE-01 (related) | Host-pair sample and aggregate rolling rates pass. Live per-device directional bandwidth is missing. |
| FR29 | Select filter rules including address or packet size | 1 | Partial | UT-06/07/08, TC07 | Address/port predicates and protocol/text display filters verified. Packet-size criterion is missing. |
| FR30 | Track daily bandwidth usage | 5, 6 | Unsupported in live workspace | RATE-01, TC06 (related) | Not Run. No persisted day-bucket usage or UC6 daily-usage export. Ordinary packet exports serve UC2. |

| Requirement / procedure | Description | Use case | Implementation | Verification |
|---|---|---|---|---|
| NFR01 | Minimal capture CPU | 1 | Implemented, sampled | Pass |
| NFR02 | Subnet sweep within 60 s | 3 | Unsupported | Not Run |
| NFR03 | Dashboard updates within one second | 9 | Implemented | Pass |
| NFR04 | Immediate threshold trigger | 7, 8 | Implemented for detector insertion | Pass |
| NFR05 | Modular C++ architecture | System | Implemented | Pass |
| NFR06 | Automatic log compression | 2, 11 | Unsupported | Not Run |
| NFR07 | Reliable Windows and Linux operation | System | Unverified across both | Blocked |
| NFR08 | Stable multi-hour capture memory | 1, 10 | Unverified | Not Run |
| NFR09 | Desktop browser rendering | 9 | Implemented, sampled | Pass |
| NFR10 | Survive interface disconnect | 1, 10 | Unverified on physical removal | Not Run |
| NFR11 | Secure configuration and credentials | System security | Implemented, local threat model | Pass |
| NFR12 | Parser and discovery unit tests | 1, 3 | Implemented | Pass |
| NFR13 | Low packet-processing latency | 1, 9 | Implemented, sampled | Pass |

Each NFR procedure has a corresponding row in [Non-functional test plan and results](nonfunctional.md), including its acceptance criterion, workload, evidence links and limitations. The single-host results cannot certify all operating systems, networks or workloads.
