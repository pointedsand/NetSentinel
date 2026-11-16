#pragma once

#include <string>
#include <optional>
#include <cstdint>

enum class Protocol {
    TCP,
    UDP,
    ICMP,
    Other
};

struct ParsedPacket {
    std::string source_ip;
    std::string destination_ip;
    Protocol protocol;

    //optional for ARP and ICMP
    std::optional<uint16_t> source_port; 
    std::optional<uint16_t> destination_port;

    uint32_t packet_size;
};