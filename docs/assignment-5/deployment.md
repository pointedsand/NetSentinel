# Deployment / Final Code — TA setup and demonstration

## Deployment choice

NetSentinel runs locally on the operator's Windows computer. The tested deliverable consists of a native C++17 worker, a Node.js bridge and the React desktop-style interface served to an installed browser. Npcap supplies capture access. The bridge starts and stops the worker, retains bounded metadata and publishes updates on loopback. One controller tab manages the session. The browser presents the same pages for live monitoring and deterministic replay.

This deployment gives the TA a reproducible three-record example with no dependence on traffic arriving at a particular moment. A second fixture demonstrates a security advisory without generating network traffic. The tested live configuration also supports the physical Windows Ethernet adapter. A browser-based release requires installing the runtime, building the native worker and starting the local service. A future Electron package could bundle the frontend and launcher. It would still need a deployment strategy for the capture driver, platform libraries, installer permissions and trusted enrollment. This submission targets the tested browser workflow.

**Working-code location:** [Group 5 NetSentinel repository](https://github.com/pointedsand/NetSentinel). This verification used the working tree of `feature/ui-redesign` over `ab4487680216433aedb8143ce2640b129f9123fd`, including local changes. The remote link alone does not identify the full tested tree. Before submission, the team must supply an authorized copy of this exact source or publish an approved revision, identify it in both documents and verify TA access. No downloadable Electron executable is part of this deployment.

## Build on Windows x64

From the supplied source root, use PowerShell with 64-bit Node 24.15+ in the 24.x series and npm available on PATH. Install CMake 3.20+, Ninja, MSYS2 UCRT64 GCC with C++17 support, the Windows Npcap runtime and the x64 Npcap SDK. The SDK directory must contain `Include/pcap.h` and `Lib/x64/wpcap.lib`. Adjust the compiler and SDK example paths below to your installations. The runtime and SDK serve separate purposes. The [recorded versions](evidence/environment.txt) identify the tested environment.

~~~powershell
$env:PATH = "C:\msys64\ucrt64\bin;$env:SystemRoot\System32\Npcap;" + $env:PATH
$env:NPCAP_SDK_ROOT = 'C:\Libraries\Npcap-SDK'
cmake -S backend -B backend/build/core -G Ninja -DBUILD_CAPTURE_APP=OFF -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release
cmake --build backend/build/core
cmake -S backend -B backend/build/capture -G Ninja -DBUILD_CAPTURE_APP=ON -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Debug "-DNPCAP_SDK_ROOT=$env:NPCAP_SDK_ROOT"
cmake --build backend/build/capture
$env:NETSENTINEL_BIN = (Resolve-Path backend/build/capture/netsentinel.exe).Path
npm.cmd ci --prefix backend/service
npm.cmd ci --prefix frontend
npm.cmd --prefix frontend run build
~~~

## Run and inspect

1. Run `node dev.mjs --replay` and open **http://127.0.0.1:5173/** in Edge. Keep ports 5173 and 8080 available and use one tab. The sidebar should show **Backend connected**. **Start capture** processes three synthetic UDP frames and returns to paused. Start again to reach six. On Packets, select TCP, then UDP, and open a row. Dashboard totals remain six. Ctrl+C stops both services.
2. For a security example, run the two commands below. Generate the fixture once and reuse the file. Its records contain ordinary ARP requests from documentation addresses. Start capture. Open Devices and Alerts. The second identity appears 75 s later in fixture time and produces one replay-labeled arrival. Open its evidence and acknowledge it. Replay inventory and events live in memory.
3. For an authorized live adapter, stop the replay launcher and run `node dev.mjs --live`. Choose an Ethernet-format source, start on Dashboard, then stop on Packets. Start again and inspect retained history. Port availability, Npcap permissions and activity on the selected interface affect the result. If the link type is unsupported, select a supported adapter or return to replay. The Windows live smoke used Intel Ethernet. Linux and raw 802.11 are outside the demonstrated configuration.

~~~powershell
node backend/service/security-demo.mjs backend/build/device-arrival-fixture.pcap
node dev.mjs --replay backend/build/device-arrival-fixture.pcap
~~~

**Administrator check.** For a first enrollment use a fresh tester-controlled OS profile. Open Settings → Access Control → Set administrator password. Select **Copy Path**, then **Choose Setup File**, paste the path into the standard file dialog and open it. After **Setup file verified**, enter and confirm a password of at least 12 characters and enable protection. The new session starts locked. An expired ten-minute setup file can be renewed in the same screen. On Packets after a replay, try **Clear Capture Log**, cancel and confirm the rows remain. Retry, unlock and confirm the purge. Use **Lock Now** before testing another protected change. On an already enrolled profile use its authorized administrator. The walkthrough changes that profile's configuration. The automated Edge and Node tests use isolated temporary credentials. Keep setup files, passwords and live exports out of submission evidence.

## Reproduce the automated checks

In the same configured PowerShell from the source root:

~~~powershell
ctest --test-dir backend/build/core -V
ctest --test-dir backend/build/capture -V
g++ -std=c++17 -I. -Ibackend/include backend/src/PacketAnalyzerMain.cpp backend/src/PacketAnalyzer.cpp -o backend/build/pair-a5.exe
backend/build/pair-a5.exe
npm.cmd --prefix backend/service test
npm.cmd --prefix frontend test -- --run --reporter=verbose
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend test -- --run src/pages/__tests__/uc11_uc12.test.tsx
[Environment]::SetEnvironmentVariable('NETSENTINEL_SMOKE_DEVICE',$null,'Process')
node backend/service/browser-smoke.mjs
node docs/assignment-5/measure-throughput.mjs
node docs/assignment-5/firefox-render.mjs "$env:TEMP\netsentinel-fixture-dashboard.png"
~~~

Edge and Firefox must be installed for their respective browser checks. The Firefox probe uses a temporary profile and a test-only port override to connect the actual production bundle to an isolated replay bridge.

For the following live checks, list sources and select the index of an adapter you are authorized to capture on. The first column is the device ID. The invalid-interface command should exit **1** with `failed:true` and a paused final snapshot. Execute it separately when using a runner that stops on nonzero exit.

~~~powershell
$interfaces = @(& $env:NETSENTINEL_BIN --list-interfaces)
for ($i = 0; $i -lt $interfaces.Count; $i++) { Write-Host $i $interfaces[$i] }
$index = [int](Read-Host 'Number of the authorized Ethernet-format interface')
$device = ($interfaces[$index] -split "`t")[0]
$env:NETSENTINEL_SMOKE_DEVICE = $device
node backend/service/browser-smoke.mjs
node docs/assignment-5/measure-ui.mjs
node docs/assignment-5/measure-throughput.mjs
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File docs/assignment-5/measure-worker.ps1 -Device $device -Seconds 180
[Environment]::SetEnvironmentVariable('NETSENTINEL_SMOKE_DEVICE',$null,'Process')
& $env:NETSENTINEL_BIN --interface NETSENTINEL_NONEXISTENT_ADAPTER - - - - -
~~~

Use [the command index](README.md) to compare counts, durations and expected errors. The live probes record aggregate counters. A clean Fedora/Linux build and live smoke are still required before claiming cross-platform deployment.
