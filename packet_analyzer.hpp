#ifndef PACKET_ANALYZER_H
#define PACKET_ANALYZER_H

#include <algorithm>
#include <array>
#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <vector>

enum class Protocol { TCP, UDP, ICMP, OTHER };

struct Packet {
    std::string source_ip;
    std::string destination_ip;
    std::optional<uint16_t> source_port;       // empty for ICMP / unknown
    std::optional<uint16_t> destination_port;
    uint32_t packet_size = 0;                  // bytes
    Protocol protocol = Protocol::OTHER;
};

// Stats for one direction of traffic (e.g. A -> B)
struct DirectionStats {
    uint64_t packet_count = 0;
    uint64_t total_bytes = 0;
    uint32_t min_size = std::numeric_limits<uint32_t>::max();
    uint32_t max_size = 0;

    void add(uint32_t size) {
        ++packet_count;
        total_bytes += size;
        min_size = std::min(min_size, size);
        max_size = std::max(max_size, size);
    }
    double average_size() const {
        return packet_count ? static_cast<double>(total_bytes) / packet_count : 0.0;
    }
};

struct FlowStats {
    DirectionStats a_to_b;
    DirectionStats b_to_a;
    // Packet counts indexed by Protocol (TCP, UDP, ICMP, OTHER)
    std::array<uint64_t, 4> protocol_counts{};

    uint64_t total_packets() const { return a_to_b.packet_count + b_to_a.packet_count; }
    uint64_t total_bytes() const { return a_to_b.total_bytes + b_to_a.total_bytes; }
};

// Analyzes all packets exchanged between ip_a and ip_b (in either direction).
// Packets involving any other address are ignored.
FlowStats analyze_packets(const std::vector<Packet>& packets,
                          const std::string& ip_a,
                          const std::string& ip_b);

const char* to_string(Protocol p);

#endif // PACKET_ANALYZER_H
