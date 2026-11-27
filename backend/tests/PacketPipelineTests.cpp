#include "PacketFiltering.hpp"
#include "ProtocolParser.hpp"
#include "PacketProcessing.hpp"
#include <cassert>
#include <cstdint>
#include <iostream>
#include <utility>
#include <vector>

namespace {
    std::vector<uint8_t> tcp_frame() {
        return {
            0,1,2,3,4,5, 6,7,8,9,10,11, 0x08,0x00,
            0x45,0, 0,40, 0,0, 0,0, 64,6, 0,0,
            192,168,1,10, 8,8,8,8,
            0xC0,0, 0x01,0xBB, 0,0,0,0, 0,0,0,0,
            0x50,0, 0,0, 0,0, 0,0
        };
    }

    std::vector<uint8_t> udp_frame() {
        auto frame = tcp_frame();
        frame.resize(42);
        frame[17] = 28;
        frame[23] = 17;
        frame[36] = 0;
        frame[37] = 53;
        frame[38] = 0;
        frame[39] = 8;
        return frame;
    }

    void expect_rejected(const uint8_t* data, size_t size, uint32_t original_size) {
        ParsedPacket packet{"unchanged source", "unchanged destination", Protocol::ICMP,
                            123, 456, 789};
        assert(!parse_packet(data, size, original_size, packet));
        assert(packet.source_ip == "unchanged source");
        assert(packet.destination_ip == "unchanged destination");
        assert(packet.protocol == Protocol::ICMP);
        assert(packet.source_port == 123);
        assert(packet.destination_port == 456);
        assert(packet.packet_size == 789);
    }

    void test_valid_packets_and_filters() {
        for (const auto& frame : {tcp_frame(), udp_frame()}) {
            ParsedPacket packet{};
            assert(parse_packet(frame.data(), frame.size(), frame.size(), packet));
            assert(packet.source_ip == "192.168.1.10");
            assert(packet.destination_ip == "8.8.8.8");
            assert(packet.source_port == 49152);
            assert(packet.packet_size == frame.size());
            const bool tcp = frame[23] == 6;
            assert(packet.protocol == (tcp ? Protocol::TCP : Protocol::UDP));
            assert(packet.destination_port == (tcp ? 443 : 53));
            assert(PacketFilter(FilterConfig{}).matches(packet));

            FilterConfig config;
            config.protocol = packet.protocol;
            config.source_ip = packet.source_ip;
            config.destination_ip = packet.destination_ip;
            config.source_port = packet.source_port;
            config.destination_port = packet.destination_port;
            assert(PacketFilter(config).matches(packet));
            config.destination_port = 80;
            assert(!PacketFilter(config).matches(packet));
            config.destination_port = packet.destination_port;
            config.source_ip = "10.0.0.1";
            assert(!PacketFilter(config).matches(packet));
            config.source_ip = packet.source_ip;
            config.destination_ip = "10.0.0.2";
            assert(!PacketFilter(config).matches(packet));
            config.destination_ip = packet.destination_ip;
            config.source_port = 0;
            assert(!PacketFilter(config).matches(packet));
        }

        auto frame = udp_frame();
        frame[34] = frame[35] = frame[36] = frame[37] = 0;
        ParsedPacket packet{};
        assert(parse_packet(frame.data(), frame.size(), frame.size(), packet));
        FilterConfig config;
        config.source_port = 0;
        config.destination_port = 0;
        assert(PacketFilter(config).matches(packet));
    }

    void test_malformed_packets() {
        for (const auto& change : std::vector<std::pair<size_t, uint8_t>>{
                 {14, 0x65}, {14, 0x44}, {17, 19}, {46, 0x40}, {46, 0xF0}}) {
            auto frame = tcp_frame();
            frame[change.first] = change.second;
            expect_rejected(frame.data(), frame.size(), frame.size());
        }
        expect_rejected(nullptr, 0, 0);
    }

    void test_truncated_packets() {
        for (const auto& frame : {tcp_frame(), udp_frame()}) {
            for (size_t size = 0; size < frame.size(); ++size) {
                expect_rejected(frame.data(), size, frame.size());
            }
        }
        // Also exercise transport boundaries when the entire advertised IP packet is captured.
        for (const auto& frame : {tcp_frame(), udp_frame()}) {
            for (size_t size = 34; size < frame.size(); ++size) {
                auto shortened = frame;
                shortened.resize(size);
                shortened[17] = static_cast<uint8_t>(size - 14);
                expect_rejected(shortened.data(), shortened.size(), frame.size());
            }
        }
    }

    void test_existing_unsupported_classification() {
        for (uint16_t ether_type : {0x0806, 0x88B5}) {
            auto frame = tcp_frame();
            frame.resize(14);
            frame[12] = static_cast<uint8_t>(ether_type >> 8);
            frame[13] = static_cast<uint8_t>(ether_type);
            ParsedPacket packet{};
            assert(parse_packet(frame.data(), frame.size(), 60, packet));
            assert(packet.protocol == Protocol::Other);
            assert(packet.source_ip.empty() && packet.destination_ip.empty());
            assert(!packet.source_port && !packet.destination_port);
            assert(packet.packet_size == 60);
            FilterConfig config;
            config.protocol = Protocol::Other;
            assert(PacketFilter(config).matches(packet));
            config.source_port = 0;
            assert(!PacketFilter(config).matches(packet));
            config.source_port.reset();
            config.destination_port = 443;
            assert(!PacketFilter(config).matches(packet));
            config.destination_port.reset();
            config.protocol = Protocol::TCP;
            assert(!PacketFilter(config).matches(packet));
        }
    }

    void test_existing_udp_length_validation_gap() {
        // Characterization only: desired UDP length validation is deferred, not implemented here.
        for (uint16_t udp_length : {0, 7, 9}) {
            auto frame = udp_frame();
            frame[38] = static_cast<uint8_t>(udp_length >> 8);
            frame[39] = static_cast<uint8_t>(udp_length);
            ParsedPacket packet{};
            expect_rejected(frame.data(), frame.size(), frame.size());
            if (udp_length > 8) {
                frame[20] = 0x20;
                assert(parse_packet(frame.data(), frame.size(), frame.size(), packet));
                assert(packet.destination_port == 53);
            }
        }
        std::cout << "UDP length regression checks passed.\n";
    }
}

int main() {
    TrafficTotals totals;
    FilterConfig config;
    config.protocol = Protocol::UDP;
    PacketFilter filter(config);
    ParsedPacket packet{};
    auto tcp = tcp_frame();
    auto udp = udp_frame();
    assert(process_frame(tcp.data(), tcp.size(), 60, filter, totals, packet) == PacketDecision::Hidden);
    assert(process_frame(udp.data(), udp.size(), 60, filter, totals, packet) == PacketDecision::Display);
    assert(process_frame(nullptr, 0, 0, filter, totals, packet) == PacketDecision::Invalid);
    assert(totals.parsed.packet_count == 2 && totals.parsed.total_bytes == 120);
    assert(totals.protocols[0] == 1 && totals.protocols[1] == 1);
    assert(totals.rejected == 1 && totals.filtered == 1);
    assert(totals.megabits_per_second(2) > 0.000479 && totals.megabits_per_second(2) < 0.000481);
    auto reverse = packet;
    std::swap(reverse.source_ip, reverse.destination_ip);
    auto pair = analyze_packets(std::vector<ParsedPacket>{packet, reverse}, packet.source_ip, packet.destination_ip);
    assert(pair.a_to_b.packet_count == 1 && pair.b_to_a.packet_count == 1);
    assert(pair.total_bytes() == 120 && pair.protocol_counts[1] == 2);
    test_valid_packets_and_filters();
    test_malformed_packets();
    test_truncated_packets();
    test_existing_unsupported_classification();
    test_existing_udp_length_validation_gap();
    std::cout << "All packet pipeline tests passed (including existing-behavior checks).\n";
}
