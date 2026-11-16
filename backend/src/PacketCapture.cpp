#include "PacketCapture.hpp"
#include "ProtocolParser.hpp"
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

bool capture_packets(const std::string& device_name, int max_packets, std::vector<ParsedPacket>& packets) {
    
    if (device_name.empty() || max_packets <= 0) {
        return false;
    }

    char errbuf[PCAP_ERRBUF_SIZE] = {};

    pcap_t* capture_handle = pcap_open_live(device_name.c_str(), 65535, 0, 1000, errbuf);

    if (capture_handle == nullptr) {
        std::cerr << "Failed to open interface: " << errbuf << '\n';
        return false;
    }

    //identify link_layer format 
    int link_type = pcap_datalink(capture_handle);

    if(link_type == DLT_EN10MB) {
        std::cout << "Link type: Ethernet\n";
    } else {
        std::cerr << "Unsupported link type: " << link_type << '\n';
        
        pcap_close(capture_handle);
        return false;
    }

    std::cout << "Capture started.\n";

    pcap_pkthdr* header = nullptr;
    const u_char* packet_data = nullptr;

    int captured = 0;

    while  (captured < max_packets) {
        int result = pcap_next_ex(capture_handle, &header, &packet_data);

        if (result == 1) {
            ParsedPacket parsed_packet{};

            if (parse_packet(packet_data, header->caplen, header->len, parsed_packet)) {
                packets.push_back(parsed_packet); //if parsing succeeds -> append copy of parsed_packet to vector

                std::cout << "Packet " << captured + 1 << " | Parsed successfully\n";
            } else {
                std::cerr << "Packet " << captured + 1 << " | Parsing failed\n";
            }

            captured++;
        }
       
        else if ( result == 0) {
            continue;
        
        } else if (result == -2) { //end of capture
            break;

        } else {
            std::cerr << "Capture error: " << pcap_geterr(capture_handle) << '\n';
            pcap_close(capture_handle);
            return false;
        }
    }

    pcap_close(capture_handle);
    return true;

}