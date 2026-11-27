#pragma once
#include "ParsedPacket.hpp"
#include <cstddef>

std::string ethernet_mac(const uint8_t* address);
std::string ipv4_text(const uint8_t* address);
std::string ipv6_text(const uint8_t* address);
void inspect_application(const uint8_t* data, size_t length, ParsedPacket& packet);
