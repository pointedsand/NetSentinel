#include "ProtocolParser.hpp"
#include <string>
#include <iostream>

namespace {
    //combines two bytes into a 16 bit uint
    uint16_t read_u16(const uint8_t* bytes) {
        return (static_cast<uint16_t>(bytes[0]) << 8) | bytes[1];
    }

    //converts four raw bytes into a readable IPv4 address
    std::string ipv4_string(const uint8_t* bytes) {
        return std::to_string(bytes[0]) + "." +
            std::to_string(bytes[1]) + "." +
            std::to_string(bytes[2]) + "." +
            std::to_string(bytes[3]);
    }
}

/*
ethernet header:
bytes: 
 - 0-5: destination mac
 - 6-11: source mac
 - 12-13 ether type


parse_packet() TODO
-------------
1. enhance readibility by creating subfunctions 
2. add functionality for remaining ethernet packet headers ARP (0x0806), RRCP (0x8899) and other common ones.
3. regarding the interactions between protocolparser() and packetcapture(), 
    there needs to be some parallel work so that packets can be parsed and printed while they are also being captured 

*/
bool parse_packet(const uint8_t* data, size_t captured_size, uint32_t original_size, ParsedPacket& output) {
    constexpr size_t ethernet_size = 14;
    
    if (data == nullptr || captured_size < ethernet_size) {
        return false;
    }

    ParsedPacket result{};
    result.protocol = Protocol::Other;
    result.packet_size = original_size;

    //ethernet II takes up bytes 12 and 13
    uint16_t ether_type = read_u16(data + 12);

    std::cout << "EtherType: 0x"
          << std::hex << ether_type
          << std::dec << '\n';

    //WIP: NON-IPV4 FRAMES ARE 'OTHER' --- ADD FUNCTIONALITY AND PROPER CLASSIFICATION LATER
    if(ether_type != 0x0800) {
        output = result;
        return true;
    }

    //IPv4 header starts right after ethernet header :3
    size_t ip = ethernet_size;

    if (captured_size < ip + 20) {
        return false;
    }

    uint8_t version = data[ip] >> 4;
    size_t ip_header_size = (data[ip] & 0x0F) * 4;

    if (version != 4 || ip_header_size < 20 || captured_size < ip + ip_header_size) {
        return false;
    }

    size_t ip_total_size = read_u16(data + ip + 2);

    if (ip_total_size < ip_header_size || captured_size < ip + ip_total_size) {
        return false;
    }

    result.source_ip = ipv4_string(data + ip + 12);
    result.destination_ip = ipv4_string(data + ip + 16);

    //these fragments do not contain transport headers
    bool first_fragment = (read_u16(data + ip + 6) & 0x1FFF) == 0;

    size_t transport = ip + ip_header_size;
    size_t transport_size = ip_total_size - ip_header_size;

    //IPv4 protocol parse
    switch(data[ip + 9]) {
        case 6: //TCP
            result.protocol = Protocol::TCP;

            if(first_fragment) {
                if (transport_size < 20) {
                    return false;
                }

                size_t tcp_header_size = (data[transport + 12] >> 4) * 4;
                
                if (tcp_header_size < 20 || transport_size < tcp_header_size) {
                    return false;
                }

                result.source_port = read_u16(data + transport);
                result.destination_port = read_u16(data + transport + 2);
            }
            break;
        
            case 17: //UDP
                result.protocol = Protocol::UDP;

                if (first_fragment) {
                    if(transport_size < 8) {
                        return false;
                    }

                    result.source_port = read_u16(data + transport);
                    result.destination_port = read_u16(data + transport + 2);
                }
                break;

            case 1: //ICMPv4
                result.protocol = Protocol::ICMP;

                if (first_fragment && transport_size < 4) {
                    return false;
                }
                break;
            default:
                break;
    }

    output = result;
    return true;
}
