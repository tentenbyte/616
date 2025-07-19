#include "error_handling.h"
#include "logger.h"
#include <iostream>

// 静态成员初始化
std::unordered_map<ErrorCode, std::string> ErrorHandler::error_code_strings_;
std::unordered_map<ErrorCode, std::string> ErrorHandler::user_messages_;
bool ErrorHandler::maps_initialized_ = false;

std::string ErrorHandler::errorCodeToString(ErrorCode code) {
    if (!maps_initialized_) {
        initializeErrorMaps();
    }
    
    auto it = error_code_strings_.find(code);
    if (it != error_code_strings_.end()) {
        return it->second;
    }
    
    return "UNKNOWN_ERROR_CODE_" + std::to_string(static_cast<int>(code));
}

std::string ErrorHandler::errorCodeToUserMessage(ErrorCode code) {
    if (!maps_initialized_) {
        initializeErrorMaps();
    }
    
    auto it = user_messages_.find(code);
    if (it != user_messages_.end()) {
        return it->second;
    }
    
    return "系统发生未知错误，请联系管理员";
}

void ErrorHandler::logError(ErrorCode code, const std::string& message, const ErrorContext& context) {
    std::string error_details = errorCodeToString(code) + ": " + message;
    
    if (!context.manager_id.empty()) {
        error_details += " [Manager: " + context.manager_id;
        if (!context.transaction_id.empty()) {
            error_details += ", Transaction: " + context.transaction_id;
        }
        error_details += "]";
    }
    
    if (!context.additional_info.empty()) {
        error_details += " - " + context.additional_info;
    }
    
    Logger::getInstance().error(context.component, context.operation, error_details);
}

void ErrorHandler::logWarning(ErrorCode code, const std::string& message, const ErrorContext& context) {
    std::string warning_details = errorCodeToString(code) + ": " + message;
    
    if (!context.manager_id.empty()) {
        warning_details += " [Manager: " + context.manager_id;
        if (!context.transaction_id.empty()) {
            warning_details += ", Transaction: " + context.transaction_id;
        }
        warning_details += "]";
    }
    
    if (!context.additional_info.empty()) {
        warning_details += " - " + context.additional_info;
    }
    
    Logger::getInstance().warning(context.component, context.operation, warning_details);
}

void ErrorHandler::handleCriticalError(ErrorCode code, const std::string& message, const ErrorContext& context) {
    std::string critical_details = "CRITICAL ERROR - " + errorCodeToString(code) + ": " + message;
    
    if (!context.manager_id.empty()) {
        critical_details += " [Manager: " + context.manager_id;
        if (!context.transaction_id.empty()) {
            critical_details += ", Transaction: " + context.transaction_id;
        }
        critical_details += "]";
    }
    
    if (!context.additional_info.empty()) {
        critical_details += " - " + context.additional_info;
    }
    
    Logger::getInstance().fatal(context.component, context.operation, critical_details);
    
    // 对于关键错误，可以选择终止程序
    if (code == ErrorCode::DATA_CORRUPTION_DETECTED || 
        code == ErrorCode::MEMORY_ALLOCATION_FAILED) {
        std::cerr << "Critical error detected, system will shut down: " << critical_details << std::endl;
        std::abort();
    }
}

ErrorContext ErrorHandler::createContext(const std::string& component, const std::string& operation,
                                        const std::string& manager_id, const std::string& transaction_id) {
    ErrorContext context;
    context.component = component;
    context.operation = operation;
    context.manager_id = manager_id;
    context.transaction_id = transaction_id;
    return context;
}

void ErrorHandler::initializeErrorMaps() {
    if (maps_initialized_) {
        return;
    }
    
    // 错误码到字符串的映射
    error_code_strings_ = {
        // 通用错误
        {ErrorCode::SUCCESS, "SUCCESS"},
        {ErrorCode::UNKNOWN_ERROR, "UNKNOWN_ERROR"},
        {ErrorCode::INVALID_PARAMETER, "INVALID_PARAMETER"},
        {ErrorCode::MEMORY_ALLOCATION_FAILED, "MEMORY_ALLOCATION_FAILED"},
        {ErrorCode::OPERATION_TIMEOUT, "OPERATION_TIMEOUT"},
        {ErrorCode::OPERATION_CANCELLED, "OPERATION_CANCELLED"},
        
        // 数据库错误
        {ErrorCode::DATABASE_INIT_FAILED, "DATABASE_INIT_FAILED"},
        {ErrorCode::TRANSACTION_VALIDATION_FAILED, "TRANSACTION_VALIDATION_FAILED"},
        {ErrorCode::MANAGER_NOT_FOUND, "MANAGER_NOT_FOUND"},
        {ErrorCode::DUPLICATE_TRANSACTION_ID, "DUPLICATE_TRANSACTION_ID"},
        {ErrorCode::INVALID_TRANSACTION_TYPE, "INVALID_TRANSACTION_TYPE"},
        {ErrorCode::INSUFFICIENT_INVENTORY, "INSUFFICIENT_INVENTORY"},
        {ErrorCode::ITEM_NOT_FOUND, "ITEM_NOT_FOUND"},
        {ErrorCode::INVENTORY_CALCULATION_FAILED, "INVENTORY_CALCULATION_FAILED"},
        
        // 持久化错误
        {ErrorCode::PERSISTENCE_INIT_FAILED, "PERSISTENCE_INIT_FAILED"},
        {ErrorCode::WAL_WRITE_FAILED, "WAL_WRITE_FAILED"},
        {ErrorCode::WAL_READ_FAILED, "WAL_READ_FAILED"},
        {ErrorCode::SNAPSHOT_CREATE_FAILED, "SNAPSHOT_CREATE_FAILED"},
        {ErrorCode::SNAPSHOT_LOAD_FAILED, "SNAPSHOT_LOAD_FAILED"},
        {ErrorCode::DATA_CORRUPTION_DETECTED, "DATA_CORRUPTION_DETECTED"},
        {ErrorCode::FILE_LOCK_FAILED, "FILE_LOCK_FAILED"},
        {ErrorCode::DISK_SPACE_INSUFFICIENT, "DISK_SPACE_INSUFFICIENT"},
        
        // HTTP服务器错误
        {ErrorCode::HTTP_SERVER_INIT_FAILED, "HTTP_SERVER_INIT_FAILED"},
        {ErrorCode::HTTP_PARSE_ERROR, "HTTP_PARSE_ERROR"},
        {ErrorCode::HTTP_INVALID_REQUEST, "HTTP_INVALID_REQUEST"},
        {ErrorCode::HTTP_ROUTE_NOT_FOUND, "HTTP_ROUTE_NOT_FOUND"},
        {ErrorCode::HTTP_METHOD_NOT_ALLOWED, "HTTP_METHOD_NOT_ALLOWED"},
        {ErrorCode::JSON_PARSE_ERROR, "JSON_PARSE_ERROR"},
        {ErrorCode::JSON_SERIALIZE_ERROR, "JSON_SERIALIZE_ERROR"},
        
        // 网络错误
        {ErrorCode::NETWORK_CONNECTION_FAILED, "NETWORK_CONNECTION_FAILED"},
        {ErrorCode::NETWORK_TIMEOUT, "NETWORK_TIMEOUT"},
        {ErrorCode::NETWORK_DISCONNECTED, "NETWORK_DISCONNECTED"},
        {ErrorCode::SOCKET_CREATE_FAILED, "SOCKET_CREATE_FAILED"},
        {ErrorCode::SOCKET_BIND_FAILED, "SOCKET_BIND_FAILED"},
        {ErrorCode::SOCKET_LISTEN_FAILED, "SOCKET_LISTEN_FAILED"}
    };
    
    // 用户友好的错误消息
    user_messages_ = {
        // 通用错误
        {ErrorCode::SUCCESS, "操作成功"},
        {ErrorCode::UNKNOWN_ERROR, "系统发生未知错误"},
        {ErrorCode::INVALID_PARAMETER, "输入参数无效"},
        {ErrorCode::MEMORY_ALLOCATION_FAILED, "内存不足，请稍后重试"},
        {ErrorCode::OPERATION_TIMEOUT, "操作超时，请重试"},
        {ErrorCode::OPERATION_CANCELLED, "操作已取消"},
        
        // 数据库错误
        {ErrorCode::DATABASE_INIT_FAILED, "数据库初始化失败"},
        {ErrorCode::TRANSACTION_VALIDATION_FAILED, "交易数据验证失败"},
        {ErrorCode::MANAGER_NOT_FOUND, "库管员不存在"},
        {ErrorCode::DUPLICATE_TRANSACTION_ID, "交易ID已存在"},
        {ErrorCode::INVALID_TRANSACTION_TYPE, "交易类型无效"},
        {ErrorCode::INSUFFICIENT_INVENTORY, "库存不足"},
        {ErrorCode::ITEM_NOT_FOUND, "物品不存在"},
        {ErrorCode::INVENTORY_CALCULATION_FAILED, "库存计算失败"},
        
        // 持久化错误
        {ErrorCode::PERSISTENCE_INIT_FAILED, "数据持久化初始化失败"},
        {ErrorCode::WAL_WRITE_FAILED, "数据写入失败"},
        {ErrorCode::WAL_READ_FAILED, "数据读取失败"},
        {ErrorCode::SNAPSHOT_CREATE_FAILED, "数据快照创建失败"},
        {ErrorCode::SNAPSHOT_LOAD_FAILED, "数据恢复失败"},
        {ErrorCode::DATA_CORRUPTION_DETECTED, "检测到数据损坏"},
        {ErrorCode::FILE_LOCK_FAILED, "文件锁定失败"},
        {ErrorCode::DISK_SPACE_INSUFFICIENT, "磁盘空间不足"},
        
        // HTTP服务器错误
        {ErrorCode::HTTP_SERVER_INIT_FAILED, "服务器启动失败"},
        {ErrorCode::HTTP_PARSE_ERROR, "请求解析错误"},
        {ErrorCode::HTTP_INVALID_REQUEST, "无效的请求"},
        {ErrorCode::HTTP_ROUTE_NOT_FOUND, "请求的接口不存在"},
        {ErrorCode::HTTP_METHOD_NOT_ALLOWED, "不支持的请求方法"},
        {ErrorCode::JSON_PARSE_ERROR, "数据格式错误"},
        {ErrorCode::JSON_SERIALIZE_ERROR, "数据序列化错误"},
        
        // 网络错误
        {ErrorCode::NETWORK_CONNECTION_FAILED, "网络连接失败"},
        {ErrorCode::NETWORK_TIMEOUT, "网络超时"},
        {ErrorCode::NETWORK_DISCONNECTED, "网络连接断开"},
        {ErrorCode::SOCKET_CREATE_FAILED, "网络套接字创建失败"},
        {ErrorCode::SOCKET_BIND_FAILED, "端口绑定失败"},
        {ErrorCode::SOCKET_LISTEN_FAILED, "服务器监听失败"}
    };
    
    maps_initialized_ = true;
}