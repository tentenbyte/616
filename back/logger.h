#ifndef LOGGER_H
#define LOGGER_H

#include <string>
#include <fstream>
#include <memory>
#include <mutex>
#include <sstream>
#include <chrono>
#include <thread>
#include <queue>
#include <atomic>
#include <condition_variable>

// 日志级别枚举
enum class LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
    FATAL = 4
};

// 日志条目结构
struct LogEntry {
    LogLevel level;
    std::string timestamp;
    std::string thread_id;
    std::string component;      // 组件名称 (如 "MemoryDatabase", "PersistenceManager")
    std::string operation;      // 操作名称 (如 "appendTransaction", "writeToWAL")
    std::string message;
    std::string file;           // 源文件名
    int line;                   // 行号
    
    LogEntry() : level(LogLevel::INFO), line(0) {}
};

// 高性能异步日志系统
class Logger {
public:
    static Logger& getInstance();
    
    // ========== 配置管理 ==========
    
    // 设置日志级别
    void setLogLevel(LogLevel level);
    
    // 设置日志文件路径
    void setLogFile(const std::string& file_path);
    
    // 启用/禁用控制台输出
    void enableConsoleOutput(bool enable = true);
    
    // 启用/禁用异步模式
    void enableAsyncMode(bool enable = true);
    
    // 设置日志文件轮转大小（MB）
    void setMaxFileSize(int mb);
    
    // 设置保留的日志文件数量
    void setMaxFileCount(int count);
    
    // ========== 日志记录接口 ==========
    
    // 主要日志记录方法
    void log(LogLevel level, const std::string& component, const std::string& operation,
             const std::string& message, const std::string& file = "", int line = 0);
    
    // 便捷宏定义会用到的方法
    void debug(const std::string& component, const std::string& operation, const std::string& message,
               const std::string& file = "", int line = 0);
    void info(const std::string& component, const std::string& operation, const std::string& message,
              const std::string& file = "", int line = 0);
    void warning(const std::string& component, const std::string& operation, const std::string& message,
                 const std::string& file = "", int line = 0);
    void error(const std::string& component, const std::string& operation, const std::string& message,
               const std::string& file = "", int line = 0);
    void fatal(const std::string& component, const std::string& operation, const std::string& message,
               const std::string& file = "", int line = 0);
    
    // ========== 特殊用途日志 ==========
    
    // 性能监控日志
    void logPerformance(const std::string& operation, double duration_ms, const std::string& details = "");
    
    // 业务事件日志
    void logBusinessEvent(const std::string& event_type, const std::string& manager_id, 
                         const std::string& details);
    
    // 系统状态日志
    void logSystemStatus(const std::string& component, const std::string& status, 
                        const std::string& metrics = "");
    
    // ========== 生命周期管理 ==========
    
    // 启动日志系统
    bool start();
    
    // 停止日志系统（刷新所有缓冲的日志）
    void stop();
    
    // 立即刷新日志缓冲区
    void flush();
    
    // ========== 查询和统计 ==========
    
    struct LogStatistics {
        uint64_t total_logs;
        uint64_t debug_count;
        uint64_t info_count;
        uint64_t warning_count;
        uint64_t error_count;
        uint64_t fatal_count;
        std::string start_time;
        double uptime_seconds;
        
        LogStatistics() : total_logs(0), debug_count(0), info_count(0), 
                         warning_count(0), error_count(0), fatal_count(0), uptime_seconds(0.0) {}
    };
    
    LogStatistics getStatistics() const;
    
    // 获取最近的错误日志
    std::vector<LogEntry> getRecentErrors(int count = 10) const;

private:
    Logger();
    ~Logger();
    
    // 禁用拷贝构造和赋值
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;
    
    // ========== 内部实现 ==========
    
    // 异步日志线程
    void asyncLogWorker();
    
    // 同步写入日志
    void writeLogEntry(const LogEntry& entry);
    
    // 格式化日志条目
    std::string formatLogEntry(const LogEntry& entry) const;
    
    // 文件轮转
    bool rotateLogFile();
    
    // 获取当前时间戳
    std::string getCurrentTimestamp() const;
    
    // 获取线程ID字符串
    std::string getThreadId() const;
    
    // 日志级别转字符串
    std::string logLevelToString(LogLevel level) const;
    
    // 颜色化输出（控制台）
    std::string colorizeOutput(LogLevel level, const std::string& message) const;
    
    // ========== 成员变量 ==========
    
    // 配置
    std::atomic<LogLevel> log_level_;
    std::string log_file_path_;
    std::atomic<bool> console_output_enabled_;
    std::atomic<bool> async_mode_enabled_;
    std::atomic<int> max_file_size_;
    std::atomic<int> max_file_count_;
    
    // 文件输出
    std::unique_ptr<std::ofstream> log_file_;
    std::mutex file_mutex_;
    
    // 异步队列
    std::queue<LogEntry> log_queue_;
    std::mutex queue_mutex_;
    std::condition_variable queue_condition_;
    std::atomic<bool> stop_requested_;
    std::thread async_worker_;
    
    // 统计信息
    mutable std::mutex stats_mutex_;
    LogStatistics statistics_;
    std::chrono::steady_clock::time_point start_time_;
    
    // 最近错误缓存
    mutable std::mutex recent_errors_mutex_;
    std::queue<LogEntry> recent_errors_;
    static const size_t MAX_RECENT_ERRORS = 100;
};

// ========== 便捷宏定义 ==========

#define LOG_DEBUG(component, operation, message) \
    Logger::getInstance().debug(component, operation, message, __FILE__, __LINE__)

#define LOG_INFO(component, operation, message) \
    Logger::getInstance().info(component, operation, message, __FILE__, __LINE__)

#define LOG_WARNING(component, operation, message) \
    Logger::getInstance().warning(component, operation, message, __FILE__, __LINE__)

#define LOG_ERROR(component, operation, message) \
    Logger::getInstance().error(component, operation, message, __FILE__, __LINE__)

#define LOG_FATAL(component, operation, message) \
    Logger::getInstance().fatal(component, operation, message, __FILE__, __LINE__)

// 性能监控宏
#define LOG_PERFORMANCE(operation, duration_ms, details) \
    Logger::getInstance().logPerformance(operation, duration_ms, details)

// 业务事件宏
#define LOG_BUSINESS_EVENT(event_type, manager_id, details) \
    Logger::getInstance().logBusinessEvent(event_type, manager_id, details)

// 系统状态宏
#define LOG_SYSTEM_STATUS(component, status, metrics) \
    Logger::getInstance().logSystemStatus(component, status, metrics)

// ========== 性能计时器 ==========

// RAII风格的性能计时器
class PerformanceTimer {
public:
    PerformanceTimer(const std::string& operation_name) 
        : operation_name_(operation_name)
        , start_time_(std::chrono::high_resolution_clock::now()) {
    }
    
    ~PerformanceTimer() {
        auto end_time = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time_);
        double duration_ms = duration.count() / 1000.0;
        
        LOG_PERFORMANCE(operation_name_, duration_ms, "");
    }
    
private:
    std::string operation_name_;
    std::chrono::high_resolution_clock::time_point start_time_;
};

#define PERF_TIMER(operation) PerformanceTimer _timer(operation)

#endif // LOGGER_H