# Functional test plan and execution matrix

**Windows execution, November 27, 2026.** Codex executed all 33 catalogued cases and checked the assertions or observed output listed below. All 33 passed at the stated test level. No human execution is recorded here. Each heading gives the assigned human tester for the repeat run.

## Method and preconditions

Use the [deployment guide](deployment.md) from the repository root. Build both C++ targets with testing enabled, install the two npm projects and build the production frontend. Set `NETSENTINEL_BIN` to the built worker. Node tests use temporary stores and controlled clocks. E and V require Edge. V also needs an authorized, Ethernet-format Npcap adapter. No real network attacks or active scans are part of these cases.

Run the recipe(s) for a row, follow its steps and compare the asserted or displayed values. The saved logs come from the full suites, which include the targeted commands below. Use the [team worksheet](team-executions.md) for a separate human record. TC numbers here follow the case titles on SE Document pp. 39–43. TC08 and TC09 on pp. 41–42 are non-functional cases. [Document corrections](se-updates.md) explain the aliases.

| Recipe | Test type | Command from repository root | Recorded evidence |
|---|---|---|---|
| P | C++ parser | `ctest --test-dir backend/build/core -V -R ProtocolParserTests` | [core.log](evidence/core.log) |
| D | C++ decoder | `ctest --test-dir backend/build/core -V -R FrameDecoderTests` | [core.log](evidence/core.log) |
| F | C++ filter | `ctest --test-dir backend/build/core -V -R PacketFilteringTests` | [core.log](evidence/core.log) |
| A | C++ analyzer sample | `g++ -std=c++17 -I. -Ibackend/include backend/src/PacketAnalyzerMain.cpp backend/src/PacketAnalyzer.cpp -o backend/build/pair-a5.exe` then run `backend/build/pair-a5.exe` | [pair.log](evidence/pair.log) |
| I | Node inventory integration | `node --test backend/service/inventory.test.mjs` | [node.log](evidence/node.log) |
| S | Node detector fixture | `node --test backend/service/detections.test.mjs` | [node.log](evidence/node.log) |
| R | Node rate fixture | `node --test backend/service/rates.test.mjs` | [node.log](evidence/node.log) |
| L | React component / parser | `npm.cmd --prefix frontend test -- --run src/pages/__tests__/uc11_uc12.test.tsx` | [frontend.log](evidence/frontend.log) |
| T | React mock telemetry | `npm.cmd --prefix frontend test -- --run src/pages/__tests__/uc09_uc10.test.tsx` | [frontend.log](evidence/frontend.log) |
| J | React export/import helpers | `npm.cmd --prefix frontend test -- --run src/__tests__/importPackets.test.ts` | [frontend.log](evidence/frontend.log) |
| B | Node real bridge and restart | `node --test backend/service/access-control.test.mjs` | [node.log](evidence/node.log) |
| H | Node credential lifecycle | `node --test backend/service/administrator.test.mjs` | [node.log](evidence/node.log) |
| V | Edge live system | `node backend/service/browser-smoke.mjs` with `NETSENTINEL_SMOKE_DEVICE` set | [edge-live.log](evidence/edge-live.log) |
| E | Edge replay system | `node backend/service/browser-smoke.mjs` with `NETSENTINEL_SMOKE_DEVICE` unset | [edge-replay.log](evidence/edge-replay.log) |

**Shared case fields.** Executor of record: Codex. Execution date: 2026-11-27. Environment and applicable preconditions: as above. Defect field: none observed for each listed acceptance check. Requirement gaps, the FR27 drop finding and test limitations are recorded separately. A pass for a supplied JSON string, a simulated component, or one network fixture only covers that input and layer.

## Evan Guadalajara

| ID and title | Requirement / use case | Recipe | Inputs and steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| UT-01 · TCP headers | FR02/03/05 · UC1 | P | 54-byte Ethernet/IPv4/TCP fixture. Parse and inspect endpoints, ports and original size. | 192.168.1.10:49152 to 8.8.8.8:443, TCP, 54 B | Parser asserted every field. | Pass |
| UT-02 · UDP headers | FR02/03 · UC1 | P | 42-byte Ethernet/IPv4/UDP fixture. Parse and inspect both endpoints and ports. | 10.0.0.1:12345 to 10.0.0.2:53, UDP | Both addresses and both ports matched. | Pass |
| UT-03 · Reject undersized Ethernet | FR01/04 · UC1 | P | Four bytes 00 01 02 03. Pass the four bytes to parse_packet. | Returns false | Parser rejected the short buffer. | Pass |
| UT-04 · Distinguish ARP from its transport bucket | FR04/05 · UC1 | P+D | EtherType 0x0806, 14 captured of 60 original bytes; separate complete ARP request. Inspect the compatibility parser and complete-frame decoder. | Short frame reports ARP/truncated, Other transport, no ports, 60 B. Full request yields opcode 1 and sender IP. | Both contracts passed; complete fixture returned sender 10.0.0.0. | Pass |
| UT-11 · VLAN and IPv6 extension headers | FR02/03/04 · UC1 | D | Two VLAN tags, IPv6 hop-by-hop header and UDP. Decode full fixture, then shorten at every boundary. | Tags 1 and 2, ::1, UDP destination 80; truncated cuts flagged | Decoder assertions passed for full frame and all prefix lengths. | Pass |

## Ryan Chan

| ID and title | Requirement / use case | Recipe | Inputs and steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| UT-05 · Filter by protocol | FR02 · UC1 | F | TCP and UDP fixtures; TCP filter. Evaluate both packets. | Only TCP matches | Accepted TCP and rejected UDP. | Pass |
| UT-06 · Filter by destination port | FR29 · UC1 | F | TCP/443 and UDP/53; port 443. Evaluate each destination against the port filter. | Only 443 matches | 443 accepted; 53 rejected. | Pass |
| UT-07 · Filter by source address | FR29 · UC1 | F | Sources 192.168.1.10 and .20; select .10. Match the two packets with a source-only filter. | Only .10 matches | Positive and negative assertions passed. | Pass |
| UT-08 · Combine protocol and port | FR02/29 · UC1 | F | TCP/443, TCP/53, UDP/443, UDP/53. Apply TCP AND destination port 443. | Only TCP/443 accepted | Both single-condition mismatches and the double mismatch were rejected. | Pass |
| DEV-01 · Scoped device label and trust survive restart | FR08/10/12 · UC3/4 | I | Fixture neighbor on 192.0.2.0/24, label Laptop, additional IP and different MAC. Observe, edit, flush to a temporary store, reopen, then reobserve at a new IP. | Same identity retains label/trust; different MAC remains untrusted. | Restored Laptop was trusted with three addresses; changed MAC was untrusted. | Pass |

## Lamaryi Ponder

| ID and title | Requirement / use case | Recipe | Inputs and steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| SEC-01 · Baseline and arrival suppression | FR11/14/17 · UC3/7 | S | Clock-controlled baseline, post-baseline neighbor, returns and burst. Advance fixture time through baseline, trust and notification modes. | Quiet baseline; one initial arrival; trusted/off suppress; rate cap enforced. | One initial advisory; five arrivals suppressed in burst. | Pass |
| SEC-02 · Conflicting ARP and legitimate reassignment | FR15 · UC7 | S | In-memory alternating local MAC claims, stable replacement and off-link IP. Exercise the detector with timed observations; acknowledge the generated event. | One alternating-claim advisory; no event for stable replacement or off-link sequence. | One event included both fixture MACs; acknowledgment succeeded. | Pass |
| SEC-03 · Confirm a changed gateway | FR15 · UC7 | S | Controlled default gateway; transient candidate, confirmed replacement, new interface. Repeat candidate observations and change network scope. | Transient change quiet; confirmed change triggers one event without crossing scopes. | Counts were zero, one and one respectively. | Pass |
| SEC-04 · Threshold, sustain and cooldown | FR13/16 · UC7/8 | S | 1,500 frames/s, 1,000 threshold, mature 3 s window, simulated live clock. Apply short window, low sample, sustained high samples, post-cooldown and replay samples. | One sustained trigger, next allowed after cooldown; replay ignored; zero threshold rejected. | Detector returned two events total and preserved threshold measurement. | Pass |
| SEC-05 · Mute rules while retaining observations | FR10/17 · UC3/7/8 | S | All anomaly switches off; two MACs and 9,000 frames/s samples. Observe arrivals, alternating senders and high-rate samples after baseline. | Two devices retained and zero security events. | Both counts matched. | Pass |

## William Bik

| ID and title | Requirement / use case | Recipe | Inputs and steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| UT-09 · Count packets for one host pair | FR05 · UC1/5 | A | Five records in PacketAnalyzerMain.cpp, including one unrelated host. Run analyzer sample. Inspect direction and protocol counts. | Four matching packets, TCP 2, UDP 1, ICMP 1, Other 0. | Three forward and one reverse; protocol counts 2/1/1/0. | Pass |
| UT-10 · Directional and total bytes | FR05 · UC1/5 | A | Same five records; forward 1500, 120 and 84 B; reverse 60 B. Read both totals from the analyzer output. | Forward 1,704 B; combined 1,764 B. | 1,704 forward, 60 reverse and 1,764 combined. | Pass |
| TC06 · Download selected metadata and read exports | FR06 · UC2 | E+J | Six replay rows; filter to two, check one. Separate round-trip fixture contains a quote and comma. Download all JSON, filtered CSV and selected CSV; inspect files. Round-trip both serializers through importer. | 6/2/1 data rows and original fields and quoted name preserved. | Three downloads matched counts; both formats round-tripped. One disk CSV upload displayed 45 rows over 20/20/5. | Pass |
| TC07 · Display filter preserves capture totals | FR02/05/29 · UC1/9 | E | Two three-frame UDP replays; TCP, UDP, text and port searches. Capture both sessions, hide UDP with TCP, select UDP and search 53. | Six total despite filter; zero TCP matches; six UDP rows restored. | Dashboard reached six and table assertions matched zero and six. | Pass |
| RATE-01 · Rolling bandwidth responds to idle time | FR05/21 · UC5/9 | R | 125,000 wire B in 1 s; idle samples through 6 s; new session 250,000 B. Append timed counter snapshots and start a new session. | 1, 0 and 2 Mbps for respective windows; cumulative total 375,000 B. | All rates and the cumulative average matched. | Pass |

## George Salmi

| ID and title | Requirement / use case | Recipe | Inputs and steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| TC01 · Confirm security history deletion | FR24/25 · UC11 | E+B | Temporary replay alert history with administrator protection. Confirm Clear History in Security Event Logs, unlock and inspect resulting rows; check stored history after restart in bridge fixture. | Authorized deletion clears events; persisted test store reopens empty. | Edge removed event rows, and restarted bridge returned eventTotal 0. | Pass |
| TC02 · Cancel destructive cleanup | FR24 · UC11 | L | Seeded archived-metadata rows in LogViewerPage component. Click Clear History and Cancel; inspect the original rows. | Both named sample rows remain. | MacBook and iPhone fixture rows remained; separate Edge cancellation retained security history. | Pass |
| TC03 · Empty cleanup control | FR24 · UC11 | L | Component receives initialLogs=[]. Inspect empty status and Clear History availability. | Button disabled and empty status visible. | Both UI assertions passed. | Pass |
| TC04 · Parse supplied configuration JSON | FR26 · UC12 | L | In-memory JSON with eth0, threshold 100, retention 7. Call parseStartupConfig and check accepted values. | No parser error; interface eth0 and threshold 100. | These fields matched; this exercises the parser only. | Pass |
| TC05 · Invalid startup configuration fallback | FR26 · UC12 | L | JSON threshold −50. Parse and render SettingsPage with invalid data. | Safe defaults and configuration warning. | Defaults object and warning banner matched. | Pass |
| AUTH-01 · Local enrollment and protected mutation | FR25/12/16 · UC4/8 | B+E | Temporary .setup file, random test password and replay device. Enroll; try five protected commands with forged flags; unlock, resume rename, then retry the same challenge. | All five denied while locked; authorized rename succeeds once. | Raw socket tests confirmed denial and one-shot authorization. Edge selected an actual setup file. | Pass |
| AUTH-02 · Revoke and restore administrative access | FR25 · system | H+B | Clock-controlled inactivity, old token, changed password and bridge restart. Advance idle clock, lock, rotate password, reconnect and restart with the saved verifier. | Old credentials/tokens fail; protection persists locked; current password works. | Expiry, lock, rotation, restart, disable and cooldown assertions passed. | Pass |

## Osagbewonrue Ugiagbe

| ID and title | Requirement / use case | Recipe | Inputs and steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| TC10 · Dashboard telemetry rendering | FR20/21/23 · UC9 | T | Mock telemetry 12,584 packets, 42.5 Mbps, 37 connections. Push one frame to the connected dashboard component (source TC08). | Displays 12,584, 42.5 Mbps and 37 connections. | All three displayed values matched. Connections count flows. | Pass |
| TC11 · Repeated dashboard updates | FR21 · UC9 | T | 200 synchronous frames with increasing counts (source TC09). Dispatch all updates and inspect final telemetry. | 20,000 packets and 20.0 Mbps. | Both final values matched; latency measured separately. | Pass |
| TC12 · Disconnected dashboard | FR20/23 · UC9 | T | Disconnected fake client, then connect/send/disconnect (source TC10). Read initial status, push a sample and disconnect. | Zero count, paused/disconnected status restored in this component. | Assertions passed for initial and disconnected states. | Pass |
| TC13 · Start live capture from Dashboard | FR01/22/23 · UC1/9/10 | V | Authorized Ethernet interface; controller connected and paused. Click Start capture and navigate to Packets. | Stop capture becomes available on the running session. | Live smoke observed the start control transition in two sessions. | Pass |
| TC14 · Stop and restart without losing history | FR05/22/23 · UC1/9/10 | V+E | Same controller; two sessions on one live source and two deterministic replay sources. Stop on Packets, inspect Dashboard, then start again. Verify retained replay rows. | Paused after stop; cumulative totals persist; two three-record replays yield six. | Two live stops completed; six replay records remained and reload restored them. | Pass |
| TC15 · Controller failure and recovery | FR22/23 · UC9/10 | T+E | Rejected control promise in component; separate real bridge stop and restart. Inspect error and paused state (source TC13), then reconnect the production view and replay. | Dismissible component error, disabled controls while disconnected, successful new replay. | Component stayed paused; Edge observed disconnect, reconnect and three fresh records. | Pass |
