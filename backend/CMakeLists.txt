cmake_minimum_required(VERSION 3.20)

project(NetSentinel LANGUAGES CXX)

# use c++17 for std::optional 
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(netsentinel_core
    src/ProtocolParser.cpp
    src/PacketFiltering.cpp
    src/PacketAnalyzer.cpp
    src/PacketProcessing.cpp
    src/FrameDecoder.cpp
    src/ApplicationNames.cpp
)
target_include_directories(netsentinel_core PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/.."
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
)

option(BUILD_CAPTURE_APP "Build the application requiring Npcap/libpcap" ON)

if(BUILD_CAPTURE_APP)
# main backend executable
add_executable(netsentinel
    src/main.cpp
    src/NetworkInterface.cpp

    src/Telemetry.cpp
)
find_package(Threads REQUIRED)
add_library(netsentinel_capture src/PacketCapture.cpp)
target_link_libraries(netsentinel_capture PUBLIC netsentinel_core Threads::Threads)
target_link_libraries(netsentinel PRIVATE netsentinel_capture)

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

    target_include_directories(netsentinel_capture PUBLIC
        "${NPCAP_SDK_ROOT}/Include"
    )

    target_link_libraries(netsentinel_capture PUBLIC
        "${NPCAP_LIBRARY}"
    )
else()
    # for linux: use the system's libpcap
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(PCAP REQUIRED IMPORTED_TARGET libpcap)

    target_link_libraries(netsentinel_capture PUBLIC
        PkgConfig::PCAP
    )
endif()
endif()

# automated unit tests
include(CTest)

if(BUILD_TESTING)
    add_executable(parser_tests
        tests/ProtocolParserTests.cpp
    )

    add_executable(frame_decoder_tests tests/FrameDecoderTests.cpp)
    add_test(NAME FrameDecoderTests COMMAND frame_decoder_tests)
    add_executable(packet_filtering_tests tests/PacketFilteringTests.cpp)
    add_executable(packet_pipeline_tests tests/PacketPipelineTests.cpp)

    foreach(test_target IN ITEMS frame_decoder_tests parser_tests packet_filtering_tests packet_pipeline_tests)
        target_link_libraries(${test_target} PRIVATE netsentinel_core)
    if(MSVC)
        target_compile_options(${test_target} PRIVATE /UNDEBUG)
    else()
        target_compile_options(${test_target} PRIVATE -UNDEBUG)
    endif()
    endforeach()

    if(BUILD_CAPTURE_APP)
        add_executable(capture_tests tests/CaptureTests.cpp)
        target_link_libraries(capture_tests PRIVATE netsentinel_capture)
        add_test(NAME CaptureLifecycleTests COMMAND capture_tests)
    endif()

    add_test(NAME ProtocolParserTests COMMAND parser_tests)
    add_test(NAME PacketFilteringTests COMMAND packet_filtering_tests)
    add_test(NAME PacketPipelineTests COMMAND packet_pipeline_tests)
endif()
