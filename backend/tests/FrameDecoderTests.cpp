#include "ProtocolParser.hpp"
#include "ApplicationNames.hpp"
#include <cassert>
#include <vector>

int main() {
    // Two VLANs followed by IPv6, hop-by-hop options and UDP.
    std::vector<uint8_t> v(14+8+40+8+8);
    v[12]=0x88; v[13]=0xa8; v[15]=1; v[16]=0x81; v[19]=2; v[20]=0x86; v[21]=0xdd;
    auto* ip=v.data()+22;
    ip[0]=0x60; ip[5]=16; ip[7]=64; ip[23]=1; ip[39]=2; ip[40]=17;
    ip[49]=53; ip[51]=80; ip[53]=8;
    auto parse=[&] {return inspect_frame(v.data(),v.size(),v.size());};
    auto p=parse();
    assert(p.details.status=="decoded" && p.protocol==Protocol::UDP);
    assert(p.details.vlans==std::vector<uint16_t>({1,2}) && p.destination_port==80);
    assert(p.source_ip=="::1");
    assert(parse_packet(v.data(),v.size(),v.size(),p) && p.details.network=="IPv6");
    for (size_t i=0;i<v.size();++i) assert(inspect_frame(v.data(),i,v.size()).details.status=="truncated");
    ip[41]=10; assert(parse().details.status=="malformed"); ip[41]=0;
    ip[40]=58; ip[48]=128; assert(parse().details.icmp_type==128);
    ip[40]=50; assert(parse().details.status=="encrypted");
    ip[6]=44; ip[40]=6; ip[43]=8;
    assert(parse().protocol==Protocol::TCP && !parse().source_port);

    std::vector<uint8_t> arp(60); arp[12]=8; arp[13]=6; arp[15]=1; arp[16]=8;
    arp[18]=6; arp[19]=4; arp[21]=1; arp[28]=10;
    p=inspect_frame(arp.data(),60,60); assert(p.details.arp_operation==1 && p.source_ip=="10.0.0.0");
    arp[12]=0x88; arp[13]=0x99; p=inspect_frame(arp.data(),60,60);
    assert(p.details.status=="unsupported" && !p.details.source_mac.empty());

    std::vector<uint8_t> dns={0,1,0x81,0x80,0,1,0,1,0,0,0,0,
      1,'a',0,0,1,0,1,0xc0,12,0,1,0,1,0,0,0,60,0,4,1,2,3,4};
    p={}; p.protocol=Protocol::UDP; p.source_port=53;
    inspect_application(dns.data(),dns.size(),p);
    assert(p.details.answers.size()==1 && p.details.answers[0].value=="1.2.3.4");
    dns[20]=19; p.details={}; inspect_application(dns.data(),dns.size(),p);
    assert(p.details.answers.empty());
    std::vector<uint8_t> hello(43,0);
    hello[0]=22; hello[1]=3; hello[2]=3; hello[5]=1; hello[9]=3; hello[10]=3;
    hello.insert(hello.end(),{0,0,2,0x13,1,1,0,0,12,0,0,0,8,0,6,0,0,3,'a','.','b'});
    hello[4]=hello.size()-5; hello[8]=hello.size()-9; p={}; p.protocol=Protocol::TCP;
    inspect_application(hello.data(),hello.size(),p); assert(p.details.sni=="a.b");
    auto ech=hello;
    ech.insert(ech.end(),{0xfe,0x0d,0,0});
    ech[51]+=4; ech[4]+=4; ech[8]+=4; p.details={};
    inspect_application(ech.data(),ech.size(),p);
    assert(p.details.sni.empty() && p.details.application=="TLS ClientHello (ECH extension)");
    for(size_t i=0;i<hello.size();++i) {
        p.details={}; inspect_application(hello.data(),i,p); assert(p.details.sni.empty());
    }
}
