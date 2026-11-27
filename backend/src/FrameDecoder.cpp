#include "ProtocolParser.hpp"
#include "ApplicationNames.hpp"
#include <cstdio>
#include <sstream>

std::string ethernet_mac(const uint8_t* p) {
    char out[18];
    std::snprintf(out,sizeof out,"%02x:%02x:%02x:%02x:%02x:%02x",p[0],p[1],p[2],p[3],p[4],p[5]);
    return out;
}

std::string ipv4_text(const uint8_t* p) {
    char out[16];
    std::snprintf(out,sizeof out,"%u.%u.%u.%u",p[0],p[1],p[2],p[3]);
    return out;
}

namespace {
uint16_t word(const uint8_t* p) { return uint16_t(p[0]) * 256 + p[1]; }

void inspect_neighbor(const uint8_t* p, size_t n, ParsedPacket& out) {
    auto& d = out.details;
    if (n < 24 || d.hop_limit != 255 || p[1] != 0 || (p[0] != 135 && p[0] != 136)) return;
    if (p[8] == 0xff || out.source_ip == "::" || out.source_ip.rfind("ff",0) == 0) return;
    if (p[0] == 136 && (p[4] & 0x40) && out.destination_ip.rfind("ff",0) == 0) return;
    std::string address;
    for (size_t i = 24; i < n;) {
        if (n-i < 2 || !p[i+1]) return;
        const size_t length = size_t(p[i+1])*8;
        if (length > n-i) return;
        if (p[i] == (p[0] == 135 ? 1 : 2)) {
            if (length != 8 || !address.empty()) return;
            address = ethernet_mac(p+i+2);
        }
        i += length;
    }
    if (!address.empty() && address == d.source_mac) {
        d.neighbor_mac = address;
        d.neighbor_ip = p[0] == 135 ? out.source_ip : ipv6_text(p+8);
    }
}

void transport(const uint8_t* p, size_t n, uint8_t proto, bool fragment, bool later, ParsedPacket& out, bool allow_neighbor = true) {
    auto& d = out.details;
    d.next_header = proto;
    d.status = "decoded";
    if (proto == 6 || proto == 17) {
        const bool tcp = proto == 6;
        d.transport = tcp ? "TCP" : "UDP";
        out.protocol = tcp ? Protocol::TCP : Protocol::UDP;
        if (later) return;
        if (n < (tcp ? 20u : 8u)) { d.status = "malformed"; return; }
        const size_t header = tcp ? (p[12] >> 4)*4 : 8;
        const size_t length = tcp ? n : word(p+4);
        if (header < (tcp ? 20u : 8u) || header > n || length < header || (!fragment && length > n)) {
            d.status = "malformed"; return;
        }
        out.source_port = word(p); out.destination_port = word(p+2);
        if (tcp) d.tcp_flags = p[13];
        if (!fragment) inspect_application(p+header,length-header,out);
    } else if ((d.ip_version == 4 && (proto == 1 || proto == 2)) || (d.ip_version == 6 && proto == 58)) {
        d.transport = proto == 2 ? "IGMP" : (proto == 58 ? "ICMPv6" : "ICMP");
        if (!later && n < (proto == 2 ? 8u : 4u)) { d.status = "malformed"; return; }
        if (proto != 2) {
            out.protocol = Protocol::ICMP;
            if (!later) d.icmp_type = p[0];
            if (proto == 58 && allow_neighbor && !fragment) inspect_neighbor(p,n,out);
        }
    } else if (proto == 50) { d.transport = "ESP"; d.status = "encrypted"; }
    else if (d.ip_version != 6 || proto != 59) d.status = "unsupported";
}

void decode_ipv6(const uint8_t* ip, size_t n, ParsedPacket& out) {
    auto& d = out.details;
    d.network = "IPv6"; d.ip_version = 6;
    if (n < 40) { d.status = "short"; return; }
    if (ip[0] >> 4 != 6) { d.status = "malformed"; return; }
    out.source_ip = ipv6_text(ip+8); out.destination_ip = ipv6_text(ip+24);
    d.hop_limit = ip[7];
    size_t end = 40u + word(ip+4), pos = 40;
    uint8_t next = ip[6];
    if (end > n) { d.status = "short"; return; }
    bool fragment = false, later = false, saw_fragment = false;
    for (int depth=0; next==0 || next==43 || next==60 || next==44 || next==51; ++depth) {
        if (depth == 12) return;
        if (end-pos < 2) { d.status = "malformed"; return; }
        size_t length = next == 44 ? 8 : next == 51 ? (ip[pos+1]+2u)*4 : (ip[pos+1]+1u)*8;
        if (length > end-pos) { d.status = "malformed"; return; }
        if (next == 44) {
            saw_fragment = true;
            const auto bits = word(ip+pos+2);
            later = (bits & 0xfff8) != 0; fragment = later || (bits & 1);
        }
        next = ip[pos]; pos += length;
        if (later) break;
    }
    transport(ip+pos,end-pos,next,fragment,later,out,!saw_fragment);
}
}

std::string ipv6_text(const uint8_t* p) {
    unsigned start=8, longest=1;
    for (unsigned i=0;i<8;) {
        if (word(p+2*i)) { ++i; continue; }
        unsigned j=i;
        while (j<8 && !word(p+2*j)) ++j;
        if (j-i>longest) { start=i; longest=j-i; }
        i=j;
    }
    std::ostringstream s; s << std::hex;
    for (unsigned i=0;i<8;) {
        if (i==start) { s << "::"; i+=longest; continue; }
        if (i && i!=start+longest) s << ':';
        s << word(p+2*i); ++i;
    }
    return s.str();
}

ParsedPacket inspect_frame(const uint8_t* bytes, size_t n, uint32_t original) {
    ParsedPacket out{}; out.protocol = Protocol::Other; out.packet_size = original;
    auto& d = out.details;
    const auto short_status = n < original ? "truncated" : "malformed";
    if (n > original) { d.status="malformed"; return out; }
    if (!bytes || n < 14) { d.status = short_status; return out; }
    d.destination_mac = ethernet_mac(bytes); d.source_mac = ethernet_mac(bytes+6);
    size_t pos = 14;
    uint16_t type = word(bytes+12);
    while (type == 0x8100 || type == 0x88a8) {
        if (n-pos < 4) { d.status = short_status; return out; }
        if (d.vlans.size() == 8) return out;
        d.vlans.push_back(word(bytes+pos)&4095); type = word(bytes+pos+2); pos += 4;
    }
    d.ether_type = type;
    const auto* p = bytes+pos;
    const size_t len = n-pos;
    if (type == 0x0800) {
        d.network = "IPv4"; d.ip_version = 4;
        ParsedPacket parsed{};
        if (!parser_detail::parse_ipv4_ethernet(bytes+(pos-14),n-(pos-14),original,parsed)) {
            d.status = len < 20 || (len >= 20 && word(p+2)>len) ? short_status : "malformed";
            return out;
        }
        out.source_ip = std::move(parsed.source_ip); out.destination_ip = std::move(parsed.destination_ip);
        d.hop_limit = p[8];
        const size_t header = (p[0]&15)*4;
        const uint16_t bits = word(p+6);
        transport(p+header,word(p+2)-header,p[9],(bits&0x3fff)!=0,(bits&0x1fff)!=0,out);
    } else if (type == 0x86dd) decode_ipv6(p,len,out);
    else if (type == 0x0806) {
        d.network = "ARP";
        if (len < 8 || len < 8u+2u*(p[4]+p[5])) d.status = short_status;
        else {
            d.arp_operation = word(p+6);
            if (word(p)==1 && word(p+2)==0x0800 && p[4]==6 && p[5]==4) {
                out.source_ip = ipv4_text(p+14); out.destination_ip = ipv4_text(p+24); d.status = "decoded";
                if ((*d.arp_operation == 1 || *d.arp_operation == 2) && ethernet_mac(p+8) == d.source_mac) {
                    d.neighbor_mac = d.source_mac; d.neighbor_ip = out.source_ip;
                }
            }
        }
    } else if (type == 0x88cc) {
        d.network = "LLDP";
        size_t i=0;
        unsigned required=1;
        d.status="malformed";
        while (len-i >= 2) {
            unsigned tlv = word(p+i), tag=tlv>>9, size=tlv&511;
            i+=2;
            if (size>len-i) { d.status=short_status; break; }
            if (!tag) { if (!size && required==4) d.status="decoded"; break; }
            if (required<=3) {
                if (tag!=required || (tag==3 ? size!=2 : size<2)) break;
                ++required;
            }
            i+=size;
        }
    }
    if (d.status == "short") d.status = short_status;
    return out;
}
