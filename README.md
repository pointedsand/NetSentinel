# NetSentinel: Backend
**Team Members** 
 - Evan Guadalajara
 - Ryan Chan
 - Lamaryi Ponder

### Tech Stack
 - Language: C++
 - Build System: CMake
 - Packet Capture: Npcap (windows) / libpcap (linux)
 - Frontend communication layer: planned for 2way websocket
 - Supported platforms: windows and hopefully linux

## Features
##### Packet Capture 
*feature/packet-capture* - Evan 
 - Capture live network traffic from selected interface
 - Start, stop, and manage capture sessions
 - Collect raw packets for processing

##### Protocol Parser
*feature/protocol-parser* - Evan 
 - Decode packet headers and protocol info
 - Extract source/dest IP addresses and ports
 - Identify protocols and inspect packet contents

##### Packet Filtering
*feature/packet-filtering* 
 - Filter network traffic by protocol, IP address, or port
 - Support for common protocols like: TCP, UDP, ICMP
 - Reduce unnecessary traffic during analysis

##### Network Discovery
*feature/network-discovery*
 - Discover devices connected to the local network
 - Identify IP addresses, MAC addresses, and hostnames
 - Maintain a device list and recognize new/unknown devices

##### Traffic Statistics 
*feature/traffic-statistics*
 - Track packet counts, byte totals, and traffic rates
 - Calculate bandwidth usage and protocol distribution
 - Provide real-time statistics to the frontend

##### Security Monitoring
*feature/security-monitoring*
 - Detect suspicious traffic patterns and unusual activity
 - Identify unknown devices joining network
 - Generate security alerts based on configurable thresholds

##### Packet Storage
*feature/packet-storage* 
 - Save and load captured packet data
 - Export packet captures for later analysis
 - Record security events with timestamps

##### Backend API
*feature/backend-api*
 - Establish communication layer between C++ and react/electron
 - send packet data, stats, and alerts to the frontend
 - receive commands for capture sessions and filtering


### Branch Organization
```
main
└── backend
    ├── feature/packet-capture
    ├── feature/protocol-parser
    ├── feature/packet-filtering
    ├── feature/network-discovery
    ├── feature/traffic-statistics
    ├── feature/security-monitoring
    ├── feature/packet-storage
    └── feature/backend-api
```

##### Workflow
 1. Switch to your assigned feature branch
 2. Implement & test changes
 3. Open pull request targeting backend
 4. Review and merge approved changes
 5. Periodically integrate backend with main when things are working well. 

Reach out to me (evan) if you have any questions
