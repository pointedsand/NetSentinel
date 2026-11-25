#include "PacketFiltering.hpp"

PacketFilter::PacketFilter(const FilterConfig& config)
    : config_(config) {}

bool PacketFilter::matches(const ParsedPacket& packet) const {

    // Filter by protocol
    if (config_.protocol.has_value() &&
        packet.protocol != config_.protocol.value()) {
        return false;
    }

    // Filter by source IP
    if (config_.source_ip.has_value() &&
        packet.source_ip != config_.source_ip.value()) {
        return false;
    }

    // Filter by destination IP
    if (config_.destination_ip.has_value() &&
        packet.destination_ip != config_.destination_ip.value()) {
        return false;
    }

    // Filter by source port
    if (config_.source_port.has_value() &&
        packet.source_port != config_.source_port) {
        return false;
    }

    // Filter by destination port
    if (config_.destination_port.has_value() &&
        packet.destination_port != config_.destination_port) {
        return false;
    }

    return true;
}
