#include "monitoring.h"
#include <iostream>
#include <thread>
#include <fstream>
#include <sstream>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <limits>

// ========== MonitoringManager 实现 ==========

MonitoringManager::MonitoringManager() 
    : enabled_(true), collection_interval_(60), stop_collection_(false),
      start_time_(std::chrono::steady_clock::now()) {
}

MonitoringManager::~MonitoringManager() {
    stopPeriodicCollection();
}

MonitoringManager& MonitoringManager::getInstance() {
    static MonitoringManager instance;
    return instance;
}

// ========== 指标注册 ==========

std::shared_ptr<Counter> MonitoringManager::registerCounter(const std::string& name, const std::string& description) {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    auto counter = std::make_shared<Counter>(name, description);
    metrics_[name] = counter;
    return counter;
}

std::shared_ptr<Gauge> MonitoringManager::registerGauge(const std::string& name, const std::string& description) {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    auto gauge = std::make_shared<Gauge>(name, description);
    metrics_[name] = gauge;
    return gauge;
}

std::shared_ptr<Histogram> MonitoringManager::registerHistogram(const std::string& name, const std::string& description) {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    auto histogram = std::make_shared<Histogram>(name, description);
    metrics_[name] = histogram;
    return histogram;
}

// ========== 快捷操作 ==========

void MonitoringManager::incrementCounter(const std::string& name, uint64_t delta) {
    if (!enabled_) return;
    
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    auto it = metrics_.find(name);
    if (it != metrics_.end()) {
        auto counter = std::dynamic_pointer_cast<Counter>(it->second);
        if (counter) {
            counter->increment(delta);
        }
    }
}

void MonitoringManager::setGauge(const std::string& name, double value) {
    if (!enabled_) return;
    
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    auto it = metrics_.find(name);
    if (it != metrics_.end()) {
        auto gauge = std::dynamic_pointer_cast<Gauge>(it->second);
        if (gauge) {
            gauge->set(value);
        }
    }
}

void MonitoringManager::observeHistogram(const std::string& name, double value) {
    if (!enabled_) return;
    
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    auto it = metrics_.find(name);
    if (it != metrics_.end()) {
        auto histogram = std::dynamic_pointer_cast<Histogram>(it->second);
        if (histogram) {
            histogram->observe(value);
        }
    }
}

// ========== 预定义业务指标 ==========

void MonitoringManager::recordTransaction(const std::string& manager_id, const std::string& type, double amount) {
    if (!enabled_) return;
    
    incrementCounter("total_transactions");
    incrementCounter("transactions_" + type);
    
    auto gauge_name = "manager_" + manager_id + "_balance";
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    auto it = metrics_.find(gauge_name);
    if (it != metrics_.end()) {
        auto gauge = std::dynamic_pointer_cast<Gauge>(it->second);
        if (gauge) {
            if (type == "in") {
                gauge->increment(amount);
            } else if (type == "out") {
                gauge->decrement(amount);
            }
        }
    } else {
        // 自动注册新的管理员余额指标
        auto gauge = std::make_shared<Gauge>(gauge_name, "Manager " + manager_id + " balance");
        metrics_[gauge_name] = gauge;
        if (type == "in") {
            gauge->set(amount);
        }
    }
}

void MonitoringManager::recordTransactionError(const std::string& error_type) {
    if (!enabled_) return;
    
    incrementCounter("total_errors");
    incrementCounter("error_" + error_type);
}

void MonitoringManager::recordTransactionDuration(double duration_ms) {
    if (!enabled_) return;
    
    observeHistogram("transaction_duration", duration_ms);
}

void MonitoringManager::recordWALWrite(bool success, double duration_ms) {
    if (!enabled_) return;
    
    incrementCounter("wal_writes_total");
    if (success) {
        incrementCounter("wal_writes_success");
    } else {
        incrementCounter("wal_writes_failed");
    }
    
    if (duration_ms > 0) {
        observeHistogram("wal_write_duration", duration_ms);
    }
}

void MonitoringManager::recordSnapshotOperation(const std::string& operation, bool success, double duration_ms) {
    if (!enabled_) return;
    
    incrementCounter("snapshot_operations_total");
    incrementCounter("snapshot_" + operation + "_total");
    
    if (success) {
        incrementCounter("snapshot_" + operation + "_success");
    } else {
        incrementCounter("snapshot_" + operation + "_failed");
    }
    
    if (duration_ms > 0) {
        observeHistogram("snapshot_" + operation + "_duration", duration_ms);
    }
}

void MonitoringManager::recordHTTPRequest(const std::string& method, const std::string& path, int status_code, double duration_ms) {
    if (!enabled_) return;
    
    incrementCounter("http_requests_total");
    incrementCounter("http_requests_" + method);
    
    // 按状态码统计
    if (status_code >= 200 && status_code < 300) {
        incrementCounter("http_requests_2xx");
    } else if (status_code >= 400 && status_code < 500) {
        incrementCounter("http_requests_4xx");
    } else if (status_code >= 500) {
        incrementCounter("http_requests_5xx");
    }
    
    // 记录响应时间
    observeHistogram("http_request_duration", duration_ms);
    
    // 记录具体路径的统计
    std::string path_metric = "http_path" + path;
    std::replace(path_metric.begin(), path_metric.end(), '/', '_');
    incrementCounter(path_metric);
}

void MonitoringManager::updateSystemMetrics() {
    if (!enabled_) return;
    
    // 更新系统资源指标
    setGauge("system_cpu_usage", getCPUUsage());
    setGauge("system_memory_usage", getMemoryUsage());
    setGauge("system_disk_usage", getDiskUsage());
    
    // 更新运行时间
    auto now = std::chrono::steady_clock::now();
    auto uptime = std::chrono::duration_cast<std::chrono::seconds>(now - start_time_).count();
    setGauge("system_uptime_seconds", static_cast<double>(uptime));
}

// ========== 查询和导出 ==========

std::unordered_map<std::string, std::shared_ptr<Metric>> MonitoringManager::getAllMetrics() const {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    return metrics_;
}

std::vector<MonitoringManager::MetricSnapshot> MonitoringManager::getMetricsSnapshot() const {
    std::vector<MetricSnapshot> snapshots;
    
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    
    std::stringstream timestamp_ss;
    timestamp_ss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%SZ");
    std::string timestamp = timestamp_ss.str();
    
    for (const auto& pair : metrics_) {
        MetricSnapshot snapshot;
        snapshot.name = pair.second->getName();
        snapshot.value = pair.second->getValue();
        snapshot.description = pair.second->getDescription();
        snapshot.timestamp = timestamp;
        
        switch (pair.second->getType()) {
            case MetricType::COUNTER:
                snapshot.type = "counter";
                break;
            case MetricType::GAUGE:
                snapshot.type = "gauge";
                break;
            case MetricType::HISTOGRAM:
                snapshot.type = "histogram";
                break;
            case MetricType::TIMER:
                snapshot.type = "timer";
                break;
        }
        
        snapshots.push_back(snapshot);
    }
    
    return snapshots;
}

std::string MonitoringManager::exportPrometheusFormat() const {
    std::ostringstream output;
    
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    
    for (const auto& pair : metrics_) {
        const auto& metric = pair.second;
        
        // HELP line
        output << "# HELP " << metric->getName() << " " << metric->getDescription() << "\n";
        
        // TYPE line
        std::string type_str;
        switch (metric->getType()) {
            case MetricType::COUNTER:
                type_str = "counter";
                break;
            case MetricType::GAUGE:
                type_str = "gauge";
                break;
            case MetricType::HISTOGRAM:
                type_str = "histogram";
                break;
            case MetricType::TIMER:
                type_str = "histogram";
                break;
        }
        output << "# TYPE " << metric->getName() << " " << type_str << "\n";
        
        // VALUE line
        if (metric->getType() == MetricType::HISTOGRAM) {
            auto histogram = std::dynamic_pointer_cast<Histogram>(metric);
            if (histogram) {
                auto stats = histogram->getStatistics();
                output << metric->getName() << "_count " << stats.count << "\n";
                output << metric->getName() << "_sum " << stats.sum << "\n";
                
                for (const auto& bucket : stats.buckets) {
                    output << metric->getName() << "_bucket{le=\"" << bucket.first << "\"} " << bucket.second << "\n";
                }
            }
        } else {
            output << metric->getName() << " " << metric->getValue() << "\n";
        }
        
        output << "\n";
    }
    
    return output.str();
}

std::string MonitoringManager::exportJSONFormat() const {
    std::ostringstream json;
    json << "{\"metrics\":[";
    
    auto snapshots = getMetricsSnapshot();
    
    for (size_t i = 0; i < snapshots.size(); ++i) {
        if (i > 0) json << ",";
        
        const auto& snapshot = snapshots[i];
        json << "{";
        json << "\"name\":\"" << snapshot.name << "\",";
        json << "\"type\":\"" << snapshot.type << "\",";
        json << "\"value\":\"" << snapshot.value << "\",";
        json << "\"description\":\"" << snapshot.description << "\",";
        json << "\"timestamp\":\"" << snapshot.timestamp << "\"";
        json << "}";
    }
    
    json << "]}";
    return json.str();
}

// ========== 健康检查 ==========

MonitoringManager::HealthStatus MonitoringManager::getHealthStatus() const {
    HealthStatus status;
    status.healthy = true;
    status.status = "healthy";
    
    // 检查基本指标
    auto metrics = getAllMetrics();
    
    // 检查错误率
    auto error_counter = metrics.find("total_errors");
    auto total_counter = metrics.find("total_transactions");
    
    if (error_counter != metrics.end() && total_counter != metrics.end()) {
        auto error_count = std::dynamic_pointer_cast<Counter>(error_counter->second);
        auto total_count = std::dynamic_pointer_cast<Counter>(total_counter->second);
        
        if (error_count && total_count) {
            double error_rate = 0.0;
            if (total_count->get() > 0) {
                error_rate = static_cast<double>(error_count->get()) / total_count->get();
            }
            
            status.details["error_rate"] = std::to_string(error_rate);
            
            if (error_rate > 0.1) { // 10% 错误率
                status.healthy = false;
                status.status = "critical";
                status.issues.push_back("High error rate: " + std::to_string(error_rate * 100) + "%");
            } else if (error_rate > 0.05) { // 5% 错误率
                status.status = "warning";
                status.issues.push_back("Elevated error rate: " + std::to_string(error_rate * 100) + "%");
            }
        }
    }
    
    // 检查系统资源
    auto cpu_gauge = metrics.find("system_cpu_usage");
    if (cpu_gauge != metrics.end()) {
        auto cpu = std::dynamic_pointer_cast<Gauge>(cpu_gauge->second);
        if (cpu) {
            double cpu_usage = cpu->get();
            status.details["cpu_usage"] = std::to_string(cpu_usage);
            
            if (cpu_usage > 90.0) {
                status.healthy = false;
                status.status = "critical";
                status.issues.push_back("High CPU usage: " + std::to_string(cpu_usage) + "%");
            } else if (cpu_usage > 80.0) {
                if (status.status == "healthy") status.status = "warning";
                status.issues.push_back("Elevated CPU usage: " + std::to_string(cpu_usage) + "%");
            }
        }
    }
    
    auto memory_gauge = metrics.find("system_memory_usage");
    if (memory_gauge != metrics.end()) {
        auto memory = std::dynamic_pointer_cast<Gauge>(memory_gauge->second);
        if (memory) {
            double memory_usage = memory->get();
            status.details["memory_usage"] = std::to_string(memory_usage);
            
            if (memory_usage > 90.0) {
                status.healthy = false;
                status.status = "critical";
                status.issues.push_back("High memory usage: " + std::to_string(memory_usage) + "%");
            } else if (memory_usage > 80.0) {
                if (status.status == "healthy") status.status = "warning";
                status.issues.push_back("Elevated memory usage: " + std::to_string(memory_usage) + "%");
            }
        }
    }
    
    return status;
}

// ========== 配置管理 ==========

void MonitoringManager::startPeriodicCollection() {
    if (!stop_collection_.load()) {
        return; // 已经在运行
    }
    
    stop_collection_.store(false);
    
    collection_worker_ = std::thread([this]() {
        periodicCollectionWorker();
    });
}

void MonitoringManager::stopPeriodicCollection() {
    stop_collection_.store(true);
    
    if (collection_worker_.joinable()) {
        collection_worker_.join();
    }
}

// ========== 私有方法 ==========

void MonitoringManager::periodicCollectionWorker() {
    while (!stop_collection_.load()) {
        try {
            updateSystemMetrics();
        } catch (const std::exception& e) {
            // 忽略系统指标收集错误，避免影响主要功能
        }
        
        // 等待指定间隔
        int interval = collection_interval_.load();
        for (int i = 0; i < interval && !stop_collection_.load(); ++i) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
    }
}

double MonitoringManager::getCPUUsage() const {
    // 简化的CPU使用率获取（读取 /proc/stat）
    std::ifstream stat_file("/proc/stat");
    if (!stat_file.is_open()) {
        return 0.0;
    }
    
    std::string line;
    std::getline(stat_file, line);
    
    // 解析第一行的CPU信息
    std::istringstream iss(line);
    std::string cpu_label;
    long user, nice, system, idle, iowait, irq, softirq, steal;
    
    iss >> cpu_label >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal;
    
    long total = user + nice + system + idle + iowait + irq + softirq + steal;
    long work = total - idle - iowait;
    
    // 简化：返回工作时间占比（实际应该计算与上次的差值）
    return total > 0 ? (static_cast<double>(work) / total * 100.0) : 0.0;
}

double MonitoringManager::getMemoryUsage() const {
    // 简化的内存使用率获取（读取 /proc/meminfo）
    std::ifstream meminfo_file("/proc/meminfo");
    if (!meminfo_file.is_open()) {
        return 0.0;
    }
    
    std::string line;
    long total_memory = 0, available_memory = 0;
    
    while (std::getline(meminfo_file, line)) {
        if (line.find("MemTotal:") == 0) {
            std::istringstream iss(line);
            std::string label, unit;
            iss >> label >> total_memory >> unit;
        } else if (line.find("MemAvailable:") == 0) {
            std::istringstream iss(line);
            std::string label, unit;
            iss >> label >> available_memory >> unit;
            break; // 找到所需信息就退出
        }
    }
    
    if (total_memory > 0) {
        long used_memory = total_memory - available_memory;
        return static_cast<double>(used_memory) / total_memory * 100.0;
    }
    
    return 0.0;
}

double MonitoringManager::getDiskUsage() const {
    // 简化的磁盘使用率获取
    // 实际应该使用 statvfs 系统调用
    return 0.0; // 占位实现
}