#include "PacketCapture.hpp"
#include <cstdlib>
#include <memory>
#include <thread>
#include <chrono>
#include <pcap.h>
#include <iostream>

/*
npcap functions
---------------
 - pcap_open_live(): opens a network interface for packet capture
 - pcap_next_ex(): retrieves the next captured packet
 - pcap_geterr(): retrieves an err msg
 - pcap_close(): closes capture session

 PacketCapture.cpp TODO
 ---------------
  - clean up code by creating sub-functions to increase readibility
  - add functionality for non-ethernet packet headers
*/

bool run_capture(const std::string& device_name, int max_packets, const PacketFilter& filter,
                 TrafficTotals& totals, const std::atomic_bool& stop, const RecordSink& sink,
                 CaptureSource source, const StatsSink& snapshot) {
    
    if (device_name.empty() || max_packets < 0 || !sink) {
        return false;
    }

    char errbuf[PCAP_ERRBUF_SIZE] = {};

    std::unique_ptr<pcap_t, decltype(&pcap_close)> handle(
        source == CaptureSource::Interface ? pcap_open_live(device_name.c_str(), 65535, 0, 100, errbuf)
                                           : pcap_open_offline(device_name.c_str(), errbuf), pcap_close);
    auto* capture_handle = handle.get();

    if (capture_handle == nullptr) {
        std::cerr << "Failed to open interface: " << errbuf << '\n';
        return false;
    }

    //identify link_layer format 
    int link_type = pcap_datalink(capture_handle);

    if(link_type == DLT_EN10MB) {
        std::clog << "Link type: Ethernet\n";
    } else {
        std::cerr << "Unsupported link type: " << link_type << '\n';
        

        return false;
    }

    if (source == CaptureSource::Interface && pcap_setnonblock(capture_handle, 1, errbuf) < 0) {
        std::cerr << "Cannot configure capture: " << errbuf << '\n';
        return false;
    }

    pcap_pkthdr* header = nullptr;
    const u_char* packet_data = nullptr;

    const bool diagnostics = std::getenv("NETSENTINEL_DIAGNOSTICS") != nullptr;
    const bool retain_hidden = std::getenv("NETSENTINEL_HISTORY") != nullptr;
    RecentFlows flows;
    uint64_t captured = 0;
    auto next_snapshot = std::chrono::steady_clock::now();

    while (!stop.load() && (max_packets == 0 || captured < static_cast<uint64_t>(max_packets))) {
        const auto now = std::chrono::steady_clock::now();
        if (snapshot && now >= next_snapshot) {
            totals.active_connections = flows.count();
            snapshot(totals);
            next_snapshot = now + std::chrono::milliseconds(200);
        }
        int result = pcap_next_ex(capture_handle, &header, &packet_data);

        if (result == 1) {
            ParsedPacket parsed_packet{};

            const auto decision = process_frame(packet_data, header->caplen, header->len, filter, totals, parsed_packet, diagnostics);
            if (decision != PacketDecision::Invalid) flows.observe(parsed_packet);
            if (decision == PacketDecision::Display || (retain_hidden && decision == PacketDecision::Hidden) ||
                (diagnostics && decision == PacketDecision::Invalid)) {
                const int64_t stamp = int64_t(header->ts.tv_sec) * 1000000 + header->ts.tv_usec;
                if (!sink({std::move(parsed_packet), stamp, header->caplen, decision == PacketDecision::Display})) {
                    ++totals.output_drops;
                }
            }

            captured++;
        }
       
        else if ( result == 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        
        } else if (result == -2) { //end of capture
            break;

        } else {
            std::cerr << "Capture error: " << pcap_geterr(capture_handle) << '\n';

            return false;
        }
    }


    totals.active_connections = flows.count();
    return true;
}

bool capture_packets(const std::string& device_name, int max_packets, std::vector<ParsedPacket>& packets) {
    if (max_packets <= 0) return false;
    TrafficTotals totals;
    std::atomic_bool stop{false};
    return run_capture(device_name, max_packets, PacketFilter({}), totals, stop,
        [&](CaptureRecord&& record) {
            auto& parsed_packet = record.packet;
                packets.push_back(parsed_packet); //if parsing succeeds -> append copy of parsed_packet to vector
            return true;
        });
}
