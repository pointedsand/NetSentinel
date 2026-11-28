# NetSentinel — Assignment 5 verification packet

**Decision for November 30.** The Windows browser deployment supports a repeatable demonstration of capture, filtering, history, alerts and local administrator controls. Use deterministic replay for repeatable counts. The clearest open defect is that the bounded worker output queue can drop a substantial share of detail rows even while aggregate counters continue to advance. The team still needs its own signed executions and a TA-accessible copy of the tested source.

| Document | Use in the submission |
|---|---|
| [Functional plan and execution matrix](functional.md) | 33 distinct cases with test data, expected/actual observations, mappings, reproduction recipes and evidence. |
| [Team execution checklist](team-executions.md) | Separate human observations and signatures. At least four personally executed cases per member. |
| [Non-functional results](nonfunctional.md) | All 13 NFRs, numerical measurements, methods, limits and the FR27 output-loss finding. |
| [Requirements traceability matrix](requirements.md) | FR01–FR30 and NFR01–NFR13 with scope and evidence. |
| [Implementation status and limitations](implementation.md) | Running behavior by original use case, protected actions, incomplete functionality. |
| [Deployment and TA setup](deployment.md) | Rationale, requirements, build, replay/live walkthrough and exact verification commands. |
| [SE Document edits, AI disclosure and presentation updates](se-updates.md) | Page-level replacement text, deployment slide and submission checklist. |
| [Test environment](evidence/environment.txt) | Host, runtimes, Npcap, compiler, build configurations, tested base and Linux availability. |

## Execution results

All observations are from Windows on November 27, 2026. The 33 catalogued functional cases had **33 Pass, 0 Fail, 0 Blocked, 0 Not Run** at their recorded levels. Some exercise a sample, component or parser in isolation. Passing a narrow case does not close the larger requirement. Counts of CTest executables, Node tests, Vitest assertions and catalogued cases measure different things.

| Assigned human tester | Distinct cases prepared | Signed human runs on file |
|---|---:|---:|
| Evan Guadalajara | 5 | 0 |
| Ryan Chan | 5 | 0 |
| Lamaryi Ponder | 5 | 0 |
| William Bik | 5 | 0 |
| George Salmi | 7 | 0 |
| Osagbewonrue Ugiagbe | 6 | 0 |

Each command log includes the invocation, start time with offset, exit code, wall duration and output. Local paths in logs are abbreviated. Core and capture builds reused their configured build directories. Configuration commands for a new checkout are in the deployment guide. Several jobs overlapped, so wall times are observations for this run. The date on the Firefox fixture's packet rows is synthetic.

| Evidence / command log | Wall seconds | Exit | Interpretation |
|---|---:|---|---|
| [corebuild.log](evidence/corebuild.log) | 3.799 | 0 | Release core incremental build completed. |
| [capbuild.log](evidence/capbuild.log) | 4.115 | 0 | Debug Npcap incremental build completed. |
| [core.log](evidence/core.log) | 0.594 | 0 | 4/4 CTest suites passed. Release test targets explicitly enable assertions. |
| [capture.log](evidence/capture.log) | 0.874 | 0 | 5/5 passed, including the four shared suites and capture lifecycle. |
| [pairbuild.log](evidence/pairbuild.log) | 1.774 | 0 | Standalone host-pair analyzer built. |
| [pair.log](evidence/pair.log) | 0.322 | 0 | Compared the directional counts and byte totals with UT-09/10. |
| [node.log](evidence/node.log) | 8.883 | 0 | 33/33 passed, zero skipped. Includes real bridge, authorization, session restart, replay, disposal and fixtures. |
| [frontend.log](evidence/frontend.log) | 36.503 | 0 | 61/61 passed across 12 Vitest files. |
| [legacy-vitest.log](evidence/legacy-vitest.log) | 5.351 | 0 | 14/14 in the historical UC11/12 file. Included in the 61. |
| [vite.log](evidence/vite.log) | 16.320 | 0 | TypeScript and Vite production build completed. |
| [lint.log](evidence/lint.log) | 37.783 | 0 | ESLint completed. |
| [edge-replay.log](evidence/edge-replay.log) | 10.549 | 0 | Real production UI replay, protected operations, exports/import, trust, reconnect and fixture alerts passed. |
| [edge-live.log](evidence/edge-live.log) | 3.284 | 0 | Two physical Ethernet sessions started on Dashboard and stopped on Packets. 199 frames observed. |
| [invalid.log](evidence/invalid.log) | 0.286 | 1 expected | Nonexistent adapter produced an error and a failed/paused snapshot. |
| [baseline.log](evidence/baseline.log) | 0.601 | 0 wrapper | Attempt invalid. PowerShell policy prevented sampler launch. No samples. |
| [worker.log](evidence/worker.log) | 181.154 | 0 | Successful replacement using a process-local script policy. 180.273 worker seconds. |
| [latency.log](evidence/latency.log) | 22.500 | 0 | 96 eligible live batches matched dashboard updates. 200 deterministic detector samples. |
| [replay-rate.log](evidence/replay-rate.log) | 1.071 | 0 | 30,000 synthetic frames accounted for, including discarded details. |
| [ambient-rate.log](evidence/ambient-rate.log) | 60.461 | 0 | Independent 60 s live sample accounted for 25,363 parsed records. |
| [firefox.log](evidence/firefox.log) | 0.384 | 1 | Initial attempt could not bind port 8080. |
| [firefox-isolated.log](evidence/firefox-isolated.log) | 1.737 | 0 | Isolated bridge port. Startup dashboard rendered before capture. |
| [firefox-replay.log](evidence/firefox-replay.log) | 45.624 | 1 | Replay probe timed out. Its button matcher included the decorative icon in the text. |
| [firefox-confirmed.log](evidence/firefox-confirmed.log) | 1.784 | 0 | Corrected the probe selector. Firefox showed all three fixture records at 1366 × 768. |

## Verification changes

Two C++ test files contain Assignment 5 regression assertions. [ProtocolParserTests.cpp](../../backend/tests/ProtocolParserTests.cpp) distinguishes ARP network metadata, a truncated body and the Other transport bucket. [PacketFilteringTests.cpp](../../backend/tests/PacketFilteringTests.cpp) verifies both near misses in the conjunction of TCP and destination port 443. Existing handwritten comments were retained. The other product changes in the dirty working tree predate this verification packet.

The source for the measured procedures is included: [worker CPU/memory sampler](measure-worker.ps1), [bridge/DOM and detector timing](measure-ui.mjs), [live and synthetic throughput](measure-throughput.mjs), [Firefox replay check](firefox-render.mjs). The two Firefox screenshots represent [initial startup](evidence/firefox-dashboard.png) and [confirmed replay](evidence/firefox-replay.png). The performance probes use aggregate counters or synthetic fixture screenshots. No live packet exports or credentials are supplied.

## Handoff before November 30

1. Each of the six team members executes and signs at least four allocated cases. Save individual evidence for the 24 required human runs and include any different observations.
2. Confirm access to an authorized source snapshot reproducing the local changes. Verify the setup on the TA's intended Windows environment and put the accessible revision/link in the document and slides.
3. Insert the page-specific passages, matrices, deployment rationale and AI disclosure in the team originals. Export the final document and presentation in the rubric's accepted formats and check the links from the exported copies.
4. Rehearse the three-record replay, fixture arrival, protected operation and authorized live capture. Present FR27 loss explicitly. Keep Linux, physical interface removal and multi-hour endurance open until direct evidence exists.
