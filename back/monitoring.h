#ifndef MONITORING_H
#define MONITORING_H

#include <string>
#include <atomic>
#include <chrono>
#include <mutex>
#include <unordered_map>
#include <memory>
#include <thread>
#include <limits>
#include <vector>

// 度量指标类型
enum class MetricType {
    COUNTER,    // 计数器（只增不减）
    GAUGE,      // 仪表盘（可增可减）
    HISTOGRAM,  // 直方图（用于响应时间等）
    TIMER       // 计时器
};

// 基础度量指标
class Metric {
public:
    Metric(const std::string& name, MetricType type, const std::string& description = "")
        : name_(name), type_(type), description_(description) {}
    
    virtual ~Metric() = default;
    
    const std::string& getName() const { return name_; }
    MetricType getType() const { return type_; }
    const std::string& getDescription() const { return description_; }
    
    virtual std::string getValue() const = 0;
    virtual void reset() = 0;

protected:
    std::string name_;
    MetricType type_;
    std::string description_;
};

// 计数器指标
class Counter : public Metric {
public:
    Counter(const std::string& name, const std::string& description = "")
        : Metric(name, MetricType::COUNTER, description), value_(0) {}
    
    void increment(uint64_t delta = 1) {
        value_.fetch_add(delta, std::memory_order_relaxed);
    }
    
    uint64_t get() const {
        return value_.load(std::memory_order_relaxed);
    }
    
    std::string getValue() const override {
        return std::to_string(get());
    }
    
    void reset() override {
        value_.store(0, std::memory_order_relaxed);
    }

private:
    std::atomic<uint64_t> value_;
};

// 仪表盘指标
class Gauge : public Metric {
public:
    Gauge(const std::string& name, const std::string& description = "")
        : Metric(name, MetricType::GAUGE, description), value_(0) {}
    
    void set(double value) {
        std::lock_guard<std::mutex> lock(mutex_);
        value_ = value;
    }
    
    void increment(double delta = 1.0) {
        std::lock_guard<std::mutex> lock(mutex_);
        value_ += delta;
    }
    
    void decrement(double delta = 1.0) {
        std::lock_guard<std::mutex> lock(mutex_);
        value_ -= delta;
    }
    
    double get() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return value_;
    }
    
    std::string getValue() const override {
        return std::to_string(get());
    }
    
    void reset() override {
        std::lock_guard<std::mutex> lock(mutex_);
        value_ = 0.0;
    }

private:
    mutable std::mutex mutex_;
    double value_;
};

// 直方图指标（用于响应时间分布）
class Histogram : public Metric {
public:
    Histogram(const std::string& name, const std::string& description = "")
        : Metric(name, MetricType::HISTOGRAM, description)
        , count_(0), sum_(0.0), min_(std::numeric_limits<double>::max())
        , max_(std::numeric_limits<double>::lowest()) {}
    
    void observe(double value) {
        std::lock_guard<std::mutex> lock(mutex_);
        count_++;
        sum_ += value;
        if (value < min_) min_ = value;
        if (value > max_) max_ = value;
        
        // 简单的分桶统计
        updateBuckets(value);
    }
    
    struct Statistics {
        uint64_t count;
        double sum;
        double min;
        double max;
        double average;
        std::unordered_map<std::string, uint64_t> buckets;
    };
    
    Statistics getStatistics() const {
        std::lock_guard<std::mutex> lock(mutex_);
        Statistics stats;
        stats.count = count_;
        stats.sum = sum_;
        stats.min = (count_ > 0) ? min_ : 0.0;
        stats.max = (count_ > 0) ? max_ : 0.0;
        stats.average = (count_ > 0) ? sum_ / count_ : 0.0;
        stats.buckets = buckets_;
        return stats;
    }
    
    std::string getValue() const override {
        auto stats = getStatistics();
        return "count=" + std::to_string(stats.count) + 
               ",avg=" + std::to_string(stats.average) +
               ",min=" + std::to_string(stats.min) +
               ",max=" + std::to_string(stats.max);
    }
    
    void reset() override {
        std::lock_guard<std::mutex> lock(mutex_);
        count_ = 0;
        sum_ = 0.0;
        min_ = std::numeric_limits<double>::max();
        max_ = std::numeric_limits<double>::lowest();
        buckets_.clear();
    }

private:
    mutable std::mutex mutex_;
    uint64_t count_;
    double sum_;
    double min_;
    double max_;
    std::unordered_map<std::string, uint64_t> buckets_;
    
    void updateBuckets(double value) {
        // 响应时间分桶
        if (value <= 1.0) buckets_["<=1ms"]++;
        else if (value <= 5.0) buckets_["<=5ms"]++;
        else if (value <= 10.0) buckets_["<=10ms"]++;
        else if (value <= 50.0) buckets_["<=50ms"]++;
        else if (value <= 100.0) buckets_["<=100ms"]++;
        else if (value <= 500.0) buckets_["<=500ms"]++;
        else if (value <= 1000.0) buckets_["<=1s"]++;
        else buckets_[">1s"]++;
    }
};

// 系统监控管理器
class MonitoringManager {
public:
    static MonitoringManager& getInstance();
    
    // ========== 指标注册 ==========
    
    // 注册计数器
    std::shared_ptr<Counter> registerCounter(const std::string& name, const std::string& description = "");
    
    // 注册仪表盘
    std::shared_ptr<Gauge> registerGauge(const std::string& name, const std::string& description = "");
    
    // 注册直方图
    std::shared_ptr<Histogram> registerHistogram(const std::string& name, const std::string& description = "");
    
    // ========== 快捷操作 ==========
    
    // 增加计数器
    void incrementCounter(const std::string& name, uint64_t delta = 1);
    
    // 设置仪表盘值
    void setGauge(const std::string& name, double value);
    
    // 记录直方图观测值
    void observeHistogram(const std::string& name, double value);
    
    // ========== 预定义业务指标 ==========
    
    // 交易相关指标
    void recordTransaction(const std::string& manager_id, const std::string& type, double amount);
    void recordTransactionError(const std::string& error_type);
    void recordTransactionDuration(double duration_ms);
    
    // 持久化相关指标
    void recordWALWrite(bool success, double duration_ms);
    void recordSnapshotOperation(const std::string& operation, bool success, double duration_ms);
    
    // HTTP相关指标
    void recordHTTPRequest(const std::string& method, const std::string& path, int status_code, double duration_ms);
    
    // 系统资源指标
    void updateSystemMetrics();
    
    // ========== 查询和导出 ==========
    
    // 获取所有指标
    std::unordered_map<std::string, std::shared_ptr<Metric>> getAllMetrics() const;
    
    // 获取指标快照
    struct MetricSnapshot {
        std::string name;
        std::string type;
        std::string value;
        std::string description;
        std::string timestamp;
    };
    
    std::vector<MetricSnapshot> getMetricsSnapshot() const;
    
    // 导出为Prometheus格式
    std::string exportPrometheusFormat() const;
    
    // 导出为JSON格式
    std::string exportJSONFormat() const;
    
    // ========== 健康检查 ==========
    
    struct HealthStatus {
        bool healthy;
        std::string status;  // "healthy", "warning", "critical"
        std::vector<std::string> issues;
        std::unordered_map<std::string, std::string> details;
    };
    
    HealthStatus getHealthStatus() const;
    
    // ========== 配置管理 ==========
    
    // 启用/禁用监控
    void setEnabled(bool enabled) { enabled_ = enabled; }
    bool isEnabled() const { return enabled_; }
    
    // 设置度量收集间隔
    void setCollectionInterval(int seconds) { collection_interval_ = seconds; }
    
    // 启动定期收集
    void startPeriodicCollection();
    void stopPeriodicCollection();

private:
    MonitoringManager();
    ~MonitoringManager();
    
    // 禁用拷贝
    MonitoringManager(const MonitoringManager&) = delete;
    MonitoringManager& operator=(const MonitoringManager&) = delete;
    
    // 定期收集系统指标
    void periodicCollectionWorker();
    
    // 获取系统资源信息
    double getCPUUsage() const;
    double getMemoryUsage() const;
    double getDiskUsage() const;
    
    // 成员变量
    mutable std::mutex metrics_mutex_;
    std::unordered_map<std::string, std::shared_ptr<Metric>> metrics_;
    
    std::atomic<bool> enabled_;
    std::atomic<int> collection_interval_;
    std::atomic<bool> stop_collection_;
    std::thread collection_worker_;
    
    // 系统启动时间
    std::chrono::steady_clock::time_point start_time_;
};

// ========== 便捷宏定义 ==========

#define MONITOR() MonitoringManager::getInstance()

// 计数器操作
#define INC_COUNTER(name) MONITOR().incrementCounter(name)
#define INC_COUNTER_BY(name, delta) MONITOR().incrementCounter(name, delta)

// 仪表盘操作
#define SET_GAUGE(name, value) MONITOR().setGauge(name, value)

// 直方图操作
#define OBSERVE_HISTOGRAM(name, value) MONITOR().observeHistogram(name, value)

// 业务指标记录
#define RECORD_TRANSACTION(manager_id, type, amount) \
    MONITOR().recordTransaction(manager_id, type, amount)

#define RECORD_TRANSACTION_ERROR(error_type) \
    MONITOR().recordTransactionError(error_type)

#define RECORD_WAL_WRITE(success, duration) \
    MONITOR().recordWALWrite(success, duration)

#define RECORD_HTTP_REQUEST(method, path, status, duration) \
    MONITOR().recordHTTPRequest(method, path, status, duration)

// RAII风格的操作计时器
class OperationTimer {
public:
    OperationTimer(const std::string& metric_name)
        : metric_name_(metric_name)
        , start_time_(std::chrono::high_resolution_clock::now()) {}
    
    ~OperationTimer() {
        auto end_time = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time_);
        double duration_ms = duration.count() / 1000.0;
        
        OBSERVE_HISTOGRAM(metric_name_, duration_ms);
    }

private:
    std::string metric_name_;
    std::chrono::high_resolution_clock::time_point start_time_;
};

#define TIMER(metric_name) OperationTimer _timer(metric_name)

#endif // MONITORING_H