#ifndef BINARY_PROTOCOL_H
#define BINARY_PROTOCOL_H

#include <vector>
#include <string>
#include <cstdint>
#include <cstring>

// 二进制协议：高性能数据传输
// 支持 uint32 数组和字符串数组的高效序列化/反序列化
class BinaryProtocol {
public:
    // ========== 消息类型定义 ==========
    
    enum MessageType : uint8_t {
        MSG_UINT32_ARRAY = 0x01,        // uint32 数组消息
        MSG_STRING_ARRAY = 0x02,        // 字符串数组消息
        MSG_MIXED_DATA = 0x03,          // 混合数据消息
        MSG_RESPONSE = 0x04,            // 响应消息
        MSG_ERROR = 0x05                // 错误消息
    };
    
    // ========== 消息头结构 ==========
    
    struct MessageHeader {
        uint32_t magic;                 // 魔数：0x12345678
        uint8_t version;                // 版本号
        uint8_t message_type;           // 消息类型
        uint16_t flags;                 // 标志位
        uint32_t payload_size;          // 负载大小
        uint32_t checksum;              // 校验和
        
        MessageHeader() 
            : magic(0x12345678), version(1), message_type(0), flags(0), payload_size(0), checksum(0) {}
    };
    
    static_assert(sizeof(MessageHeader) == 16, "MessageHeader size must be 16 bytes");
    
    // ========== 序列化方法 ==========
    
    // 序列化 uint32 数组
    static std::vector<uint8_t> serializeUint32Array(const std::vector<uint32_t>& data);
    
    // 序列化字符串数组
    static std::vector<uint8_t> serializeStringArray(const std::vector<std::string>& data);
    
    // 序列化混合数据（uint32数组 + 字符串数组）
    static std::vector<uint8_t> serializeMixedData(const std::vector<uint32_t>& uint32_data,
                                                   const std::vector<std::string>& string_data);
    
    // 序列化响应消息
    static std::vector<uint8_t> serializeResponse(uint32_t status_code, const std::string& message);
    
    // 序列化错误消息
    static std::vector<uint8_t> serializeError(uint32_t error_code, const std::string& error_message);
    
    // ========== 反序列化方法 ==========
    
    // 解析消息头
    static bool parseHeader(const uint8_t* data, size_t size, MessageHeader& header);
    
    // 反序列化 uint32 数组
    static bool deserializeUint32Array(const uint8_t* payload, size_t payload_size, 
                                      std::vector<uint32_t>& data);
    
    // 反序列化字符串数组
    static bool deserializeStringArray(const uint8_t* payload, size_t payload_size, 
                                      std::vector<std::string>& data);
    
    // 反序列化混合数据
    static bool deserializeMixedData(const uint8_t* payload, size_t payload_size,
                                    std::vector<uint32_t>& uint32_data,
                                    std::vector<std::string>& string_data);
    
    // 反序列化响应消息
    static bool deserializeResponse(const uint8_t* payload, size_t payload_size,
                                   uint32_t& status_code, std::string& message);
    
    // 反序列化错误消息
    static bool deserializeError(const uint8_t* payload, size_t payload_size,
                                uint32_t& error_code, std::string& error_message);
    
    // ========== 工具方法 ==========
    
    // 验证消息完整性
    static bool validateMessage(const uint8_t* data, size_t size);
    
    // 计算校验和
    static uint32_t calculateChecksum(const uint8_t* data, size_t size);
    
    // 网络字节序转换
    static uint32_t htonl_portable(uint32_t hostlong);
    static uint32_t ntohl_portable(uint32_t netlong);
    static uint16_t htons_portable(uint16_t hostshort);
    static uint16_t ntohs_portable(uint16_t netshort);
    
    // ========== 性能统计 ==========
    
    struct PerformanceStats {
        size_t messages_sent;
        size_t messages_received;
        size_t bytes_sent;
        size_t bytes_received;
        size_t serialization_errors;
        size_t deserialization_errors;
        
        PerformanceStats() : messages_sent(0), messages_received(0), bytes_sent(0), 
                           bytes_received(0), serialization_errors(0), deserialization_errors(0) {}
    };
    
    static PerformanceStats& getStats() {
        static PerformanceStats stats;
        return stats;
    }
    
    static void resetStats() {
        getStats() = PerformanceStats();
    }

private:
    // 内部辅助方法
    static std::vector<uint8_t> createMessage(MessageType type, const std::vector<uint8_t>& payload);
    static void writeUint32(uint8_t* buffer, uint32_t value);
    static uint32_t readUint32(const uint8_t* buffer);
    static void writeUint16(uint8_t* buffer, uint16_t value);
    static uint16_t readUint16(const uint8_t* buffer);
};

// ========== 便捷接口类 ==========

// 高级二进制协议接口，提供更易用的API
class BinaryClient {
public:
    BinaryClient() = default;
    ~BinaryClient() = default;
    
    // 发送 uint32 数组
    std::vector<uint8_t> sendUint32Array(const std::vector<uint32_t>& data);
    
    // 发送字符串数组
    std::vector<uint8_t> sendStringArray(const std::vector<std::string>& data);
    
    // 发送混合数据
    std::vector<uint8_t> sendMixedData(const std::vector<uint32_t>& uint32_data,
                                      const std::vector<std::string>& string_data);
    
    // 处理接收到的消息
    bool handleMessage(const uint8_t* data, size_t size);
    
    // 获取最后的响应
    struct Response {
        bool success;
        uint32_t status_code;
        std::string message;
        std::vector<uint32_t> uint32_data;
        std::vector<std::string> string_data;
        
        Response() : success(false), status_code(0) {}
    };
    
    const Response& getLastResponse() const { return last_response_; }

private:
    Response last_response_;
};


#endif // BINARY_PROTOCOL_H