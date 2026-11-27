#pragma once
#include "PacketFiltering.hpp"
#include "packet_analyzer.hpp"
#include <chrono>
#include <set>

class RecentFlows {
    using Clock = std::chrono::steady_clock;
    Clock::time_point window_end = Clock::now() + std::chrono::minutes(1);
    std::set<std::string> flows;
public:
    void observe(const ParsedPacket& packet);
    size_t count();
};

struct TrafficTotals {
    DirectionStats parsed;
    std::array<uint64_t, 4> protocols{};
    uint64_t active_connections = 0;
    uint64_t rejected = 0;
    uint64_t filtered = 0;
    uint64_t output_drops = 0;

    double megabits_per_second(double elapsed_seconds) const {
        return elapsed_seconds > 0 ? parsed.total_bytes * 8e-6 / elapsed_seconds : 0;
    }
};

enum class PacketDecision { Invalid, Hidden, Display };

PacketDecision process_frame(const uint8_t* bytes, size_t captured, uint32_t original,
                             const PacketFilter& filter, TrafficTotals& totals, ParsedPacket& packet,
                             bool retain_invalid = false);
