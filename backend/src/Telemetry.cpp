#include "Telemetry.hpp"
#include "PacketCapture.hpp"
#include <charconv>
#include <cstdlib>
#include <string_view>
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>
#ifdef _WIN32
#include <windows.h>
#else
#include <poll.h>
#include <csignal>
#endif

namespace {
using Clock = std::chrono::steady_clock;
size_t buffer_capacity() {
    const char* setting = std::getenv("NETSENTINEL_BUFFER");
    if (!setting) return 256;
    std::string_view value(setting);
    size_t n = 0;
    auto end = setting + value.size();
    auto result = std::from_chars(setting, end, n);
    if (result.ec != std::errc{} || result.ptr != end || n < 1 || n > 4096)
        throw std::invalid_argument("NETSENTINEL_BUFFER must be 1 through 4096");
    return n;
}

struct Mailbox {
    std::mutex mutex;
    std::condition_variable wake;
    std::vector<CaptureRecord> records;
    TrafficTotals stats;
    bool done = false;
    bool success = false;
};

bool parent_stopped() {
#ifdef _WIN32
    auto pipe = GetStdHandle(STD_INPUT_HANDLE);
    if (GetFileType(pipe) != FILE_TYPE_PIPE) return false;
    DWORD bytes = 0;
    return !PeekNamedPipe(pipe, nullptr, 0, nullptr, &bytes, nullptr) || bytes > 0;
#else
    pollfd input{0, POLLIN, 0};
    return poll(&input, 1, 0) > 0 && (input.revents & (POLLIN | POLLHUP | POLLERR));
#endif
}

std::optional<uint16_t> port(const std::string& value) {
    if (value == "-") return {};
    uint16_t n = 0;
    auto end = value.data() + value.size();
    auto result = std::from_chars(value.data(), end, n);
    if (result.ec != std::errc{} || result.ptr != end) throw std::invalid_argument("invalid port");
    return n;
}

FilterConfig read_filter(char** argv) {
    FilterConfig cfg;
    const std::string protocol = argv[3];
    if (protocol != "-") {
        for (auto p : {Protocol::TCP, Protocol::UDP, Protocol::ICMP, Protocol::Other}) {
            if (protocol == to_string(p)) cfg.protocol = p;
        }
        if (!cfg.protocol) throw std::invalid_argument("invalid protocol");
    }
    if (std::string(argv[4]) != "-") cfg.source_ip = argv[4];
    if (std::string(argv[5]) != "-") cfg.destination_ip = argv[5];
    cfg.source_port = port(argv[6]);
    cfg.destination_port = port(argv[7]);
    return cfg;
}

void write_details(const FrameDetails& d) {
    auto text = [](const char* key,const std::string& s) {
        if (!s.empty()) std::cout << ",\"" << key << "\":\"" << s << '\"';
    };
    auto number = [](const char* key, auto n) {
        if (n) std::cout << ",\"" << key << "\":" << +*n;
    };
    text("sourceMac",d.source_mac); text("destinationMac",d.destination_mac);
    text("network",d.network); text("transport",d.transport); text("application",d.application);
    text("payloadStatus",d.payload_status);
    text("decodeStatus",d.status); text("sni",d.sni); text("dnsQuestion",d.dns_question);
    number("etherType",d.ether_type); number("ipVersion",d.ip_version);
    number("ttlOrHopLimit",d.hop_limit); number("ipProtocol",d.next_header);
    number("tcpFlags",d.tcp_flags); number("icmpType",d.icmp_type); number("arpOperation",d.arp_operation);
    std::cout << R"(,"linkType":1,"vlanIds":[)";
    for (size_t i=0;i<d.vlans.size();++i) std::cout << (i?",":"") << d.vlans[i];
    std::cout << R"(],"dnsAnswers":[)";
    for (size_t i=0;i<d.answers.size();++i) {
        const auto& a=d.answers[i];
        std::cout << (i?",":"") << R"({"owner":")" << a.owner << R"(","value":")" << a.value
                  << R"(","type":)" << a.type << R"(,"ttl":)" << a.ttl << '}';
    }
    std::cout << ']';
}

void write_batch(const std::vector<CaptureRecord>& records, const TrafficTotals& stats,
                 double seconds, bool done, bool success) {
    std::cout << R"({"type":"batch","packetCount":)" << stats.parsed.packet_count
              << R"(,"activeConnections":)" << stats.active_connections
              << R"(,"elapsedSeconds":)" << seconds
              << R"(,"bytes":)" << stats.parsed.total_bytes
              << R"(,"bandwidthMbps":)" << stats.megabits_per_second(seconds)
              << R"(,"filtered":)" << stats.filtered << R"(,"rejected":)" << stats.rejected
              << R"(,"outputDrops":)" << stats.output_drops << R"(,"protocolCounts":[)";
    for (size_t i = 0; i < stats.protocols.size(); ++i)
        std::cout << (i ? "," : "") << stats.protocols[i];
    std::cout << R"(],"captureState":")" << (done ? "PAUSED" : "RUNNING")
              << R"(","failed":)" << (done && !success ? "true" : "false") << R"(,"packets":[)";
    bool first = true;
    for (const auto& record : records) {
        const auto& p = record.packet;
        std::cout << (first ? "" : ",") << R"({"source":")" << p.source_ip
                  << R"(","destination":")" << p.destination_ip
                  << R"(","protocol":")" << to_string(p.protocol)
                  << R"(","sizeBytes":)" << p.packet_size << R"(,"capturedBytes":)" << record.captured_size
                  << R"(,"sourcePort":)" << (p.source_port ? std::to_string(*p.source_port) : "null")
                  << R"(,"destinationPort":)" << (p.destination_port ? std::to_string(*p.destination_port) : "null")
                  << R"(,"timestampUs":)" << record.timestamp_us;
        std::cout << R"(,"visible":)" << (record.visible ? "true" : "false");
        write_details(p.details);
        std::cout << '}';
        first = false;
    }
    std::cout << "]}\n" << std::flush;
}
}

int stream_capture(int argc, char** argv) {
    if (argc != 8 || (std::string(argv[1]) != "--interface" && std::string(argv[1]) != "--replay")) {
        std::cerr << "Usage: netsentinel --interface DEVICE|--replay FILE PROTOCOL SRC DST SPORT DPORT (use - for any)\n";
        return 2;
    }
#ifndef _WIN32
    std::signal(SIGPIPE, SIG_IGN);
#endif
    FilterConfig cfg;
    size_t capacity;
    try { cfg = read_filter(argv); capacity = buffer_capacity(); }
    catch (const std::invalid_argument& e) { std::cerr << e.what() << '\n'; return 2; }
    const auto source = std::string(argv[1]) == "--replay" ? CaptureSource::File : CaptureSource::Interface;
    Mailbox box;
    std::atomic_bool stop{false};
    auto start = Clock::now();
    std::thread worker([&] {
        TrafficTotals totals;
        bool ok = false;
        try {
            ok = run_capture(argv[2], 0, PacketFilter(cfg), totals, stop, [&](CaptureRecord&& record) {
                std::lock_guard lock(box.mutex);
                if (box.records.size() == capacity) return false;
                box.records.push_back(std::move(record));
                return true;
            }, source, [&](const TrafficTotals& snapshot) {
                std::lock_guard lock(box.mutex);
                box.stats = snapshot;
            });
        } catch (const std::exception& e) { std::cerr << e.what() << '\n'; }
        std::lock_guard lock(box.mutex);
        box.stats = totals;
        box.done = true;
        box.success = ok;
        box.wake.notify_one();
    });

    bool done = false, success = false;
    while (!done) {
        std::vector<CaptureRecord> batch;
        std::unique_lock lock(box.mutex);
        box.wake.wait_for(lock, std::chrono::milliseconds(200), [&] { return box.done; });
        batch.swap(box.records);
        auto stats = box.stats;
        done = box.done;
        success = box.success;
        lock.unlock();
        if (parent_stopped()) stop = true;
        write_batch(batch, stats, std::chrono::duration<double>(Clock::now() - start).count(), done, success);
        if (!std::cout) stop = true;
    }
    worker.join();
    return success ? 0 : 1;
}
