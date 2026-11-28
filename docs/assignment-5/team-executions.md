# Team member execution record

Assignment 5 requires at least 20 distinct functional cases and at least four **personally executed and documented** cases per member. The 33 allocations below are distinct. All human entries are pending. Four per person from these nonoverlapping assignments would produce 24 distinct human executions.

1. Complete [Windows setup](deployment.md). Use the same reviewed checkout or record the tested revision and local changes.
2. Run the [functional matrix](functional.md) recipe for each ID. A suite may exercise multiple cases; record the observation for each ID individually. Preserve the terminal output or a fixture-only screenshot. For Edge, record the pass line and inspect the corresponding workflow and expected assertion in `backend/service/browser-smoke.mjs`.
3. Save evidence as `<initials>-<ID>-<date>` in the team's submission evidence folder. Omit local usernames, setup files, secrets and private network traffic. Enter the observed value and disposition even if it differs from Codex's.
4. Each tester signs or initials and dates their own rows. A reviewer should verify at least four completed rows per person and access to the submitted source.

## Evan Guadalajara

| ID | Run (recipe in matrix) | Expected observation / evidence to save | Actual result | Pass / Fail / Blocked | Evidence file | Executor signature and date |
|---|---|---|---|---|---|---|
| UT-01 | P | 192.168.1.10:49152 to 8.8.8.8:443, TCP, 54 B | | | | |
| UT-02 | P | 10.0.0.1:12345 to 10.0.0.2:53, UDP | | | | |
| UT-03 | P | Returns false | | | | |
| UT-04 | P+D | Short frame reports ARP/truncated, Other transport, no ports, 60 B. Full request yields opcode 1 and sender IP. | | | | |
| UT-11 | D | Tags 1 and 2, ::1, UDP destination 80; truncated cuts flagged | | | | |

## Ryan Chan

| ID | Run (recipe in matrix) | Expected observation / evidence to save | Actual result | Pass / Fail / Blocked | Evidence file | Executor signature and date |
|---|---|---|---|---|---|---|
| UT-05 | F | Only TCP matches | | | | |
| UT-06 | F | Only 443 matches | | | | |
| UT-07 | F | Only .10 matches | | | | |
| UT-08 | F | Only TCP/443 accepted | | | | |
| DEV-01 | I | Same identity retains label/trust; different MAC remains untrusted. | | | | |

## Lamaryi Ponder

| ID | Run (recipe in matrix) | Expected observation / evidence to save | Actual result | Pass / Fail / Blocked | Evidence file | Executor signature and date |
|---|---|---|---|---|---|---|
| SEC-01 | S | Quiet baseline; one initial arrival; trusted/off suppress; rate cap enforced. | | | | |
| SEC-02 | S | One alternating-claim advisory; no event for stable replacement or off-link sequence. | | | | |
| SEC-03 | S | Transient change quiet; confirmed change triggers one event without crossing scopes. | | | | |
| SEC-04 | S | One sustained trigger, next allowed after cooldown; replay ignored; zero threshold rejected. | | | | |
| SEC-05 | S | Two devices retained and zero security events. | | | | |

## William Bik

| ID | Run (recipe in matrix) | Expected observation / evidence to save | Actual result | Pass / Fail / Blocked | Evidence file | Executor signature and date |
|---|---|---|---|---|---|---|
| UT-09 | A | Four matching packets, TCP 2, UDP 1, ICMP 1, Other 0. | | | | |
| UT-10 | A | Forward 1,704 B; combined 1,764 B. | | | | |
| TC06 | E+J | 6/2/1 data rows and original fields and quoted name preserved. | | | | |
| TC07 | E | Six total despite filter; zero TCP matches; six UDP rows restored. | | | | |
| RATE-01 | R | 1, 0 and 2 Mbps for respective windows; cumulative total 375,000 B. | | | | |

## George Salmi

| ID | Run (recipe in matrix) | Expected observation / evidence to save | Actual result | Pass / Fail / Blocked | Evidence file | Executor signature and date |
|---|---|---|---|---|---|---|
| TC01 | E+B | Authorized deletion clears events; persisted test store reopens empty. | | | | |
| TC02 | L | Both named sample rows remain. | | | | |
| TC03 | L | Button disabled and empty status visible. | | | | |
| TC04 | L | No parser error; interface eth0 and threshold 100. | | | | |
| TC05 | L | Safe defaults and configuration warning. | | | | |
| AUTH-01 | B+E | All five denied while locked; authorized rename succeeds once. | | | | |
| AUTH-02 | H+B | Old credentials/tokens fail; protection persists locked; current password works. | | | | |

## Osagbewonrue Ugiagbe

| ID | Run (recipe in matrix) | Expected observation / evidence to save | Actual result | Pass / Fail / Blocked | Evidence file | Executor signature and date |
|---|---|---|---|---|---|---|
| TC10 | T | Displays 12,584, 42.5 Mbps and 37 connections. | | | | |
| TC11 | T | 20,000 packets and 20.0 Mbps. | | | | |
| TC12 | T | Zero count, paused/disconnected status restored in this component. | | | | |
| TC13 | V | Stop capture becomes available on the running session. | | | | |
| TC14 | V+E | Paused after stop; cumulative totals persist; two three-record replays yield six. | | | | |
| TC15 | T+E | Dismissible component error, disabled controls while disconnected, successful new replay. | | | | |
