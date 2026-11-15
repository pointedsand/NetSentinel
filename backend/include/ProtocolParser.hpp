#pragma once

#include "ParsedPacket.hpp"
#include <cstddef>
#include <cstdint>

bool parse_packet(const uint8_t* data, size_t captured_size, uint32_t original_size, ParsedPacket& output);
