#include "logger.h"
#include <iostream>
#include <iomanip>
#include <filesystem>
#include <cstring>

Logger& Logger::getInstance() {
    static Logger instance;
    return instance;
}

Logger::Logger() 
    : log_level_(LogLevel::INFO)
    , console_output_enabled_(true)
    , async_mode_enabled_(true)
    , max_file_size_(100)  // 100MB
    , max_file_count_(10)
    , stop_requested_(false)
    , start_time_(std::chrono::steady_clock::now()) {
    
    // 默认日志文件路径
    log_file_path_ = "./logs/warehouse.log";
}

Logger::~Logger() {
    stop();
}

bool Logger::start() {
    try {
        // 创建日志目录
        std::filesystem::path log_path(log_file_path_);
        std::filesystem::create_directories(log_path.parent_path());
        
        // 打开日志文件
        log_file_ = std::make_unique<std::ofstream>(log_file_path_, std::ios::app);
        if (!log_file_->is_open()) {
            std::cerr << "Failed to open log file: " << log_file_path_ << std::endl;
            return false;
        }
        
        // 启动异步工作线程
        if (async_mode_enabled_) {
            stop_requested_ = false;
            async_worker_ = std::thread(&Logger::asyncLogWorker, this);
        }
        
        // 记录启动日志
        info("Logger", "start", "Log system started successfully");
        
        return true;
    } catch (const std::exception& e) {
        std::cerr << "Logger initialization failed: " << e.what() << std::endl;
        return false;
    }
}

void Logger::stop() {
    if (async_mode_enabled_ && async_worker_.joinable()) {
        // 停止异步工作线程
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            stop_requested_ = true;
        }
        queue_condition_.notify_all();
        async_worker_.join();
    }
    
    // 刷新并关闭文件
    if (log_file_ && log_file_->is_open()) {
        log_file_->flush();
        log_file_->close();
    }
}

void Logger::flush() {
    if (log_file_ && log_file_->is_open()) {
        std::lock_guard<std::mutex> lock(file_mutex_);
        log_file_->flush();
    }
}

void Logger::setLogLevel(LogLevel level) {
    log_level_ = level;
}

void Logger::setLogFile(const std::string& file_path) {
    log_file_path_ = file_path;
}

void Logger::enableConsoleOutput(bool enable) {
    console_output_enabled_ = enable;
}

void Logger::enableAsyncMode(bool enable) {
    async_mode_enabled_ = enable;
}

void Logger::setMaxFileSize(int mb) {
    max_file_size_ = mb;
}

void Logger::setMaxFileCount(int count) {
    max_file_count_ = count;
}

void Logger::log(LogLevel level, const std::string& component, const std::string& operation,
                const std::string& message, const std::string& file, int line) {
    
    // 检查日志级别
    if (level < log_level_) {
        return;
    }
    
    // 创建日志条目
    LogEntry entry;
    entry.level = level;
    entry.timestamp = getCurrentTimestamp();
    entry.thread_id = getThreadId();
    entry.component = component;
    entry.operation = operation;
    entry.message = message;
    entry.file = file;
    entry.line = line;
    
    // 更新统计信息
    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        statistics_.total_logs++;
        switch (level) {
            case LogLevel::DEBUG: statistics_.debug_count++; break;
            case LogLevel::INFO: statistics_.info_count++; break;
            case LogLevel::WARNING: statistics_.warning_count++; break;
            case LogLevel::ERROR: statistics_.error_count++; break;
            case LogLevel::FATAL: statistics_.fatal_count++; break;
        }
    }
    
    // 缓存错误日志
    if (level >= LogLevel::ERROR) {
        std::lock_guard<std::mutex> lock(recent_errors_mutex_);
        recent_errors_.push(entry);
        if (recent_errors_.size() > MAX_RECENT_ERRORS) {
            recent_errors_.pop();
        }
    }
    
    // 异步或同步写入
    if (async_mode_enabled_) {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        log_queue_.push(entry);
        queue_condition_.notify_one();
    } else {
        writeLogEntry(entry);
    }
}

void Logger::debug(const std::string& component, const std::string& operation, 
                  const std::string& message, const std::string& file, int line) {
    log(LogLevel::DEBUG, component, operation, message, file, line);
}

void Logger::info(const std::string& component, const std::string& operation, 
                 const std::string& message, const std::string& file, int line) {
    log(LogLevel::INFO, component, operation, message, file, line);
}

void Logger::warning(const std::string& component, const std::string& operation, 
                    const std::string& message, const std::string& file, int line) {
    log(LogLevel::WARNING, component, operation, message, file, line);
}

void Logger::error(const std::string& component, const std::string& operation, 
                  const std::string& message, const std::string& file, int line) {
    log(LogLevel::ERROR, component, operation, message, file, line);
}

void Logger::fatal(const std::string& component, const std::string& operation, 
                  const std::string& message, const std::string& file, int line) {
    log(LogLevel::FATAL, component, operation, message, file, line);
}

void Logger::logPerformance(const std::string& operation, double duration_ms, const std::string& details) {
    std::ostringstream oss;
    oss << "Operation '" << operation << "' completed in " 
        << std::fixed << std::setprecision(3) << duration_ms << "ms";
    if (!details.empty()) {
        oss << " (" << details << ")";
    }
    
    LogLevel level = (duration_ms > 1000.0) ? LogLevel::WARNING : LogLevel::INFO;
    log(level, "Performance", operation, oss.str());
}

void Logger::logBusinessEvent(const std::string& event_type, const std::string& manager_id, 
                             const std::string& details) {
    std::ostringstream oss;
    oss << "Business event: " << event_type << " for manager: " << manager_id;
    if (!details.empty()) {
        oss << " - " << details;
    }
    
    log(LogLevel::INFO, "Business", event_type, oss.str());
}

void Logger::logSystemStatus(const std::string& component, const std::string& status, 
                            const std::string& metrics) {
    std::ostringstream oss;
    oss << "System status: " << status;
    if (!metrics.empty()) {
        oss << " [" << metrics << "]";
    }
    
    log(LogLevel::INFO, component, "status", oss.str());
}

void Logger::asyncLogWorker() {
    while (true) {
        std::unique_lock<std::mutex> lock(queue_mutex_);
        
        // 等待日志条目或停止信号
        queue_condition_.wait(lock, [this] {
            return !log_queue_.empty() || stop_requested_;
        });
        
        // 处理队列中的所有日志条目
        while (!log_queue_.empty()) {
            LogEntry entry = log_queue_.front();
            log_queue_.pop();
            lock.unlock();
            
            writeLogEntry(entry);
            
            lock.lock();
        }
        
        if (stop_requested_) {
            break;
        }
    }
}

void Logger::writeLogEntry(const LogEntry& entry) {
    std::string formatted_log = formatLogEntry(entry);
    
    // 控制台输出
    if (console_output_enabled_) {
        std::cout << colorizeOutput(entry.level, formatted_log) << std::endl;
    }
    
    // 文件输出
    if (log_file_ && log_file_->is_open()) {
        std::lock_guard<std::mutex> lock(file_mutex_);
        *log_file_ << formatted_log << std::endl;
        log_file_->flush();
        
        // 检查文件大小并轮转
        auto file_size = log_file_->tellp();
        if (file_size > max_file_size_ * 1024 * 1024) {
            rotateLogFile();
        }
    }
}

std::string Logger::formatLogEntry(const LogEntry& entry) const {
    std::ostringstream oss;
    
    // 时间戳
    oss << "[" << entry.timestamp << "] ";
    
    // 日志级别
    oss << "[" << std::setw(7) << std::left << logLevelToString(entry.level) << "] ";
    
    // 线程ID
    oss << "[" << entry.thread_id << "] ";
    
    // 组件和操作
    oss << "[" << entry.component;
    if (!entry.operation.empty()) {
        oss << "::" << entry.operation;
    }
    oss << "] ";
    
    // 消息
    oss << entry.message;
    
    // 文件和行号（仅在DEBUG级别显示）
    if (entry.level == LogLevel::DEBUG && !entry.file.empty()) {
        const char* filename = strrchr(entry.file.c_str(), '/');
        filename = filename ? filename + 1 : entry.file.c_str();
        oss << " (" << filename << ":" << entry.line << ")";
    }
    
    return oss.str();
}

bool Logger::rotateLogFile() {
    if (!log_file_ || !log_file_->is_open()) {
        return false;
    }
    
    try {
        log_file_->close();
        
        // 重命名当前日志文件
        std::string timestamp = getCurrentTimestamp();
        std::replace(timestamp.begin(), timestamp.end(), ':', '-');
        std::replace(timestamp.begin(), timestamp.end(), ' ', '_');
        
        std::string rotated_name = log_file_path_ + "." + timestamp;
        std::filesystem::rename(log_file_path_, rotated_name);
        
        // 清理旧文件
        // TODO: 实现日志文件清理逻辑
        
        // 重新打开新文件
        log_file_ = std::make_unique<std::ofstream>(log_file_path_, std::ios::app);
        
        return log_file_->is_open();
    } catch (const std::exception& e) {
        std::cerr << "Log file rotation failed: " << e.what() << std::endl;
        return false;
    }
}

std::string Logger::getCurrentTimestamp() const {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    
    std::ostringstream oss;
    oss << std::put_time(std::localtime(&time_t), "%Y-%m-%d %H:%M:%S");
    oss << "." << std::setfill('0') << std::setw(3) << ms.count();
    
    return oss.str();
}

std::string Logger::getThreadId() const {
    std::ostringstream oss;
    oss << std::this_thread::get_id();
    return oss.str();
}

std::string Logger::logLevelToString(LogLevel level) const {
    switch (level) {
        case LogLevel::DEBUG: return "DEBUG";
        case LogLevel::INFO: return "INFO";
        case LogLevel::WARNING: return "WARNING";
        case LogLevel::ERROR: return "ERROR";
        case LogLevel::FATAL: return "FATAL";
        default: return "UNKNOWN";
    }
}

std::string Logger::colorizeOutput(LogLevel level, const std::string& message) const {
    // ANSI颜色代码
    const char* color_code = "";
    const char* reset_code = "\033[0m";
    
    switch (level) {
        case LogLevel::DEBUG: color_code = "\033[36m"; break;   // 青色
        case LogLevel::INFO: color_code = "\033[32m"; break;    // 绿色
        case LogLevel::WARNING: color_code = "\033[33m"; break; // 黄色
        case LogLevel::ERROR: color_code = "\033[31m"; break;   // 红色
        case LogLevel::FATAL: color_code = "\033[35m"; break;   // 紫色
    }
    
    return std::string(color_code) + message + reset_code;
}

Logger::LogStatistics Logger::getStatistics() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    
    LogStatistics stats = statistics_;
    stats.start_time = getCurrentTimestamp();
    
    auto now = std::chrono::steady_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::seconds>(now - start_time_);
    stats.uptime_seconds = duration.count();
    
    return stats;
}

std::vector<LogEntry> Logger::getRecentErrors(int count) const {
    std::lock_guard<std::mutex> lock(recent_errors_mutex_);
    
    std::vector<LogEntry> errors;
    std::queue<LogEntry> temp_queue = recent_errors_;
    
    while (!temp_queue.empty() && errors.size() < static_cast<size_t>(count)) {
        errors.push_back(temp_queue.front());
        temp_queue.pop();
    }
    
    return errors;
}