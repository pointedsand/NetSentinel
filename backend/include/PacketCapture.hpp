#pragma once

#include "ParsedPacket.hpp"
#include <string>
#include <vector>

bool capture_packets(const std::string& device_name, int max_packets, std::vector<ParsedPacket>& packets);
