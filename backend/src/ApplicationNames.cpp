#include "ApplicationNames.hpp"

#include <algorithm>
#include <cstdio>

namespace {
unsigned u16(const uint8_t* p) { return (unsigned(p[0])<<8)|p[1]; }
unsigned u24(const uint8_t* p) { return (unsigned(p[0])<<16)|u16(p+1); }
bool label_char(uint8_t c) {
    return (c>='A' && c<='Z') || (c>='a' && c<='z') || (c>='0' && c<='9') || c=='-' || c=='_';
}

bool dns_name(const uint8_t* p,size_t n,size_t& pos,std::string& name) {
    size_t i=pos;
    bool jumped=false;
    for (int steps=0; steps<128 && i<n; ++steps) {
        unsigned len=p[i++];
        if (!len) { if (!jumped) pos=i; return true; }
        if ((len&192)==192) {
            if (i>=n) return false;
            size_t target=((len&63)<<8)|p[i++];
            if (target>=i-2) return false;
            if (!jumped) pos=i;
            jumped=true; i=target; continue;
        }
        if (len>63 || len>n-i || name.size()+1+len>253) return false;
        if (!name.empty()) name+='.';
        for (unsigned j=0;j<len;++j) {
            if (!label_char(p[i])) return false;
            name+=static_cast<char>(p[i++]);
        }
    }
    return false;
}

bool dns_response(const uint8_t* p,size_t n,FrameDetails& d) {
    if (n<12 || (u16(p+2)&0xfa0f)!=0x8000 || u16(p+4)!=1 || u16(p+6)>64) return false;
    size_t pos=12;
    std::string question;
    if (!dns_name(p,n,pos,question) || n-pos<4 || u16(p+pos+2)!=1) return false;
    pos+=4;
    std::vector<DnsAnswer> answers;
    for (unsigned i=0;i<u16(p+6);++i) {
        std::string owner,value;
        if (!dns_name(p,n,pos,owner) || n-pos<10) return false;
        unsigned type=u16(p+pos), cls=u16(p+pos+2), len=u16(p+pos+8);
        uint32_t ttl=(uint32_t(u16(p+pos+4))<<16)|u16(p+pos+6);
        pos+=10;
        if (len>n-pos) return false;
        if (cls==1 && type==1 && len==4) {
            char buf[16]; std::snprintf(buf,sizeof buf,"%u.%u.%u.%u",p[pos],p[pos+1],p[pos+2],p[pos+3]); value=buf;
        } else if (cls==1 && type==28 && len==16) value=ipv6_text(p+pos);
        else if (cls==1 && type==5) {
            size_t end=pos;
            if (!dns_name(p,n,end,value) || end!=pos+len) return false;
        }
        if (!value.empty()) answers.push_back({owner,value,uint16_t(type),ttl});
        pos+=len;
    }
    d.dns_question=question; d.answers=std::move(answers); return true;
}

void client_hello(const uint8_t* p,size_t n,FrameDetails& d) {
    if (n<9 || p[0]!=22 || p[1]!=3 || p[2]>4 || p[5]!=1) return;
    const size_t record=u16(p+3), message=u24(p+6);
    if (record<4 || record>n-5 || message>record-4 || message<35) return;
    const size_t end=9+message;
    size_t i=9+34;
    auto skip = [&](size_t prefix) {
        if (end-i<prefix) return false;
        size_t len=prefix==1?p[i]:u16(p+i); i+=prefix;
        if (len>end-i) return false;
        i+=len; return true;
    };
    if (!skip(1) || !skip(2) || !skip(1) || end-i<2 || u16(p+i)!=end-i-2) return;
    i+=2;
    std::string name;
    bool ech=false;
    while (i<end) {
        if (end-i<4) return;
        unsigned type=u16(p+i),len=u16(p+i+2); i+=4;
        if (len>end-i) return;
        if (type==0xfe0d) ech=true;
        if (type==0 && len>=5 && u16(p+i)==len-2 && p[i+2]==0 && u16(p+i+3)==len-5 && len-5<=253) {
            for (unsigned j=5;j<len;++j) if (p[i+j]!='.' && !label_char(p[i+j])) return;
            name.assign(reinterpret_cast<const char*>(p+i+5),len-5);
        }
        i+=len;
    }
    d.application=ech?"TLS ClientHello (ECH extension)":"TLS ClientHello";
    if (!ech) d.sni=std::move(name);
}
}

void inspect_application(const uint8_t* data, size_t length, ParsedPacket& packet) {
    const auto port = [&](int n){ return packet.source_port == n || packet.destination_port == n; };
    if (packet.protocol == Protocol::TCP) client_hello(data,length,packet.details);
    if (!packet.details.application.empty()) return;
    if (packet.protocol == Protocol::TCP && length >= 5 && data[0]==23 && data[1]==3 &&
        data[2]<=4 && u16(data+3)>0 && u16(data+3)<=length-5 && port(443)) {
        packet.details.application="TLS application data (record heuristic)";
        packet.details.payload_status="opaque"; return;
    }
    const bool udp = packet.protocol == Protocol::UDP;
    bool response = false;
    if (packet.source_port == 53) {
        if (udp) response = dns_response(data,length,packet.details);
        else if (length >= 2 && u16(data) <= length-2)
            response = dns_response(data+2,u16(data),packet.details);
    }
    if (response) packet.details.application = "DNS response";
    else if (port(53)) packet.details.application = "DNS (port heuristic)";
    else if (port(5353)) packet.details.application = "mDNS (port heuristic)";
    else if (udp && (port(67) || port(68))) {
        const bool bootp = length >= 240 && (data[0]==1 || data[0]==2) && data[2]<=16;
        packet.details.application = bootp && u16(data+236)==0x6382 && u16(data+238)==0x5363
            ? "DHCPv4 (BOOTP header and cookie)" : "DHCPv4 (port heuristic)";
    }
    else if (udp && (port(546) || port(547))) packet.details.application = "DHCPv6 (port heuristic)";
}
