# 🛡️ NetSentinel
*CS/CE 3354 Team 5*

**NetSentinel** is a cross-platform network monitoring and security analysis application designed to capture, inspect, and analyze network traffic in real time.

NetSentinel provides an interface for monitoring network activity, discovering connected devices, and identifying potentially suspicious traffic.

The application uses a **C++ backend** for network processing and a **React + Electron frontend** for visualization and user interaction.

### 👥 Team Members

**Backend Development**
- Evan Guadalajara
- Ryan Chan
- Lamaryi Ponder

**Frontend Development**
- Osagbewonrue Ugiagbe
- George Salmi
- William Bik

## 🚀 Features

###  Packet Capture & Inspection
- Capture live network traffic from selected network interfaces.
- Decode and inspect packet headers, protocols, and payload information.
- Filter traffic by protocol, IP address, or port.

###  Network Statistics
- Monitor packet counts, bandwidth usage, and traffic rates.
- Visualize network activity through real-time graphs and statistics.
- Analyze protocol distribution and network utilization.

###  Network Discovery
- Discover devices connected to the local network.
- Identify IP addresses, MAC addresses, and hostnames.
- Maintain a device inventory and recognize new or unknown devices.

###  Security Monitoring
- Detect suspicious traffic patterns and unusual network activity.
- Generate alerts for unknown devices and abnormal traffic spikes.
- Configure security thresholds and review alert history.

###  Packet Storage & Logging
- Save and load captured packet data.
- Export packet captures for later analysis.
- Maintain timestamped logs of security events.

###  Desktop Interface
- Modern graphical interface built with React and Electron.
- Dedicated pages for packets, statistics, devices, alerts, and logs.
- Real-time communication with the C++ backend.

##  Technology Stack

| Component | Technology |
|---|---|
| Backend | C++ |
| Build System | CMake |
| Packet Capture | Npcap (Windows) / libpcap (Linux) |
| Frontend | React + TypeScript |
| Frontend Build Tool | Vite |
| Package Manager | npm / Node.js |
| Desktop Framework | Electron |
| Communication | Bidirectional WebSocket (planned) |
| Target Platforms | Windows / Linux (planned) |

##  Architecture

NetSentinel separates network processing from the user interface to improve performance, maintainability, and modularity.

```text
┌────────────────────────────────────┐
│         Electron + React           │
│                                    │
│  Dashboard | Packets | Devices     │
│  Security  | Logs    | Settings    │
└─────────────────┬──────────────────┘
                  │
           WebSocket / IPC
                  │
┌─────────────────▼──────────────────┐
│            C++ Backend             │
│                                    │
│  Packet Capture & Parsing          │
│  Filtering & Traffic Statistics    │
│  Network Discovery                 │
│  Security Monitoring & Storage     │
└─────────────────┬──────────────────┘
                  │
            Npcap / libpcap
                  │
┌─────────────────▼──────────────────┐
│       Network Interfaces           │
└────────────────────────────────────┘
```

##  Branch Organization

Development is divided between frontend and backend teams. Features are implemented independently and integrated into the main application after testing and review.

```text
main
├── backend
│   ├── feature/packet-capture
│   ├── feature/protocol-parser
│   ├── feature/packet-filtering
│   ├── feature/network-discovery
│   ├── feature/traffic-statistics
│   ├── feature/security-monitoring
│   ├── feature/packet-storage
│   └── feature/backend-api
│
└── frontend
    ├── feature/app-shell
    ├── page/dashboard
    ├── page/packet-viewer
    ├── page/device-management
    ├── page/security-alerts
    ├── page/log-viewer
    └── page/settings
```

*Branch hierarchy represents the intended development workflow.*

##  Development Workflow

1. Develop functionality on the assigned feature or page branch.
2. Test changes before submitting a pull request.
3. Merge approved changes into `backend` or `frontend`.
4. Integrate completed and tested components into `main`.
5. Keep `main` as the stable, integrated version of NetSentinel.

---

### 📌 Project Status

**In Development** 

**NetSentinel | Software Engineering Team 5 — Fall 2026**
