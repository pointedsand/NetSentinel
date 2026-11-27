#include "packet_analyzer.hpp"

template<class T>
static FlowStats analyze_pair(const std::vector<T>& packets,
                          const std::string& ip_a,
                          const std::string& ip_b) {
    FlowStats stats;
    for (const auto& p : packets) {
        if (p.source_ip == ip_a && p.destination_ip == ip_b) {
            stats.a_to_b.add(p.packet_size);
        } else if (p.source_ip == ip_b && p.destination_ip == ip_a) {
            stats.b_to_a.add(p.packet_size);
        } else {
            continue;
        }
        ++stats.protocol_counts[static_cast<size_t>(p.protocol)];
    }
    return stats;
}

FlowStats analyze_packets(const std::vector<Packet>& packets, const std::string& a, const std::string& b) {
    return analyze_pair(packets, a, b);
}

FlowStats analyze_packets(const std::vector<ParsedPacket>& packets, const std::string& a, const std::string& b) {
    return analyze_pair(packets, a, b);
}

const char* to_string(Protocol p) {
    switch (p) {
        case Protocol::TCP:  return "TCP";
        case Protocol::UDP:  return "UDP";
        case Protocol::ICMP: return "ICMP";
        default:             return "OTHER";
    }
}
    