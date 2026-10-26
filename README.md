# NetSentinel: Frontend
**Team Members**
 - Osagbewonrue Ugiagbe
 - George Salmi
 - William Bik

### Tech Stack
 - Framework: React
 - Language: TypeScript
 - Build Tool: Vite
 - Package Manager: npm / Node.js
 - Desktop Framework: Electron
 - Backend Communication Layer: Planned for 2-way WebSocket
 - Supported Platforms: Windows and hopefully Linux

### How to setup on your machine:
1. **Install Prerequisites**
   - Git https://git-scm.com/downloads
   - Node.js (LTS) https://nodejs.org/ (Node.js includes npm, so it does not need to be installed separately.)
   
On Windows, use powershell to verify installation: 
```text
git --version
node --version
npm --version
```
2. **Clone repo**
Open your terminal and navigate to your development directory
```text
git clone https://github.com/pointedsand/NetSentinel.git
cd NetSentinel
```
switch to the frontend branch:
```text
git switch frontend
git pull origin frontend
```
3. **Install dependencies**
Navigate to frontend directory
```text
cd frontend
```
install project dependencies
```text
npm ci
```
This will install the packages specified in `package-lock.json` (so far React, Vite, TS, and any others)

Note: DO NOT INIT ANOTHER VITE PROJECT. IT IS ALREADY CONFIGURED.

4. **Start the dev server**
run:
```text
npm run dev
```
Vite will start a local dev server, you can open the url by clicking on it to view the application.

Changes to React files will automatically appear in the browser while the server is running
(ctrl + c to stop server in terminal)

5. **Updating your repo**
Before starting development, pull latest changes from frontend branch
```text
git switch frontend
git pull origin frontend
```
if any dependencies have changed go back to step 3.

6. **Working on your assigned branch**
switch to your assigned page or feature branch:
example:
```text
git switch page/dashboard
```
if for some reason the branch is not available locally, fetch remote branches first:
```text
git fetch origin
git switch --track origin/page/dashboard
```

after making changes, commit and push them:
```text
git add .
git commit -m "Describe your changes"
git push
```


## Features
##### Dashboard
*page/dashboard*
 - Display overview of live network activity
 - Show traffic graphs, packet counts, and bandwidth usage
 - Display security alerts and network statistics

##### Packet Viewer
*page/packet-viewer*
 - Display captured packets in a real-time table
 - Filter packets by protocol, IP address, or port
 - Select packets to inspect detailed header and protocol information

##### Device Management
*page/device-management*
 - Display discovered devices on the local network
 - Show IP addresses, MAC addresses, and hostnames
 - Allow users to label known devices and identify new/unknown devices

##### Security Alerts
*page/security-alerts*
 - Display detected threats and suspicious network activity
 - Show security warnings, timestamps, and alert history
 - Allow users to configure security alert thresholds

##### Log Viewer
*page/log-viewer*
 - View saved packet captures and security logs
 - Browse and inspect previously captured packet data
 - Export packet captures for later analysis

##### Settings
*page/settings*
 - Select network interfaces for packet capture
 - Configure capture preferences and application settings
 - Manage network monitoring and display preferences

##### App Shell
*feature/app-shell*
 - Create the main application layout and navigation sidebar
 - Set up React routing between pages
 - Implement shared UI components, styling, and themes
 - Integrate Electron with the React application

### Branch Organization
```
main
└── frontend
    ├── feature/app-shell
    ├── page/dashboard
    ├── page/packet-viewer
    ├── page/device-management
    ├── page/security-alerts
    ├── page/log-viewer
    └── page/settings
```

##### Workflow
 1. Switch to your assigned page/feature branch
 2. Implement & test changes
 3. Open pull request targeting frontend
 4. Review and merge approved changes
 5. Periodically integrate frontend with main when things are working well.
