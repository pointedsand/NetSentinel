#include "NetworkInterface.hpp"
#include "PacketCapture.hpp"
#include <iostream>
#include <vector>


//for debugging purposes
//if ParsedPacket member fields are blank MOST LIKELY CAUSE is that functionality has not been included for that
//type of packet header YET
void print_packets(const std::vector<ParsedPacket>& packets) {
    for (const ParsedPacket& packet : packets) {
        std::cout << "Source IP: " << packet.source_ip << '\n';
        std::cout << "Destination IP: " << packet.destination_ip << '\n';

        switch (packet.protocol) {
            case Protocol::TCP:
                std::cout << "Protocol: TCP\n";
                break;
            case Protocol::UDP:
                std::cout << "Protocol: UDP\n";
                break;
            case Protocol::ICMP:
                std::cout << "Protocol: ICMP\n";
                break;
            default:
                std::cout << "Protocol: Other\n";
        }

        if (packet.source_port.has_value()) {
            std::cout << "Source port: " << packet.source_port.value() << '\n';
        }

        if (packet.destination_port.has_value()) {
            std::cout << "Destination port: " << packet.destination_port.value() << '\n';
        }

        std::cout << "Packet size: " << packet.packet_size << " bytes\n\n";
    }
}

int main() {
    std:: string device_name = select_network_interface();

    if (device_name.empty()) {
        return 1;
    }
    
    std::cout << "Selected: " << device_name << '\n';

    std::vector<ParsedPacket> packets;

    if (!capture_packets(device_name, 100, packets)) {
        return 1;
    }

    std::cout << "Parsed packets stored: " << packets.size() << '\n';

    print_packets(packets);

    return 0;
}