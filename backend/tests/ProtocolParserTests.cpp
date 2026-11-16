#include "ProtocolParser.hpp"
#include <cassert> //used to verify that a condition is true
#include <cstdint>
#include <iostream>


/* 
TestID: UT-01
Valid TCP packet
Expected result: correct IPs, protocol, ports
*/
void test_tcp_packet() {
    // ethernet II (14 bytes) + IPv4 (20 bytes) + TCP (20 bytes)
    const uint8_t tcp[] = {
        0,1,2,3,4,5, 6,7,8,9,10,11, 0x08,0x00,
        0x45,0x00, 0x00,0x28, 0,0, 0,0, 64,6, 0,0,
        192,168,1,10, 8,8,8,8,
        0xC0,0x00, 0x01,0xBB, 0,0,0,0, 0,0,0,0,
        0x50,0, 0,0, 0,0, 0,0
    };

    ParsedPacket result{};
    bool success = parse_packet(tcp, sizeof(tcp), sizeof(tcp), result);
    assert(success);
    assert(result.protocol == Protocol::TCP);
    assert(result.source_ip == "192.168.1.10");
    assert(result.destination_ip == "8.8.8.8");
    assert(result.source_port.has_value() && result.source_port.value() == 49152);
    assert(result.destination_port.has_value() && result.destination_port.value() == 443);
    assert(result.packet_size == sizeof(tcp));
    std::cout << "PASS UT-01: TCP parsing\n";
}


/* 
TestID: UT-02
Valid UDP packet
Expected result: correct IPs, protocol, ports
*/
void test_udp_packet() {
    // ethernet II (14 bytes) + IPv4 (20 bytes) + UDP (8 bytes).
    const uint8_t udp[] = {
        0,1,2,3,4,5, 6,7,8,9,10,11, 0x08,0x00,
        0x45,0, 0,0x1C, 0,0, 0,0, 64,17, 0,0,
        10,0,0,1, 10,0,0,2,
        0x30,0x39, 0,0x35, 0,8, 0,0
    };

    ParsedPacket result{};
    bool success = parse_packet(udp, sizeof(udp), sizeof(udp), result);
    assert(success);
    assert(result.protocol == Protocol::UDP);
    assert(result.source_ip == "10.0.0.1");
    assert(result.destination_ip == "10.0.0.2");
    assert(result.source_port.has_value() && result.source_port.value() == 12345);
    assert(result.destination_port.has_value() && result.destination_port.value() == 53);
    std::cout << "PASS UT-02: UDP parsing\n";
}


/* 
TestID: UT-03
Truncated packet
Expected result: parser rejects invalid input
*/
void test_truncated_frame() {
    const uint8_t data[] = {0,1,2,3};
    ParsedPacket result{};
    bool success = parse_packet(data, sizeof(data), sizeof(data), result);
    assert(!success);
    std::cout << "PASS UT-03: Truncated frame rejected\n";
}


/* 
TestID: UT-04
ARP Ethernet frame
Expected result: classified as other
*/
void test_arp_classification() {
    // EtherType 0x0806 = ARP. Only Ethernet header needed for classification.
    const uint8_t arp[] = {
        0,1,2,3,4,5, 6,7,8,9,10,11, 0x08,0x06
    };
    ParsedPacket result{};
    bool success = parse_packet(arp, sizeof(arp), 60, result);
    assert(success);
    assert(result.protocol == Protocol::Other);
    assert(result.source_ip.empty());
    assert(result.destination_ip.empty());
    assert(!result.source_port.has_value());
    assert(!result.destination_port.has_value());
    assert(result.packet_size == 60);
    std::cout << "PASS UT-04: ARP classified as Other\n";
}


int main() {
    test_tcp_packet();
    test_udp_packet();
    test_truncated_frame();
    test_arp_classification();
    std::cout << "All 4 parser tests passed.\n";
    return 0;
}