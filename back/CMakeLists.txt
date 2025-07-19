cmake_minimum_required(VERSION 3.10)
project(warehouse_management_system)

# 设置 C++ 标准
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 设置编译器标志
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -O2 -pthread")

# 设置输出目录
set(EXECUTABLE_OUTPUT_PATH ${CMAKE_SOURCE_DIR}/bin)

# 查找源文件
set(SOURCES
    main.cpp
    memory_database.cpp
    persistence.cpp
    logger.cpp
    error_handling.cpp
    http_server.cpp
    binary_protocol.cpp
    monitoring.cpp
)

# 创建可执行文件
add_executable(${PROJECT_NAME} ${SOURCES})

# 链接pthread库
target_link_libraries(${PROJECT_NAME} pthread)

# 设置包含目录
target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# 创建bin目录
file(MAKE_DIRECTORY ${CMAKE_SOURCE_DIR}/bin)

# 安装规则（可选）
install(TARGETS ${PROJECT_NAME} DESTINATION bin)