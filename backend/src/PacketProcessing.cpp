#include "PacketProcessing.hpp"
#include "ProtocolParser.hpp"

size_t RecentFlows::count() {
    const auto now = Clock::now();
    if (now >= window_end) {
        flows.clear();
        window_end = now + std::chrono::minutes(1);
    }
    return flows.size();
}

void RecentFlows::observe(const ParsedPacket& packet) {
    if (!packet.source_port || !packet.destination_port || count() >= 4096) return;
    auto a = packet.source_ip + ":" + std::to_string(*packet.source_port);
    auto b = packet.destination_ip + ":" + std::to_string(*packet.destination_port);
    if (b < a) std::swap(a, b);
    flows.insert(std::string(to_string(packet.protocol)) + "/" + a + "/" + b);
}

PacketDecision process_frame(const uint8_t* bytes, size_t captured, uint32_t original,
                             const PacketFilter& filter, TrafficTotals& totals, ParsedPacket& packet,
                             bool retain_invalid) {
    totals.wire_bytes += original;
    auto decoded = inspect_frame(bytes,captured,original);
    if (decoded.details.status == "truncated" || decoded.details.status == "malformed") {
        if (retain_invalid) packet = std::move(decoded);
        ++totals.rejected;
        return PacketDecision::Invalid;
    }
    packet = std::move(decoded);
    totals.parsed.add(packet.packet_size);
    ++totals.protocols[static_cast<size_t>(packet.protocol)];
    if (!filter.matches(packet)) {
        ++totals.filtered;
        return PacketDecision::Hidden;
    }
    return PacketDecision::Display;
}
