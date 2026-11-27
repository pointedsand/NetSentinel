#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

struct DnsAnswer {
    std::string owner, value;
    uint16_t type;
    uint32_t ttl;
};

struct FrameDetails {
    std::string source_mac, destination_mac, network, transport, application;
    std::string status = "unsupported";
    std::optional<uint16_t> ether_type, arp_operation;
    std::vector<uint16_t> vlans;
    std::optional<uint8_t> ip_version, hop_limit, next_header, tcp_flags, icmp_type;
    std::string neighbor_ip, neighbor_mac;
    std::string dhcp_hostname, netbios_name;
    std::optional<uint32_t> netbios_ttl;
    std::string sni, dns_question, payload_status;
    std::vector<DnsAnswer> answers;
};
