#pragma once

#include "ParsedPacket.hpp"
#include <optional>
#include <string>
#include <cstdint>

// Stores the filtering conditions selected by the user.
struct FilterConfig {
    std::optional<Protocol> protocol;
    std::optional<std::string> source_ip;
    std::optional<std::string> destination_ip;
    std::optional<uint16_t> source_port;
    std::optional<uint16_t> destination_port;
};

// Determines whether a parsed packet matches the filter.
class PacketFilter {
public:
    explicit PacketFilter(const FilterConfig& config);

    bool matches(const ParsedPacket& packet) const;

private:
    FilterConfig config_;
};
