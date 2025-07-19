#include "binary_protocol.h"
#include <algorithm>
#include <iostream>
#include <chrono>
#include <cstdlib>

// ========== 序列化方法实现 ==========

std::vector<uint8_t> BinaryProtocol::serializeUint32Array(const std::vector<uint32_t>& data) {
    // 负载格式：[数组长度:4字节][元素1:4字节][元素2:4字节]...
    std::vector<uint8_t> payload;
    payload.resize(4 + data.size() * 4);
    
    // 写入数组长度（网络字节序）
    writeUint32(payload.data(), htonl_portable(static_cast<uint32_t>(data.size())));
    
    // 写入数组元素（网络字节序）
    for (size_t i = 0; i < data.size(); ++i) {
        writeUint32(payload.data() + 4 + i * 4, htonl_portable(data[i]));
    }
    
    auto result = createMessage(MSG_UINT32_ARRAY, payload);
    getStats().messages_sent++;
    getStats().bytes_sent += result.size();
    
    return result;
}

std::vector<uint8_t> BinaryProtocol::serializeStringArray(const std::vector<std::string>& data) {
    // 负载格式：[数组长度:4字节][字符串1长度:4字节][字符串1内容][字符串2长度:4字节][字符串2内容]...
    std::vector<uint8_t> payload;
    
    // 计算总负载大小
    size_t total_size = 4; // 数组长度
    for (const auto& str : data) {
        total_size += 4 + str.length(); // 字符串长度 + 字符串内容
    }
    
    payload.resize(total_size);
    size_t offset = 0;
    
    // 写入数组长度（网络字节序）
    writeUint32(payload.data() + offset, htonl_portable(static_cast<uint32_t>(data.size())));
    offset += 4;
    
    // 写入字符串数据
    for (const auto& str : data) {
        // 写入字符串长度（网络字节序）
        writeUint32(payload.data() + offset, htonl_portable(static_cast<uint32_t>(str.length())));
        offset += 4;
        
        // 写入字符串内容
        if (!str.empty()) {
            std::memcpy(payload.data() + offset, str.c_str(), str.length());
            offset += str.length();
        }
    }
    
    auto result = createMessage(MSG_STRING_ARRAY, payload);
    getStats().messages_sent++;
    getStats().bytes_sent += result.size();
    
    return result;
}

std::vector<uint8_t> BinaryProtocol::serializeMixedData(const std::vector<uint32_t>& uint32_data,
                                                       const std::vector<std::string>& string_data) {
    // 负载格式：[uint32数组][字符串数组]
    auto uint32_payload = serializeUint32Array(uint32_data);
    auto string_payload = serializeStringArray(string_data);
    
    // 移除消息头，只保留负载
    std::vector<uint8_t> uint32_only(uint32_payload.begin() + sizeof(MessageHeader), uint32_payload.end());
    std::vector<uint8_t> string_only(string_payload.begin() + sizeof(MessageHeader), string_payload.end());
    
    std::vector<uint8_t> combined_payload;
    combined_payload.reserve(uint32_only.size() + string_only.size());
    combined_payload.insert(combined_payload.end(), uint32_only.begin(), uint32_only.end());
    combined_payload.insert(combined_payload.end(), string_only.begin(), string_only.end());
    
    auto result = createMessage(MSG_MIXED_DATA, combined_payload);
    getStats().messages_sent++;
    getStats().bytes_sent += result.size();
    
    return result;
}

std::vector<uint8_t> BinaryProtocol::serializeResponse(uint32_t status_code, const std::string& message) {
    // 负载格式：[状态码:4字节][消息长度:4字节][消息内容]
    std::vector<uint8_t> payload;
    payload.resize(8 + message.length());
    
    writeUint32(payload.data(), htonl_portable(status_code));
    writeUint32(payload.data() + 4, htonl_portable(static_cast<uint32_t>(message.length())));
    
    if (!message.empty()) {
        std::memcpy(payload.data() + 8, message.c_str(), message.length());
    }
    
    auto result = createMessage(MSG_RESPONSE, payload);
    getStats().messages_sent++;
    getStats().bytes_sent += result.size();
    
    return result;
}

std::vector<uint8_t> BinaryProtocol::serializeError(uint32_t error_code, const std::string& error_message) {
    // 负载格式与响应消息相同
    std::vector<uint8_t> payload;
    payload.resize(8 + error_message.length());
    
    writeUint32(payload.data(), htonl_portable(error_code));
    writeUint32(payload.data() + 4, htonl_portable(static_cast<uint32_t>(error_message.length())));
    
    if (!error_message.empty()) {
        std::memcpy(payload.data() + 8, error_message.c_str(), error_message.length());
    }
    
    auto result = createMessage(MSG_ERROR, payload);
    getStats().messages_sent++;
    getStats().bytes_sent += result.size();
    
    return result;
}

// ========== 反序列化方法实现 ==========

bool BinaryProtocol::parseHeader(const uint8_t* data, size_t size, MessageHeader& header) {
    if (size < sizeof(MessageHeader)) {
        getStats().deserialization_errors++;
        return false;
    }
    
    // 读取头部数据
    header.magic = ntohl_portable(readUint32(data));
    header.version = data[4];
    header.message_type = data[5];
    header.flags = ntohs_portable(readUint16(data + 6));
    header.payload_size = ntohl_portable(readUint32(data + 8));
    header.checksum = ntohl_portable(readUint32(data + 12));
    
    // 验证魔数
    if (header.magic != 0x12345678) {
        getStats().deserialization_errors++;
        return false;
    }
    
    // 验证版本
    if (header.version != 1) {
        getStats().deserialization_errors++;
        return false;
    }
    
    return true;
}

bool BinaryProtocol::deserializeUint32Array(const uint8_t* payload, size_t payload_size, 
                                           std::vector<uint32_t>& data) {
    if (payload_size < 4) {
        getStats().deserialization_errors++;
        return false;
    }
    
    uint32_t array_length = ntohl_portable(readUint32(payload));
    
    // 验证负载大小
    if (payload_size < 4 + array_length * 4) {
        getStats().deserialization_errors++;
        return false;
    }
    
    data.clear();
    data.reserve(array_length);
    
    for (uint32_t i = 0; i < array_length; ++i) {
        uint32_t value = ntohl_portable(readUint32(payload + 4 + i * 4));
        data.push_back(value);
    }
    
    getStats().messages_received++;
    getStats().bytes_received += payload_size;
    
    return true;
}

bool BinaryProtocol::deserializeStringArray(const uint8_t* payload, size_t payload_size, 
                                           std::vector<std::string>& data) {
    if (payload_size < 4) {
        getStats().deserialization_errors++;
        return false;
    }
    
    uint32_t array_length = ntohl_portable(readUint32(payload));
    size_t offset = 4;
    
    data.clear();
    data.reserve(array_length);
    
    for (uint32_t i = 0; i < array_length; ++i) {
        if (offset + 4 > payload_size) {
            getStats().deserialization_errors++;
            return false;
        }
        
        uint32_t string_length = ntohl_portable(readUint32(payload + offset));
        offset += 4;
        
        if (offset + string_length > payload_size) {
            getStats().deserialization_errors++;
            return false;
        }
        
        std::string str;
        if (string_length > 0) {
            str.assign(reinterpret_cast<const char*>(payload + offset), string_length);
            offset += string_length;
        }
        
        data.push_back(str);
    }
    
    getStats().messages_received++;
    getStats().bytes_received += payload_size;
    
    return true;
}

bool BinaryProtocol::deserializeMixedData(const uint8_t* payload, size_t payload_size,
                                        std::vector<uint32_t>& uint32_data,
                                        std::vector<std::string>& string_data) {
    // 首先解析 uint32 数组
    if (!deserializeUint32Array(payload, payload_size, uint32_data)) {
        return false;
    }
    
    // 计算 uint32 数组占用的字节数
    size_t uint32_size = 4 + uint32_data.size() * 4;
    
    if (payload_size <= uint32_size) {
        getStats().deserialization_errors++;
        return false;
    }
    
    // 解析字符串数组
    return deserializeStringArray(payload + uint32_size, payload_size - uint32_size, string_data);
}

bool BinaryProtocol::deserializeResponse(const uint8_t* payload, size_t payload_size,
                                       uint32_t& status_code, std::string& message) {
    if (payload_size < 8) {
        getStats().deserialization_errors++;
        return false;
    }
    
    status_code = ntohl_portable(readUint32(payload));
    uint32_t message_length = ntohl_portable(readUint32(payload + 4));
    
    if (payload_size < 8 + message_length) {
        getStats().deserialization_errors++;
        return false;
    }
    
    if (message_length > 0) {
        message.assign(reinterpret_cast<const char*>(payload + 8), message_length);
    } else {
        message.clear();
    }
    
    getStats().messages_received++;
    getStats().bytes_received += payload_size;
    
    return true;
}

bool BinaryProtocol::deserializeError(const uint8_t* payload, size_t payload_size,
                                     uint32_t& error_code, std::string& error_message) {
    // 错误消息格式与响应消息相同
    return deserializeResponse(payload, payload_size, error_code, error_message);
}

// ========== 工具方法实现 ==========

bool BinaryProtocol::validateMessage(const uint8_t* data, size_t size) {
    MessageHeader header;
    if (!parseHeader(data, size, header)) {
        return false;
    }
    
    // 验证总消息大小
    if (size != sizeof(MessageHeader) + header.payload_size) {
        getStats().deserialization_errors++;
        return false;
    }
    
    // 验证校验和
    uint32_t calculated_checksum = calculateChecksum(data + sizeof(MessageHeader), header.payload_size);
    if (calculated_checksum != header.checksum) {
        getStats().deserialization_errors++;
        return false;
    }
    
    return true;
}

uint32_t BinaryProtocol::calculateChecksum(const uint8_t* data, size_t size) {
    // 简单的校验和算法（CRC32的简化版本）
    uint32_t checksum = 0;
    for (size_t i = 0; i < size; ++i) {
        checksum = (checksum << 1) ^ data[i];
    }
    return checksum;
}

// 网络字节序转换（跨平台实现）
uint32_t BinaryProtocol::htonl_portable(uint32_t hostlong) {
    static bool little_endian = []() {
        uint16_t test = 1;
        return *reinterpret_cast<uint8_t*>(&test) == 1;
    }();
    
    if (little_endian) {
        return ((hostlong & 0xFF000000) >> 24) |
               ((hostlong & 0x00FF0000) >> 8)  |
               ((hostlong & 0x0000FF00) << 8)  |
               ((hostlong & 0x000000FF) << 24);
    }
    return hostlong;
}

uint32_t BinaryProtocol::ntohl_portable(uint32_t netlong) {
    return htonl_portable(netlong); // 相同的转换
}

uint16_t BinaryProtocol::htons_portable(uint16_t hostshort) {
    static bool little_endian = []() {
        uint16_t test = 1;
        return *reinterpret_cast<uint8_t*>(&test) == 1;
    }();
    
    if (little_endian) {
        return ((hostshort & 0xFF00) >> 8) | ((hostshort & 0x00FF) << 8);
    }
    return hostshort;
}

uint16_t BinaryProtocol::ntohs_portable(uint16_t netshort) {
    return htons_portable(netshort); // 相同的转换
}

// ========== 内部辅助方法实现 ==========

std::vector<uint8_t> BinaryProtocol::createMessage(MessageType type, const std::vector<uint8_t>& payload) {
    std::vector<uint8_t> message;
    message.resize(sizeof(MessageHeader) + payload.size());
    
    // 构建消息头
    MessageHeader header;
    header.message_type = static_cast<uint8_t>(type);
    header.payload_size = static_cast<uint32_t>(payload.size());
    header.checksum = calculateChecksum(payload.data(), payload.size());
    
    // 写入消息头（网络字节序）
    writeUint32(message.data(), htonl_portable(header.magic));
    message[4] = header.version;
    message[5] = header.message_type;
    writeUint16(message.data() + 6, htons_portable(header.flags));
    writeUint32(message.data() + 8, htonl_portable(header.payload_size));
    writeUint32(message.data() + 12, htonl_portable(header.checksum));
    
    // 写入负载
    if (!payload.empty()) {
        std::memcpy(message.data() + sizeof(MessageHeader), payload.data(), payload.size());
    }
    
    return message;
}

void BinaryProtocol::writeUint32(uint8_t* buffer, uint32_t value) {
    buffer[0] = (value >> 24) & 0xFF;
    buffer[1] = (value >> 16) & 0xFF;
    buffer[2] = (value >> 8) & 0xFF;
    buffer[3] = value & 0xFF;
}

uint32_t BinaryProtocol::readUint32(const uint8_t* buffer) {
    return (static_cast<uint32_t>(buffer[0]) << 24) |
           (static_cast<uint32_t>(buffer[1]) << 16) |
           (static_cast<uint32_t>(buffer[2]) << 8) |
           static_cast<uint32_t>(buffer[3]);
}

void BinaryProtocol::writeUint16(uint8_t* buffer, uint16_t value) {
    buffer[0] = (value >> 8) & 0xFF;
    buffer[1] = value & 0xFF;
}

uint16_t BinaryProtocol::readUint16(const uint8_t* buffer) {
    return (static_cast<uint16_t>(buffer[0]) << 8) | static_cast<uint16_t>(buffer[1]);
}

// ========== BinaryClient 实现 ==========

std::vector<uint8_t> BinaryClient::sendUint32Array(const std::vector<uint32_t>& data) {
    return BinaryProtocol::serializeUint32Array(data);
}

std::vector<uint8_t> BinaryClient::sendStringArray(const std::vector<std::string>& data) {
    return BinaryProtocol::serializeStringArray(data);
}

std::vector<uint8_t> BinaryClient::sendMixedData(const std::vector<uint32_t>& uint32_data,
                                                const std::vector<std::string>& string_data) {
    return BinaryProtocol::serializeMixedData(uint32_data, string_data);
}

bool BinaryClient::handleMessage(const uint8_t* data, size_t size) {
    last_response_ = Response();
    
    if (!BinaryProtocol::validateMessage(data, size)) {
        return false;
    }
    
    BinaryProtocol::MessageHeader header;
    if (!BinaryProtocol::parseHeader(data, size, header)) {
        return false;
    }
    
    const uint8_t* payload = data + sizeof(BinaryProtocol::MessageHeader);
    
    switch (header.message_type) {
        case BinaryProtocol::MSG_UINT32_ARRAY:
            last_response_.success = BinaryProtocol::deserializeUint32Array(payload, header.payload_size, last_response_.uint32_data);
            break;
            
        case BinaryProtocol::MSG_STRING_ARRAY:
            last_response_.success = BinaryProtocol::deserializeStringArray(payload, header.payload_size, last_response_.string_data);
            break;
            
        case BinaryProtocol::MSG_MIXED_DATA:
            last_response_.success = BinaryProtocol::deserializeMixedData(payload, header.payload_size, 
                                                                        last_response_.uint32_data, 
                                                                        last_response_.string_data);
            break;
            
        case BinaryProtocol::MSG_RESPONSE:
            last_response_.success = BinaryProtocol::deserializeResponse(payload, header.payload_size, 
                                                                       last_response_.status_code, 
                                                                       last_response_.message);
            break;
            
        case BinaryProtocol::MSG_ERROR:
            last_response_.success = BinaryProtocol::deserializeError(payload, header.payload_size, 
                                                                    last_response_.status_code, 
                                                                    last_response_.message);
            break;
            
        default:
            return false;
    }
    
    return last_response_.success;
}

