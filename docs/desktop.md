# NetSentinel for Windows x64

Install the x64 Npcap runtime separately using its official installer, then run **NetSentinel-0.1.1-demo-windows-x64-setup.exe**. The desktop installer is per-user. Node, npm, Vite, MSYS2, CMake and the Npcap SDK are build tools and are unnecessary on the demonstration computer. Driver installation can require administrator permission. [Npcap download and installation guide](https://npcap.com/guide/npcap-users-guide.html)

Open **NetSentinel** from Start. When Dashboard shows **Backend connected**, choose an authorized adapter from the source menu and click **Start capture**. Use Packets to inspect and filter frames. Stop before changing the source. Opening NetSentinel again focuses its existing window. Closing the window stops the owned worker and closes its loopback connection.

For an offline demonstration, close any running instance and run the installed executable with `--demo`. For example, in PowerShell, using the path from the Start shortcut:

~~~powershell
& "$env:LOCALAPPDATA\Programs\netsentinel\NetSentinel.exe" --demo
~~~

Click **Start capture** once. The included deterministic pcap contains three ordinary ARP records and produces one replay-labeled device arrival. Replay inventory and alerts are in memory. Live monitoring preferences and security history persist in the existing per-user store. Under **Settings → Access Control**, select **Set administrator password**, copy the displayed path, use **Choose Setup File**, and enroll with a password of at least 12 characters. An existing administrator remains enrolled after upgrading. The same Windows account retains its files under `%LOCALAPPDATA%\NetSentinel`. The application installer does not contain credentials or private captures.

## Packet history

Open **Settings → Monitoring → Packet History & Performance** to select 5,000, 10,000, 30,000 (default), or 50,000 recent packet records. The bridge applies a change immediately and requests administrator unlock when protection is enabled. The choice survives restarting Electron and applies to both live and demo modes. Reducing capacity permanently removes the oldest excess records. Starting another capture keeps the surviving records. Closing the application clears them.

**Packets → Session details** shows the retained count, capacity and history evictions. **Captured frames** includes rejected frames and spans starts and stops until a clear or restart. **Output drops** counts worker mailbox losses. Neither counter depends on the current filter.

Export **All** writes the retained metadata in newest-first order. **Filtered View** and **Selected Packets** export subsets of those same records. JSON includes packet details. CSV contains the summary columns. In the desktop app, choose **Save archive** to write a timestamped file to **Documents/NetSentinel_Logs/**. Electron resolves the current account’s Documents location. Open **Logs → Packet Captures** to browse filenames, modified times, sizes and available counts. Click a file row or focus it and press Enter or Space to open the viewer below. Type a page number and press Enter to jump. Use **Refresh Archives** after an external change or **Import External Log** for a file elsewhere. The browser build continues to use downloads.

In **Devices**, use **Trust** or **Untrust** on a card. Double-click its name to edit the saved label. Enter or clicking outside saves a valid edit, and Escape cancels it. These actions use administrator authorization when protection is enabled. Open **Details** and expand **Associated Endpoints** or **Associated Packets** to inspect observations. Select a packet time to open its details.

Archives have independent limits of 128 MiB and 100,000 records. Listing reads directory metadata only. Opening validates UTF-8 CSV or JSON incrementally in chunks of up to 256 KiB, including quoted CSV fields and nested JSON packet details. The viewer holds bounded packet summaries and displays 20 rows per page. **Close log** releases the open summaries. The eight CSV columns and displayed JSON summary strings allow up to 1,024 characters per field. The parser rejects records over 262,144 UTF-16 code units and JSON nesting beyond 64 levels. Export batches contain at most 128 rows and each serialized row is limited to 256 KiB. The app flushes a temporary file before publishing a unique final name via a hard link. The Documents volume must support hard links. Archiving happens on explicit export.

While inspecting older packets, the virtual table keeps the first visible packet and its partial-row offset as batches arrive. If eviction removes that packet, it shows the nearest surviving records. **Jump to newest** resumes following capture. A five-second notice reports new worker mailbox losses. The cumulative total remains in Session details.

## Build and test

Use Windows x64, Node 24.15+ in the 24.x series, npm, MSYS2 UCRT64 GCC/binutils/CMake/Ninja, the x64 Npcap SDK and the installed runtime. Adjust the two build-machine paths below. Run from the repository root. Keep the two existing npm projects and the root packaging lockfile together.

~~~powershell
$env:PATH = "C:\msys64\ucrt64\bin;$env:SystemRoot\System32\Npcap;" + $env:PATH
$env:NPCAP_SDK_ROOT = 'C:\Libraries\Npcap-SDK'
npm.cmd ci
npm.cmd ci --prefix backend/service
npm.cmd ci --prefix frontend
npm.cmd run desktop:pack
$env:NETSENTINEL_SMOKE_ADAPTER = 'Intel(R) Ethernet'
npm.cmd run desktop:smoke
npm.cmd run desktop:installer
~~~

Set the smoke adapter to a distinctive substring of the description of an authorized active Ethernet-format interface on your machine. The smoke script creates a temporary profile and temporary administrator, restricts the runtime PATH to Windows directories, exercises demo and live modes, and verifies worker and port cleanup. It requires incoming traffic for the live counter assertion. Run the installer, then repeat the smoke against the actual installed executable:

~~~powershell
npm.cmd run desktop:smoke -- "$env:LOCALAPPDATA\Programs\netsentinel\NetSentinel.exe"
~~~

`npm run build:frontend` builds TypeScript and Vite. `npm run desktop:dev` opens the Electron development shell with built assets. `desktop:pack` builds the statically linked MinGW worker, validates its PE imports and assembles an unpacked app in `release/win-unpacked`. `desktop:installer` wraps **that directory** in NSIS and writes `release/NetSentinel-0.1.1-demo-windows-x64-setup.exe`. Repeat the packing and verification steps after changing application inputs. The [Assignment 5 guide](assignment-5/deployment.md) lists the CTest, bridge, frontend and lint commands.

## Runtime design

The desktop window opens centered on the display containing the pointer. Its default outer size is 1280 × 800 device-independent pixels. Startup sizing uses the display work area, including space reserved for the taskbar. The minimum is 1024 × 650, with normal resizing and maximizing. If a display's usable area is smaller than the minimum, the window starts at the work-area edge on that axis to keep its top-left controls reachable.

The Windows executable, window, installer and shortcuts use the sidebar logo. The title bar uses the native dark Windows frame with a navy accent where supported. Windows controls its precise caption color. If a pinned shortcut still shows the previous icon after upgrading, unpin it, reopen NetSentinel from Start and pin the running application again. Signing out and back in refreshes the Windows shell if it retains the old icon.

Electron's main process registers the privileged `netsentinel://desktop` scheme and serves only the production index and bundled assets. The renderer uses Chromium sandboxing, context isolation, a restrictive content policy and the existing WebSocket client. It receives the bound loopback port through an HTML meta element. A sandboxed preload exposes scoped archive operations. The main process checks the sending window, main frame and exact desktop URL. The renderer can request bounded reads of regular archive files and batched exports to generated filenames. The application denies popups and unexpected navigation. The bridge still checks the exact Origin and Host and enforces protected commands on the server. [Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security) · [Protocol API](https://www.electronjs.org/docs/latest/api/protocol)

The main process starts a single in-process bridge on an available loopback port. The bridge starts the bundled worker only when capture is requested. On exit it requests worker shutdown, waits and flushes the live monitor store. Static compiler runtimes remove the MSYS2 DLL requirement. The only non-Windows DLL import is the separately installed Npcap `wpcap.dll`. The package includes Electron/Chromium notices and component licenses in `resources/capture/notices`. [Windows installer configuration](https://www.electron.build/nsis/)

## Archive and delivery verification on Windows x64

The packaged smoke test uses temporary Documents and profile directories. It saves 30,000 replay records, changes live retention to 5,000, clears live history, and opens the saved archive before and after restarting Electron. It also checks both export formats, filtered and selected exports, external file import, all six pages at default and minimum size, and packet selection and scroll position during physical Ethernet capture.

The native drop counter increments when the worker cannot enqueue a record. Its cumulative snapshots include previous capture runs once while the bridge remains open. Resizing history only changes retained rows and the eviction counter. A paused shrink from 30,000 to 5,000 in a regression fixture preserved 943 prior output drops while adding exactly 25,000 evictions. A fixed warning total cannot date the losses. Driver drops are unmeasured.

In three runs of the same 30,000-frame ARP pcap with the default 256-record mailbox, the prior packaged worker delivered 256 each time. Early waking delivered 12,755–12,969 records on this machine. In every run, delivered records plus queue losses equaled 30,000. These are maximum-speed offline replays. Live results depend on traffic and reader speed. Run the controlled stalled-reader check with the bridge suite, and run the archive, renderer and window unit tests with `node --test desktop/*.test.mjs`.

## Expanded-history verification on Windows x64

The installer payload passed the desktop smoke test with an isolated profile. The test replayed 84,000 deterministic Ethernet/ARP records across 28 starts, verified the newest and oldest available IDs at every capacity, and saw zero output drops. Each 3,000-frame replay used the existing worker mailbox override of 4,096 so burst delivery could be tested separately from retention. The production mailbox defaults to 256. Reloading the renderer restored all 50,000 records through the paged history protocol. The 1024 × 650 Settings control, replay-to-live preference persistence, changing capacity during live capture, and clearing history were exercised.

| Replay checkpoint | Bridge / Electron main working set | Renderer working set |
| --- | ---: | ---: |
| Empty | 113 MiB | 96 MiB |
| 30,000 retained | 154 MiB | 165 MiB |
| 50,000 retained | 207 MiB | 218 MiB |
| 10,000 after shrinking and another replay | 213 MiB | 196 MiB |
| 5,000 after shrinking and another replay | 215 MiB | 213 MiB |

These Windows working-set samples include the process runtimes. Lowering the limit freed record references immediately. In a test-only collection, used renderer JavaScript heap fell from 31 MiB at 50,000 records to 8 MiB at 5,000. A process can keep committed pages for reuse. At 50,000 records, a 20,000-row scroll took 29 ms, text search took 36 ms, and a protocol filter took 25 ms, including automation and two animation frames. The test checked that fewer than 50 data rows were mounted and that a selected record and its details stayed anchored when 3,000 new frames arrived.

The packaged live smoke test used an authorized Intel Ethernet adapter. Over 6.4 seconds of active capture the bridge used 0.7%, renderer 2.5%, and native capture worker 0.7% of one logical core. Their working sets were 115, 124, and 9 MiB respectively. The deterministic replay establishes retention and interaction behavior at scale. It does not measure sustained high-rate live traffic, worst-case record sizes, or Linux performance.

## Demo build verification

On Windows 11 x64 with Npcap installed, the unpacked app and the actual per-user NSIS installation both passed `desktop/smoke.mjs`. The test selected an Intel Ethernet adapter, observed live traffic, stopped and restarted capture, opened a second instance, and verified that closing the window terminated the owned worker and released the listening port. Relaunch reopened the same isolated profile. The test used a Windows-only runtime PATH.

The packaged replay supplied the packet-inspection, protocol-filter, counter, security-alert and CSV/JSON round-trip checks. A local file chooser supplied the enrollment proof. Unlock and lock succeeded. A seeded device record tested compatibility with existing live-store data, and an edited label and trust flag survived a restart. In the original demo build, the native download test directed Electron's download manager to a temporary path. File picker automation supplied test files. Interactive clicks in the NSIS wizard and a separate clean Windows VM were outside this run.

On the original demo pre-release the bridge passed 34/34, the frontend passed 62/62, and four desktop resource and window-sizing tests passed. Core CTest passed 4/4 and capture CTest passed 5/5, including four shared suites. TypeScript/Vite and ESLint succeeded. Repeat the desktop tests after the frontend build with `node --test desktop/renderer.test.mjs desktop/window-bounds.test.mjs`. Across 18 deterministic replay sessions, the packaged UI showed 4,320 captured frames, 4,096 stored packets, 224 evicted packets and zero output drops. A TCP filter hid the stored ARP records. Clearing the capture log reset the counters and preserved the capacity.

If interface enumeration fails, check Npcap installation, driver access and the selected Windows adapter. Raw 802.11 and Radiotap links are unsupported. See the [v0.1.1-demo release notes](releases/v0.1.1-demo.md) for supported workflows and platform limits.
