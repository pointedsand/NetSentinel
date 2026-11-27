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
    assert(p.details.neighbor_ip=="10.0.0.0");
    arp[22]=2;
    assert(inspect_frame(arp.data(),60,60).details.neighbor_ip.empty());
    std::vector<uint8_t> nd(14+40+32);
    nd[12]=0x86; nd[13]=0xdd; nd[14]=0x60; nd[19]=32; nd[20]=58; nd[21]=255;
    nd[22]=0xfe; nd[23]=0x80; nd[37]=1; nd[54]=136; nd[62]=0xfe; nd[63]=0x80; nd[77]=1;
    nd[78]=2; nd[79]=1; nd[6]=2; nd[80]=2;
    assert(inspect_frame(nd.data(),nd.size(),nd.size()).details.neighbor_ip=="fe80::1");
    nd[79]=0; assert(inspect_frame(nd.data(),nd.size(),nd.size()).details.neighbor_ip.empty());
    arp[12]=0x88; arp[13]=0x99; p=inspect_frame(arp.data(),60,60);
    assert(p.details.status=="unsupported" && !p.details.source_mac.empty());

    std::vector<uint8_t> dns={0,1,0x81,0x80,0,1,0,1,0,0,0,0,
      1,'a',0,0,1,0,1,0xc0,12,0,1,0,1,0,0,0,60,0,4,1,2,3,4};
    p={}; p.protocol=Protocol::UDP; p.source_port=53;
    inspect_application(dns.data(),dns.size(),p);
    assert(p.details.answers.size()==1 && p.details.answers[0].value=="1.2.3.4");
    dns[20]=19; p.details={}; inspect_application(dns.data(),dns.size(),p);
    assert(p.details.answers.empty());
    std::vector<uint8_t> mdns={0,0,0x84,0,0,0,0,1,0,0,0,0,
      4,'d','e','s','k',5,'l','o','c','a','l',0,0,1,0x80,1,0,0,0,120,0,4,192,0,2,1};
    p={}; p.protocol=Protocol::UDP; p.source_port=5353;
    inspect_application(mdns.data(),mdns.size(),p);
    assert(p.details.application=="mDNS response" && p.details.answers.size()==1);
    assert(p.details.answers.front().owner=="desk.local" && p.details.answers.front().ttl==120);
    for (size_t end=0;end<mdns.size();++end) {
        p.details={}; inspect_application(mdns.data(),end,p); assert(p.details.answers.empty());
    }
    std::vector<uint8_t> nb={0,1,0x84,0x80,0,0,0,1,0,0,0,0,32};
    std::string padded="OFFICE";
    padded.resize(15,' '); padded.push_back(0);
    for (unsigned char c:padded) { nb.push_back('A'+(c>>4)); nb.push_back('A'+(c&15)); }
    nb.insert(nb.end(),{0,0,32,0,1,0,0,0,120,0,6,0,0,192,0,2,4});
    auto nb_name = [&](size_t n) {
        ParsedPacket response{};
        response.protocol=Protocol::UDP; response.source_port=137; response.source_ip="192.0.2.4";
        inspect_application(nb.data(),n,response);
        return response.details.netbios_name;
    };
    assert(nb_name(nb.size())=="OFFICE");
    for (size_t n=0; n<nb.size(); ++n) assert(nb_name(n).empty());
    nb.back()=5; assert(nb_name(nb.size()).empty());
    nb.back()=4; nb[nb.size()-6]=0x80; assert(nb_name(nb.size()).empty());

    std::vector<uint8_t> dhcp(240);
    dhcp[0]=1; dhcp[1]=1; dhcp[2]=6; dhcp[28]=2;
    dhcp[236]=99; dhcp[237]=130; dhcp[238]=83; dhcp[239]=99;
    dhcp.insert(dhcp.end(),{53,1,1,0,12,4,'d','e','s','k',255});
    auto dhcp_name = [&](size_t n) {
        ParsedPacket request{};
        request.protocol=Protocol::UDP; request.source_port=68; request.destination_port=67;
        request.details.source_mac="02:00:00:00:00:00";
        inspect_application(dhcp.data(),n,request);
        return request.details.dhcp_hostname;
    };
    assert(dhcp_name(dhcp.size())=="desk");
    for (size_t n=0; n<dhcp.size(); ++n) assert(dhcp_name(n).empty());
    dhcp[28]=4; assert(dhcp_name(dhcp.size()).empty());

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
