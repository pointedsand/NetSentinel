#include <iostream>
#include "packet_analyzer.h"

static void print_direction(const std::string& label, const DirectionStats& d) {
    std::cout << label << ": " << d.packet_count << " packets, "
              << d.total_bytes << " bytes";
    if (d.packet_count) {
        std::cout << " (min " << d.min_size << ", max " << d.max_size
                  << ", avg " << d.average_size() << ")";
    }
    std::cout << '\n';
}

int main() {
    std::vector<Packet> packets = {
        {"10.0.0.1", "10.0.0.2", 51000, 443, 1500, Protocol::TCP},
        {"10.0.0.2", "10.0.0.1", 443, 51000, 60,   Protocol::TCP},
        {"10.0.0.1", "10.0.0.2", 5353,  53,  120,  Protocol::UDP},
        {"10.0.0.1", "10.0.0.2", std::nullopt, std::nullopt, 84, Protocol::ICMP},
        {"10.0.0.3", "10.0.0.2", 40000, 80,  900,  Protocol::TCP},  // ignored
    };

    FlowStats s = analyze_packets(packets, "10.0.0.1", "10.0.0.2");

    print_direction("10.0.0.1 -> 10.0.0.2", s.a_to_b);
    print_direction("10.0.0.2 -> 10.0.0.1", s.b_to_a);
    std::cout << "Total: " << s.total_packets() << " packets, "
              << s.total_bytes() << " bytes\n";
    for (size_t i = 0; i < s.protocol_counts.size(); ++i) {
        std::cout << to_string(static_cast<Protocol>(i)) << ": "
                  << s.protocol_counts[i] << '\n';
    }
}
