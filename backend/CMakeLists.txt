cmake_minimum_required(VERSION 3.20)

project(NetSentinel LANGUAGES CXX)

# use c++17 for std::optional
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# main backend executable
add_executable(netsentinel
    src/main.cpp
    src/NetworkInterface.cpp
    src/PacketCapture.cpp
    src/ProtocolParser.cpp
    src/PacketFiltering.cpp
)

# header files
target_include_directories(netsentinel PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
)

# platform specific packet capture library
if(WIN32)
    set(NPCAP_SDK_ROOT "" CACHE PATH "Location of Npcap SDK")

    if(NOT EXISTS "${NPCAP_SDK_ROOT}/Include/pcap.h")
        message(FATAL_ERROR "Npcap SDK not found. Set NPCAP_SDK_ROOT.")
    endif()

    set(NPCAP_LIBRARY "${NPCAP_SDK_ROOT}/Lib/x64/wpcap.lib")

    if(NOT EXISTS "${NPCAP_LIBRARY}")
        message(FATAL_ERROR "Npcap x64 library not found.")
    endif()

    target_include_directories(netsentinel PRIVATE
        "${NPCAP_SDK_ROOT}/Include"
    )

    target_link_libraries(netsentinel PRIVATE
        "${NPCAP_LIBRARY}"
    )
else()
    # for linux: use the system's libpcap
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(PCAP REQUIRED IMPORTED_TARGET libpcap)

    target_link_libraries(netsentinel PRIVATE
        PkgConfig::PCAP
    )
endif()

# automated unit tests
include(CTest)

if(BUILD_TESTING)
    add_executable(parser_tests
        tests/ProtocolParserTests.cpp
        src/ProtocolParser.cpp
    )

    target_include_directories(parser_tests PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/include"
    )

    if(MSVC)
        target_compile_options(parser_tests PRIVATE /UNDEBUG)
    else()
        target_compile_options(parser_tests PRIVATE -UNDEBUG)
    endif()

    add_test(NAME ProtocolParserTests COMMAND parser_tests)

    add_executable(packet_filtering_tests
        tests/PacketFilteringTests.cpp
        src/PacketFiltering.cpp
    )

    target_include_directories(packet_filtering_tests PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/include"
    )

    if(MSVC)
        target_compile_options(packet_filtering_tests PRIVATE /UNDEBUG)
    else()
        target_compile_options(packet_filtering_tests PRIVATE -UNDEBUG)
    endif()

    add_test(
        NAME PacketFilteringTests
        COMMAND packet_filtering_tests
    )
endif()