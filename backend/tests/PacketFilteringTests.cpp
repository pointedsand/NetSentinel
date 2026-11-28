
#include "PacketFiltering.hpp"
#include <cassert>
#include <iostream>

int main() {

    ParsedPacket tcp_packet{
        "192.168.1.10",
        "8.8.8.8",
        Protocol::TCP,
        50000,
        443,
        100
    };

    ParsedPacket udp_packet{
        "192.168.1.20",
        "1.1.1.1",
        Protocol::UDP,
        50001,
        53,
        80
    };

    // Test 1: TCP protocol filtering
    FilterConfig tcp_config;
    tcp_config.protocol = Protocol::TCP;

    PacketFilter tcp_filter(tcp_config);

    assert(tcp_filter.matches(tcp_packet));
    assert(!tcp_filter.matches(udp_packet));

    // Test 2: Destination port filtering
    FilterConfig port_config;
    port_config.destination_port = 443;

    PacketFilter port_filter(port_config);

    assert(port_filter.matches(tcp_packet));
    assert(!port_filter.matches(udp_packet));

    // Test 3: Source IP filtering
    FilterConfig ip_config;
    ip_config.source_ip = "192.168.1.10";

    PacketFilter ip_filter(ip_config);

    assert(ip_filter.matches(tcp_packet));
    assert(!ip_filter.matches(udp_packet));

    // Test 4: Combined filtering
    FilterConfig combined_config;
    combined_config.protocol = Protocol::TCP;
    combined_config.destination_port = 443;

    PacketFilter combined_filter(combined_config);

    assert(combined_filter.matches(tcp_packet));
    assert(!combined_filter.matches(udp_packet));
    auto tcp_wrong_port = tcp_packet;
    tcp_wrong_port.destination_port = 53;
    auto udp_same_port = udp_packet;
    udp_same_port.destination_port = 443;
    assert(!combined_filter.matches(tcp_wrong_port));
    assert(!combined_filter.matches(udp_same_port));

    std::cout << "All Packet Filtering tests passed!\n";
    return 0;
}
