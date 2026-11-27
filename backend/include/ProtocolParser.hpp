#pragma once

#include "ParsedPacket.hpp"
#include <cstddef>
#include <cstdint>

bool parse_packet(const uint8_t* data, size_t captured_size, uint32_t original_size, ParsedPacket& output);
ParsedPacket inspect_frame(const uint8_t* data, size_t captured_size, uint32_t original_size);

namespace parser_detail {
bool parse_ipv4_ethernet(const uint8_t* data, size_t captured_size, uint32_t original_size, ParsedPacket& output);
}
