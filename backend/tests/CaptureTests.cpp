#include "PacketCapture.hpp"
#include <pcap.h>
#include <filesystem>
#include <memory>
#include <iostream>

int main() {
    const char* path = "capture-lifecycle-test.pcap";
    if (std::filesystem::exists(path)) return 1;
    struct Cleanup {
        const char* path;
        ~Cleanup() { std::error_code ec; std::filesystem::remove(path, ec); }
    } cleanup{path};
    {
        std::unique_ptr<pcap_t, decltype(&pcap_close)> file(pcap_open_dead(DLT_EN10MB, 65535), pcap_close);
        if (!file) return 1;
        std::unique_ptr<pcap_dumper_t, decltype(&pcap_dump_close)> out(pcap_dump_open(file.get(), path), pcap_dump_close);
        if (!out) return 1;
        unsigned char bytes[14]{};
        pcap_pkthdr header{};
        header.caplen = sizeof bytes;
        header.len = 60;
        for (int i = 0; i < 10; ++i)
            pcap_dump(reinterpret_cast<unsigned char*>(out.get()), &header, bytes);
    }

    for (int session = 0; session < 2; ++session) {
        std::atomic_bool stop{false};
        TrafficTotals stats;
        int seen = 0;
        bool ok = run_capture(path, 0, PacketFilter({}), stats, stop, [&](CaptureRecord&& record) {
            ++seen;
            if (seen == 3) stop = true;
            return seen == 1 && record.captured_size == 14;
        }, CaptureSource::File);
        if (!ok || seen != 3 || stats.parsed.total_bytes != 180 || stats.output_drops != 2) return 1;
    }
    std::cout << "Stop, reopen, and rejected output accounted for.\n";
}
