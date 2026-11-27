#pragma once

#include "ParsedPacket.hpp"
#include "PacketProcessing.hpp"
#include <atomic>
#include <functional>
#include <string>
#include <vector>

struct CaptureRecord {
    ParsedPacket packet;
    int64_t timestamp_us;
    uint32_t captured_size;
    bool visible = true;
};

using RecordSink = std::function<bool(CaptureRecord&&)>;
using StatsSink = std::function<void(const TrafficTotals&)>;
enum class CaptureSource { Interface, File };
bool run_capture(const std::string& device, int max_frames, const PacketFilter& filter,
                 TrafficTotals& totals, const std::atomic_bool& stop, const RecordSink& sink,
                 CaptureSource source = CaptureSource::Interface, const StatsSink& snapshot = {});
bool capture_packets(const std::string& device_name, int max_packets, std::vector<ParsedPacket>& packets);
