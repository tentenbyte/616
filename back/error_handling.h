#ifndef ERROR_HANDLING_H
#define ERROR_HANDLING_H

#include <string>
#include <exception>
#include <unordered_map>
#include <memory>
#include <stdexcept>

// 错误码枚举 - 分模块设计
enum class ErrorCode {
    // 通用错误 (1000-1999)
    SUCCESS = 0,
    UNKNOWN_ERROR = 1000,
    INVALID_PARAMETER = 1001,
    MEMORY_ALLOCATION_FAILED = 1002,
    OPERATION_TIMEOUT = 1003,
    OPERATION_CANCELLED = 1004,
    
    // 数据库错误 (2000-2999)
    DATABASE_INIT_FAILED = 2000,
    TRANSACTION_VALIDATION_FAILED = 2001,
    MANAGER_NOT_FOUND = 2002,
    DUPLICATE_TRANSACTION_ID = 2003,
    INVALID_TRANSACTION_TYPE = 2004,
    INSUFFICIENT_INVENTORY = 2005,
    ITEM_NOT_FOUND = 2006,
    INVENTORY_CALCULATION_FAILED = 2007,
    
    // 持久化错误 (3000-3999)
    PERSISTENCE_INIT_FAILED = 3000,
    WAL_WRITE_FAILED = 3001,
    WAL_READ_FAILED = 3002,
    SNAPSHOT_CREATE_FAILED = 3003,
    SNAPSHOT_LOAD_FAILED = 3004,
    DATA_CORRUPTION_DETECTED = 3005,
    FILE_LOCK_FAILED = 3006,
    DISK_SPACE_INSUFFICIENT = 3007,
    
    // HTTP服务器错误 (4000-4999)
    HTTP_SERVER_INIT_FAILED = 4000,
    HTTP_PARSE_ERROR = 4001,
    HTTP_INVALID_REQUEST = 4002,
    HTTP_ROUTE_NOT_FOUND = 4003,
    HTTP_METHOD_NOT_ALLOWED = 4004,
    JSON_PARSE_ERROR = 4005,
    JSON_SERIALIZE_ERROR = 4006,
    
    // 网络错误 (5000-5999)
    NETWORK_CONNECTION_FAILED = 5000,
    NETWORK_TIMEOUT = 5001,
    NETWORK_DISCONNECTED = 5002,
    SOCKET_CREATE_FAILED = 5003,
    SOCKET_BIND_FAILED = 5004,
    SOCKET_LISTEN_FAILED = 5005
};

// 错误上下文信息
struct ErrorContext {
    std::string component;      // 出错的组件
    std::string operation;      // 出错的操作
    std::string manager_id;     // 相关的库管员ID（如果有）
    std::string transaction_id; // 相关的交易ID（如果有）
    std::string additional_info; // 额外信息
    
    ErrorContext() = default;
    
    ErrorContext(const std::string& comp, const std::string& op) 
        : component(comp), operation(op) {}
    
    ErrorContext(const std::string& comp, const std::string& op, 
                const std::string& mgr_id, const std::string& trans_id = "")
        : component(comp), operation(op), manager_id(mgr_id), transaction_id(trans_id) {}
};

// 结果类模板 - 用于返回操作结果或错误
template<typename T>
class Result {
public:
    // 成功结果构造函数
    static Result<T> success(T&& value) {
        Result<T> result;
        result.success_ = true;
        result.value_ = std::forward<T>(value);
        return result;
    }
    
    static Result<T> success(const T& value) {
        Result<T> result;
        result.success_ = true;
        result.value_ = value;
        return result;
    }
    
    // 错误结果构造函数
    static Result<T> error(ErrorCode code, const std::string& message = "", 
                          const ErrorContext& context = ErrorContext()) {
        Result<T> result;
        result.success_ = false;
        result.error_code_ = code;
        result.error_message_ = message;
        result.error_context_ = context;
        return result;
    }
    
    // 检查是否成功
    bool isSuccess() const { return success_; }
    bool isError() const { return !success_; }
    
    // 获取值（仅在成功时有效）
    const T& getValue() const { 
        if (!success_) {
            throw std::runtime_error("Attempt to get value from error result");
        }
        return value_; 
    }
    
    T& getValue() { 
        if (!success_) {
            throw std::runtime_error("Attempt to get value from error result");
        }
        return value_; 
    }
    
    // 获取错误信息
    ErrorCode getErrorCode() const { return error_code_; }
    const std::string& getErrorMessage() const { return error_message_; }
    const ErrorContext& getErrorContext() const { return error_context_; }
    
    // 便捷操作符
    explicit operator bool() const { return success_; }
    
private:
    bool success_ = false;
    T value_;
    ErrorCode error_code_ = ErrorCode::UNKNOWN_ERROR;
    std::string error_message_;
    ErrorContext error_context_;
};

// void类型的特化
template<>
class Result<void> {
public:
    static Result<void> success() {
        Result<void> result;
        result.success_ = true;
        return result;
    }
    
    static Result<void> error(ErrorCode code, const std::string& message = "", 
                             const ErrorContext& context = ErrorContext()) {
        Result<void> result;
        result.success_ = false;
        result.error_code_ = code;
        result.error_message_ = message;
        result.error_context_ = context;
        return result;
    }
    
    bool isSuccess() const { return success_; }
    bool isError() const { return !success_; }
    
    ErrorCode getErrorCode() const { return error_code_; }
    const std::string& getErrorMessage() const { return error_message_; }
    const ErrorContext& getErrorContext() const { return error_context_; }
    
    explicit operator bool() const { return success_; }
    
private:
    bool success_ = false;
    ErrorCode error_code_ = ErrorCode::UNKNOWN_ERROR;
    std::string error_message_;
    ErrorContext error_context_;
};

// 自定义异常类
class WarehouseException : public std::exception {
public:
    WarehouseException(ErrorCode code, const std::string& message, 
                      const ErrorContext& context = ErrorContext())
        : error_code_(code), error_message_(message), error_context_(context) {
        
        // 构造完整的错误消息
        full_message_ = "[" + std::to_string(static_cast<int>(code)) + "] " + message;
        if (!context.component.empty()) {
            full_message_ += " (Component: " + context.component;
            if (!context.operation.empty()) {
                full_message_ += ", Operation: " + context.operation;
            }
            full_message_ += ")";
        }
    }
    
    const char* what() const noexcept override {
        return full_message_.c_str();
    }
    
    ErrorCode getErrorCode() const { return error_code_; }
    const std::string& getErrorMessage() const { return error_message_; }
    const ErrorContext& getErrorContext() const { return error_context_; }
    
private:
    ErrorCode error_code_;
    std::string error_message_;
    ErrorContext error_context_;
    std::string full_message_;
};

// 错误处理工具类
class ErrorHandler {
public:
    // 错误码转字符串
    static std::string errorCodeToString(ErrorCode code);
    
    // 错误码转用户友好的消息
    static std::string errorCodeToUserMessage(ErrorCode code);
    
    // 记录错误到日志系统
    static void logError(ErrorCode code, const std::string& message, 
                        const ErrorContext& context = ErrorContext());
    
    // 记录警告到日志系统
    static void logWarning(ErrorCode code, const std::string& message, 
                          const ErrorContext& context = ErrorContext());
    
    // 处理关键错误（记录日志并可能终止程序）
    static void handleCriticalError(ErrorCode code, const std::string& message, 
                                   const ErrorContext& context = ErrorContext());
    
    // 从异常创建Result
    template<typename T>
    static Result<T> fromException(const std::exception& e, 
                                  const ErrorContext& context = ErrorContext()) {
        // 尝试转换为自定义异常
        if (const auto* warehouse_ex = dynamic_cast<const WarehouseException*>(&e)) {
            return Result<T>::error(warehouse_ex->getErrorCode(), 
                                   warehouse_ex->getErrorMessage(), 
                                   warehouse_ex->getErrorContext());
        }
        
        // 通用异常处理
        return Result<T>::error(ErrorCode::UNKNOWN_ERROR, e.what(), context);
    }
    
    // 验证并创建错误上下文
    static ErrorContext createContext(const std::string& component, 
                                     const std::string& operation,
                                     const std::string& manager_id = "",
                                     const std::string& transaction_id = "");

private:
    static std::unordered_map<ErrorCode, std::string> error_code_strings_;
    static std::unordered_map<ErrorCode, std::string> user_messages_;
    static void initializeErrorMaps();
    static bool maps_initialized_;
};

// ========== 便捷宏定义 ==========

// 创建成功结果
#define RESULT_SUCCESS(value) Result<std::remove_reference_t<decltype(value)>>::success(value)
#define RESULT_SUCCESS_VOID() Result<void>::success()

// 创建错误结果
#define RESULT_ERROR(type, code, message, context) Result<type>::error(code, message, context)
#define RESULT_ERROR_VOID(code, message, context) Result<void>::error(code, message, context)

// 快速错误上下文创建
#define ERROR_CONTEXT(component, operation) \
    ErrorHandler::createContext(component, operation)

#define ERROR_CONTEXT_WITH_IDS(component, operation, manager_id, trans_id) \
    ErrorHandler::createContext(component, operation, manager_id, trans_id)

// 抛出异常
#define THROW_ERROR(code, message, context) \
    throw WarehouseException(code, message, context)

// 检查结果并处理错误
#define CHECK_RESULT(result) \
    do { \
        if ((result).isError()) { \
            ErrorHandler::logError((result).getErrorCode(), (result).getErrorMessage(), \
                                  (result).getErrorContext()); \
            return (result); \
        } \
    } while(0)

// 检查结果并在错误时返回void
#define CHECK_RESULT_VOID(result) \
    do { \
        if ((result).isError()) { \
            ErrorHandler::logError((result).getErrorCode(), (result).getErrorMessage(), \
                                  (result).getErrorContext()); \
            return RESULT_ERROR_VOID((result).getErrorCode(), (result).getErrorMessage(), \
                                    (result).getErrorContext()); \
        } \
    } while(0)

// 尝试执行操作并捕获异常
#define TRY_OPERATION(operation, default_context) \
    try { \
        operation; \
    } catch (const std::exception& e) { \
        ErrorHandler::logError(ErrorCode::UNKNOWN_ERROR, e.what(), default_context); \
        throw; \
    }

#endif // ERROR_HANDLING_H