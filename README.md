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
