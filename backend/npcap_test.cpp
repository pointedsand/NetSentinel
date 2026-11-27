#include <iostream>
#include <pcap.h>

//compile this and run the executable to make sure your installation was successful :)

pcap_if_t *interfaces = nullptr;
char errbuf[PCAP_ERRBUF_SIZE];

//to verify npcap SDK installation
int main() {
    std::cout << pcap_lib_version() << '\n';
    return 0;
}


