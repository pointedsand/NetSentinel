# NetSentinel for Windows x64

Install the x64 Npcap runtime separately using its official installer, then run **NetSentinel-0.1.0-demo-windows-x64-setup.exe**. The desktop installer is per-user. Node, npm, Vite, MSYS2, CMake and the Npcap SDK are build tools and are unnecessary on the demonstration computer. Driver installation can require administrator permission. [Npcap download and installation guide](https://npcap.com/guide/npcap-users-guide.html)

Open **NetSentinel** from Start. When Dashboard shows **Backend connected**, choose an authorized adapter from the source menu and click **Start capture**. Use Packets to inspect and filter frames. Stop before changing the source. Opening NetSentinel again focuses its existing window. Closing the window stops the owned worker and closes its loopback connection.

For an offline demonstration, close any running instance and run the installed executable with `--demo`. For example, in PowerShell, using the path from the Start shortcut:

~~~powershell
& "$env:LOCALAPPDATA\Programs\netsentinel\NetSentinel.exe" --demo
~~~

Click **Start capture** once. The included deterministic pcap contains three ordinary ARP records and produces one replay-labeled device arrival. Replay inventory and alerts are in memory. Live monitoring preferences and security history persist in the existing per-user store. Under **Settings → Access Control**, select **Set administrator password**, copy the displayed path, use **Choose Setup File**, and enroll with a password of at least 12 characters. An existing administrator remains enrolled after upgrading. The same Windows account retains its files under `%LOCALAPPDATA%\NetSentinel`. The application installer does not contain credentials or private captures.

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

`npm run build:frontend` builds TypeScript and Vite. `npm run desktop:dev` opens the Electron development shell with built assets. `desktop:pack` builds the statically linked MinGW worker, validates its PE imports and assembles an unpacked app in `release/win-unpacked`. `desktop:installer` wraps **that directory** in NSIS and writes `release/NetSentinel-0.1.0-demo-windows-x64-setup.exe`. Repeat the packing and verification steps after changing application inputs. The [Assignment 5 guide](assignment-5/deployment.md) lists the CTest, bridge, frontend and lint commands.

## Runtime design

The desktop window opens centered on the display containing the pointer. Its default outer size is 1280 × 800 device-independent pixels. Startup sizing uses the display work area, including space reserved for the taskbar. The minimum is 1024 × 650, with normal resizing and maximizing. If a display's usable area is smaller than the minimum, the window starts at the work-area edge on that axis to keep its top-left controls reachable.

The Windows executable, window, installer and shortcuts use the sidebar logo. The title bar uses the native dark Windows frame with a navy accent where supported. Windows controls its precise caption color. If a pinned shortcut still shows the previous icon after upgrading, unpin it, reopen NetSentinel from Start and pin the running application again. Signing out and back in refreshes the Windows shell if it retains the old icon.

Electron's main process registers the privileged `netsentinel://desktop` scheme and serves only the production index and bundled assets. The renderer uses Chromium sandboxing, context isolation, a restrictive content policy and the existing WebSocket client. It receives the bound loopback port through an HTML meta element. There is no renderer preload or filesystem/process IPC. The application denies popups and unexpected navigation. The bridge still checks the exact Origin and Host and enforces protected commands on the server. [Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security) · [Protocol API](https://www.electronjs.org/docs/latest/api/protocol)

The main process starts a single in-process bridge on an available loopback port. The bridge starts the bundled worker only when capture is requested. On exit it requests worker shutdown, waits and flushes the live monitor store. Static compiler runtimes remove the MSYS2 DLL requirement. The only non-Windows DLL import is the separately installed Npcap `wpcap.dll`. The package includes Electron/Chromium notices and component licenses in `resources/capture/notices`. [Windows installer configuration](https://www.electron.build/nsis/)

## Demo build verification

On Windows 11 x64 with Npcap installed, the unpacked app and the actual per-user NSIS installation both passed `desktop/smoke.mjs`. The test selected an Intel Ethernet adapter, observed live traffic, stopped and restarted capture, opened a second instance, and verified that closing the window terminated the owned worker and released the listening port. Relaunch reopened the same isolated profile. The test used a Windows-only runtime PATH.

The packaged replay supplied the packet-inspection, protocol-filter, counter, security-alert and CSV/JSON round-trip checks. A local file chooser supplied the enrollment proof. Unlock and lock succeeded. A seeded device record tested compatibility with existing live-store data, and an edited label and trust flag survived a restart. The native download test directed Electron's download manager to a temporary path. File picker automation supplied test files. Interactive clicks in the NSIS wizard and a separate clean Windows VM were outside this run.

On the updated build the bridge passed 34/34, the frontend passed 62/62, and four desktop resource and window-sizing tests passed. Core CTest passed 4/4 and capture CTest passed 5/5, including four shared suites. TypeScript/Vite and ESLint succeeded. Repeat the desktop tests after the frontend build with `node --test desktop/renderer.test.mjs desktop/window-bounds.test.mjs`. Across 18 deterministic replay sessions, the packaged UI showed 4,320 captured frames, 4,096 stored packets, 224 evicted packets and zero output drops. A TCP filter hid the stored ARP records. Clearing the capture log reset the counters and preserved the capacity.

If interface enumeration fails, check Npcap installation, driver access and the selected Windows adapter. Raw 802.11 and Radiotap links are unsupported. The [release notes](releases/v0.1.0-demo.md) describe the measured output drops and remaining platform limits.
