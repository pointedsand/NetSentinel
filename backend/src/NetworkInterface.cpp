 #include "NetworkInterface.hpp"
#include <pcap.h>
#include <iostream>
#include <memory>


using InterfaceList = std::unique_ptr<pcap_if_t, decltype(&pcap_freealldevs)>;

static InterfaceList find_interfaces() {
    pcap_if_t* interfaces = nullptr; //pcap_if_t struct has members: name, description, next
    char errbuff[PCAP_ERRBUF_SIZE];

    if (pcap_findalldevs(&interfaces, errbuff) != 0) {
        std::cerr << "No network interfaces detected: " << errbuff << '\n';

        return {nullptr, pcap_freealldevs};
    }

    return {interfaces, pcap_freealldevs};
}

int print_interface_names() {
    auto interfaces = find_interfaces();
    for (auto* device = interfaces.get(); device; device = device->next) {
        std::string description = device->description ? device->description : "";
        for (char& ch : description) {
            if (ch == '\n' || ch == '\r' || ch == '\t') ch = ' ';
        }
        std::cout << device->name << '\t' << description << '\n';
    }
    return interfaces ? 0 : 1;
}

/* 
test function for learning
void list_network_interfaces() 
{
    pcap_if_t* interfaces = nullptr; //pcap_if_t struct has members: name, description, next
    char errbuff[PCAP_ERRBUF_SIZE]; 

    if (pcap_findalldevs(&interfaces, errbuff) != 0) {
        std::cerr << "No network interfaces detected: " << errbuff << '\n';
        
        return;
    }

    std::cout << "==Network Interfaces==\n";

    int index = 0;
    for (pcap_if_t* current = interfaces; current != nullptr; current = current->next) {
        std::cout << "[" << index << "] ";

        if(current->description != nullptr) {
            std::cout << current->description;
        } else {
            std::cout << current->name;
        }

        std::cout << '\n';
        index++;
    }

    pcap_freealldevs(interfaces);   
}
*/
/* 
select_network_interface();
--------------------------
 - prints all detected network interfaces
 - allows user to select an interface
 - returns a device_name string based on selected interface
*/
std::string select_network_interface() {
    auto owner = find_interfaces();
    auto* interfaces = owner.get();
    int count = 0;
    for (pcap_if_t* current = interfaces; current != nullptr; current = current->next) {
        std::cout << "[" << count << "] ";

        if(current->description != nullptr) {
            std::cout << current->description;
        } else {
            std::cout << current->name;
        }

        std::cout << '\n';
        count++;
    }

    if(count == 0) {
        std::cerr << "No network interfaces found.\n";
        return "";
    }

    int selection;

    std::cout << "Select an interface: ";

    if(!(std::cin >> selection) || selection < 0 || selection >= count) {
        std::cerr << "Invalid selection.\n";
        return "";
    }

    pcap_if_t* curr = interfaces; //linked list traversal for interfaces
    for(int i = 0; i < selection; i++) {
        curr = curr->next;
    }

    std::string device_name = curr->name;

    return device_name;
}
