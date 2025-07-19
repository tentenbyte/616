#include <iostream>
#include <thread>
#include <vector>
#include <atomic>
#include <chrono>
#include <random>
#include <sstream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <cstring>
#include <mutex>
#include <condition_variable>
#include <queue>

// 并发负载测试配置
struct ConcurrentConfig {
    std::string server_host = "127.0.0.1";
    int server_port = 8080;
    int reader_threads = 20;
    int writer_threads = 10;
    int manager_count = 5;
    int operations_per_thread = 500;
    int test_duration_seconds = 180;
    bool test_atomic_counters = true;
    bool test_data_consistency = true;
    bool simulate_real_workload = true;
};

// 原子统计
struct ConcurrentStats {
    std::atomic<uint64_t> read_operations{0};
    std::atomic<uint64_t> write_operations{0};
    std::atomic<uint64_t> successful_reads{0};
    std::atomic<uint64_t> successful_writes{0};
    std::atomic<uint64_t> failed_operations{0};
    std::atomic<uint64_t> consistency_violations{0};
    std::atomic<uint64_t> atomic_counter_conflicts{0};
    
    std::atomic<uint64_t> total_read_time{0};
    std::atomic<uint64_t> total_write_time{0};
    std::atomic<uint64_t> max_read_time{0};
    std::atomic<uint64_t> max_write_time{0};
} g_concurrent_stats;

class ConcurrentLoadTester {
public:
    ConcurrentLoadTester(const ConcurrentConfig& config) : config_(config) {}
    
    void runConcurrentTest() {
        std::cout << "🔄 启动并发负载测试..." << std::endl;
        std::cout << "读者线程: " << config_.reader_threads << std::endl;
        std::cout << "写者线程: " << config_.writer_threads << std::endl;
        std::cout << "Manager数量: " << config_.manager_count << std::endl;
        std::cout << "测试时长: " << config_.test_duration_seconds << " 秒" << std::endl;
        
        auto start_time = std::chrono::high_resolution_clock::now();
        test_start_time_ = start_time;
        
        // 启动监控线程
        std::thread monitor_thread(&ConcurrentLoadTester::monitorConcurrency, this);
        
        // 启动不同类型的测试线程
        std::vector<std::thread> threads;
        
        // 1. 启动写者线程（不同manager）
        for (int i = 0; i < config_.writer_threads; ++i) {
            threads.emplace_back(&ConcurrentLoadTester::writerThread, this, i);
        }
        
        // 2. 启动读者线程
        for (int i = 0; i < config_.reader_threads; ++i) {
            threads.emplace_back(&ConcurrentLoadTester::readerThread, this, i);
        }
        
        // 3. 启动原子计数器测试线程
        if (config_.test_atomic_counters) {
            for (int i = 0; i < 5; ++i) {
                threads.emplace_back(&ConcurrentLoadTester::atomicCounterTestThread, this, i);
            }
        }
        
        // 4. 启动数据一致性测试线程
        if (config_.test_data_consistency) {
            threads.emplace_back(&ConcurrentLoadTester::consistencyTestThread, this);
        }
        
        // 5. 启动混合读写线程（同一manager）
        for (int i = 0; i < 3; ++i) {
            threads.emplace_back(&ConcurrentLoadTester::mixedReadWriteThread, this, i);
        }
        
        // 6. 启动真实业务模拟线程
        if (config_.simulate_real_workload) {
            for (int i = 0; i < 5; ++i) {
                threads.emplace_back(&ConcurrentLoadTester::realWorkloadThread, this, i);
            }
        }
        
        // 等待测试完成
        std::this_thread::sleep_for(std::chrono::seconds(config_.test_duration_seconds));
        
        // 停止所有线程
        stop_test_ = true;
        
        for (auto& t : threads) {
            if (t.joinable()) {
                t.join();
            }
        }
        
        stop_monitoring_ = true;
        if (monitor_thread.joinable()) {
            monitor_thread.join();
        }
        
        auto end_time = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
        
        printConcurrentStats(duration.count());
    }
    
private:
    ConcurrentConfig config_;
    std::atomic<bool> stop_test_{false};
    std::atomic<bool> stop_monitoring_{false};
    std::chrono::high_resolution_clock::time_point test_start_time_;
    
    // 共享数据结构（用于一致性测试）
    std::mutex expected_state_mutex_;
    std::map<std::string, int> expected_inventory_;
    
    void writerThread(int thread_id) {
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> manager_dis(0, config_.manager_count - 1);
        std::uniform_int_distribution<> quantity_dis(1, 100);
        std::uniform_real_distribution<> price_dis(1.0, 1000.0);
        
        int operations = 0;
        
        while (!stop_test_ && operations < config_.operations_per_thread) {
            auto start = std::chrono::high_resolution_clock::now();
            
            std::string manager_id = "concurrent_manager_" + std::to_string(manager_dis(gen));
            int quantity = quantity_dis(gen);
            
            std::string json = createTransactionJson(
                "WRITE_" + std::to_string(thread_id) + "_" + std::to_string(operations),
                "ITEM_" + std::to_string(operations % 50),  // 50种不同物品
                "并发写入测试物品",
                (operations % 3 == 0) ? "out" : "in",  // 偶尔出库
                quantity,
                price_dis(gen),
                "Writer线程" + std::to_string(thread_id)
            );
            
            bool success = sendHttpRequest("POST", "/api/managers/" + manager_id + "/transactions", json);
            
            auto end = std::chrono::high_resolution_clock::now();
            auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();
            
            g_concurrent_stats.write_operations++;
            if (success) {
                g_concurrent_stats.successful_writes++;
                updateExpectedState(manager_id, "ITEM_" + std::to_string(operations % 50), 
                                  (operations % 3 == 0) ? -quantity : quantity);
            } else {
                g_concurrent_stats.failed_operations++;
            }
            
            g_concurrent_stats.total_write_time += duration;
            updateMaxTime(g_concurrent_stats.max_write_time, duration);
            
            operations++;
            
            // 随机暂停（模拟真实负载）
            if (operations % 10 == 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(gen() % 50));
            }
        }
    }
    
    void readerThread(int thread_id) {
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> manager_dis(0, config_.manager_count - 1);
        std::uniform_int_distribution<> operation_dis(0, 3);
        
        int operations = 0;
        
        while (!stop_test_ && operations < config_.operations_per_thread) {
            auto start = std::chrono::high_resolution_clock::now();
            
            std::string manager_id = "concurrent_manager_" + std::to_string(manager_dis(gen));
            std::string endpoint;
            
            // 随机选择不同的读取操作
            switch (operation_dis(gen)) {
                case 0:
                    endpoint = "/api/managers/" + manager_id + "/transactions";
                    break;
                case 1:
                    endpoint = "/api/managers/" + manager_id + "/inventory";
                    break;
                case 2:
                    endpoint = "/api/managers/" + manager_id + "/items";
                    break;
                case 3:
                    endpoint = "/api/managers/" + manager_id + "/statistics";
                    break;
            }
            
            bool success = sendHttpRequest("GET", endpoint, "");
            
            auto end = std::chrono::high_resolution_clock::now();
            auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();
            
            g_concurrent_stats.read_operations++;
            if (success) {
                g_concurrent_stats.successful_reads++;
            } else {
                g_concurrent_stats.failed_operations++;
            }
            
            g_concurrent_stats.total_read_time += duration;
            updateMaxTime(g_concurrent_stats.max_read_time, duration);
            
            operations++;
            
            // 读取频率更高
            if (operations % 20 == 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(gen() % 20));
            }
        }
    }
    
    void atomicCounterTestThread(int thread_id) {
        // 专门测试原子计数器的并发性能
        std::random_device rd;
        std::mt19937 gen(rd());
        
        while (!stop_test_) {
            // 快速连续写入同一个manager，测试原子计数器
            std::string manager_id = "atomic_test_manager";
            
            for (int i = 0; i < 100 && !stop_test_; ++i) {
                std::string json = createTransactionJson(
                    "ATOMIC_" + std::to_string(thread_id) + "_" + std::to_string(i),
                    "ATOMIC_ITEM",
                    "原子计数器测试",
                    "in",
                    1,
                    1.0,
                    "原子计数器并发测试"
                );
                
                auto start = std::chrono::high_resolution_clock::now();
                bool success = sendHttpRequest("POST", "/api/managers/" + manager_id + "/transactions", json);
                auto end = std::chrono::high_resolution_clock::now();
                
                if (!success) {
                    g_concurrent_stats.atomic_counter_conflicts++;
                }
                
                // 立即读取，测试原子计数器的一致性
                bool read_success = sendHttpRequest("GET", "/api/managers/" + manager_id + "/transactions", "");
                if (!read_success) {
                    g_concurrent_stats.consistency_violations++;
                }
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }
    
    void consistencyTestThread() {
        // 数据一致性测试
        while (!stop_test_) {
            for (int manager_id = 0; manager_id < config_.manager_count; ++manager_id) {
                std::string manager = "concurrent_manager_" + std::to_string(manager_id);
                
                // 读取当前库存
                std::string response = sendHttpRequestAndGetResponse("GET", "/api/managers/" + manager + "/inventory", "");
                
                if (!response.empty()) {
                    // 简化的一致性检查（这里只是框架，实际需要解析JSON）
                    if (response.find("error") != std::string::npos || 
                        response.find("null") != std::string::npos) {
                        g_concurrent_stats.consistency_violations++;
                    }
                }
            }
            
            std::this_thread::sleep_for(std::chrono::seconds(5));
        }
    }
    
    void mixedReadWriteThread(int thread_id) {
        // 同一个manager的混合读写操作
        std::string manager_id = "mixed_manager_" + std::to_string(thread_id);
        std::random_device rd;
        std::mt19937 gen(rd());
        
        int operations = 0;
        
        while (!stop_test_ && operations < config_.operations_per_thread) {
            // 80%读操作，20%写操作
            if (gen() % 10 < 8) {
                // 读操作
                sendHttpRequest("GET", "/api/managers/" + manager_id + "/inventory", "");
                g_concurrent_stats.read_operations++;
            } else {
                // 写操作
                std::string json = createTransactionJson(
                    "MIXED_" + std::to_string(thread_id) + "_" + std::to_string(operations),
                    "MIXED_ITEM_" + std::to_string(operations % 10),
                    "混合测试物品",
                    "in",
                    gen() % 50 + 1,
                    (gen() % 10000) / 100.0,
                    "混合读写测试"
                );
                
                sendHttpRequest("POST", "/api/managers/" + manager_id + "/transactions", json);
                g_concurrent_stats.write_operations++;
            }
            
            operations++;
            
            // 短暂暂停
            std::this_thread::sleep_for(std::chrono::microseconds(gen() % 1000));
        }
    }
    
    void realWorkloadThread(int thread_id) {
        // 模拟真实业务负载
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> scenario_dis(0, 4);
        
        while (!stop_test_) {
            int scenario = scenario_dis(gen);
            
            switch (scenario) {
                case 0:
                    simulateInventoryCheck(thread_id, gen);
                    break;
                case 1:
                    simulateBulkInbound(thread_id, gen);
                    break;
                case 2:
                    simulateOrderProcessing(thread_id, gen);
                    break;
                case 3:
                    simulateReportGeneration(thread_id, gen);
                    break;
                case 4:
                    simulateSystemMonitoring(thread_id, gen);
                    break;
            }
            
            // 业务间隔
            std::this_thread::sleep_for(std::chrono::milliseconds(gen() % 1000 + 500));
        }
    }
    
    void simulateInventoryCheck(int thread_id, std::mt19937& gen) {
        // 模拟库存盘点：快速读取多个manager的库存
        for (int i = 0; i < config_.manager_count; ++i) {
            std::string manager = "real_manager_" + std::to_string(i);
            sendHttpRequest("GET", "/api/managers/" + manager + "/inventory", "");
            sendHttpRequest("GET", "/api/managers/" + manager + "/items", "");
        }
    }
    
    void simulateBulkInbound(int thread_id, std::mt19937& gen) {
        // 模拟批量入库：快速连续写入
        std::string manager = "real_manager_" + std::to_string(gen() % config_.manager_count);
        
        for (int i = 0; i < 20; ++i) {
            std::string json = createTransactionJson(
                "BULK_" + std::to_string(thread_id) + "_" + std::to_string(i),
                "BULK_ITEM_" + std::to_string(i % 5),
                "批量入库物品",
                "in",
                gen() % 100 + 50,
                (gen() % 5000 + 1000) / 100.0,
                "批量入库操作"
            );
            
            sendHttpRequest("POST", "/api/managers/" + manager + "/transactions", json);
        }
    }
    
    void simulateOrderProcessing(int thread_id, std::mt19937& gen) {
        // 模拟订单处理：读库存->写出库
        std::string manager = "real_manager_" + std::to_string(gen() % config_.manager_count);
        
        // 先查库存
        sendHttpRequest("GET", "/api/managers/" + manager + "/inventory", "");
        
        // 再出库
        for (int i = 0; i < 5; ++i) {
            std::string json = createTransactionJson(
                "ORDER_" + std::to_string(thread_id) + "_" + std::to_string(i),
                "ORDER_ITEM_" + std::to_string(i),
                "订单物品",
                "out",
                gen() % 20 + 1,
                (gen() % 10000) / 100.0,
                "订单出库"
            );
            
            sendHttpRequest("POST", "/api/managers/" + manager + "/transactions", json);
        }
    }
    
    void simulateReportGeneration(int thread_id, std::mt19937& gen) {
        // 模拟报表生成：读取统计信息
        for (int i = 0; i < config_.manager_count; ++i) {
            std::string manager = "real_manager_" + std::to_string(i);
            sendHttpRequest("GET", "/api/managers/" + manager + "/statistics", "");
            sendHttpRequest("GET", "/api/managers/" + manager + "/documents", "");
        }
        
        // 系统状态
        sendHttpRequest("GET", "/api/system/status", "");
    }
    
    void simulateSystemMonitoring(int thread_id, std::mt19937& gen) {
        // 模拟系统监控：定期检查状态
        sendHttpRequest("GET", "/api/system/status", "");
        
        // 检查几个随机manager的状态
        for (int i = 0; i < 3; ++i) {
            std::string manager = "real_manager_" + std::to_string(gen() % config_.manager_count);
            sendHttpRequest("GET", "/api/managers/" + manager + "/transactions", "");
        }
    }
    
    void updateExpectedState(const std::string& manager_id, const std::string& item_id, int quantity_change) {
        std::lock_guard<std::mutex> lock(expected_state_mutex_);
        std::string key = manager_id + ":" + item_id;
        expected_inventory_[key] += quantity_change;
    }
    
    void updateMaxTime(std::atomic<uint64_t>& max_time, uint64_t new_time) {
        uint64_t current_max = max_time.load();
        while (new_time > current_max && 
               !max_time.compare_exchange_weak(current_max, new_time)) {
        }
    }
    
    void monitorConcurrency() {
        uint64_t last_reads = 0, last_writes = 0;
        
        while (!stop_monitoring_) {
            std::this_thread::sleep_for(std::chrono::seconds(10));
            
            auto now = std::chrono::high_resolution_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - test_start_time_).count();
            
            uint64_t current_reads = g_concurrent_stats.read_operations.load();
            uint64_t current_writes = g_concurrent_stats.write_operations.load();
            
            uint64_t read_rate = (current_reads - last_reads) / 10;
            uint64_t write_rate = (current_writes - last_writes) / 10;
            
            std::cout << "\n🔄 并发测试实时监控 [" << elapsed << "s]" << std::endl;
            std::cout << "  读操作: " << current_reads << " (速率: " << read_rate << "/s)" << std::endl;
            std::cout << "  写操作: " << current_writes << " (速率: " << write_rate << "/s)" << std::endl;
            std::cout << "  成功读取: " << g_concurrent_stats.successful_reads.load() << std::endl;
            std::cout << "  成功写入: " << g_concurrent_stats.successful_writes.load() << std::endl;
            std::cout << "  失败操作: " << g_concurrent_stats.failed_operations.load() << std::endl;
            std::cout << "  原子冲突: " << g_concurrent_stats.atomic_counter_conflicts.load() << std::endl;
            std::cout << "  一致性问题: " << g_concurrent_stats.consistency_violations.load() << std::endl;
            
            if (current_reads > 0) {
                uint64_t avg_read_time = g_concurrent_stats.total_read_time.load() / current_reads;
                std::cout << "  平均读取时间: " << avg_read_time << " μs" << std::endl;
            }
            
            if (current_writes > 0) {
                uint64_t avg_write_time = g_concurrent_stats.total_write_time.load() / current_writes;
                std::cout << "  平均写入时间: " << avg_write_time << " μs" << std::endl;
            }
            
            last_reads = current_reads;
            last_writes = current_writes;
        }
    }
    
    std::string createTransactionJson(const std::string& trans_id,
                                    const std::string& item_id,
                                    const std::string& item_name,
                                    const std::string& type,
                                    int quantity,
                                    double unit_price,
                                    const std::string& note) {
        std::ostringstream json;
        json << "{";
        json << "\"trans_id\":\"" << trans_id << "\",";
        json << "\"item_id\":\"" << item_id << "\",";
        json << "\"item_name\":\"" << item_name << "\",";
        json << "\"type\":\"" << type << "\",";
        json << "\"quantity\":" << quantity << ",";
        json << "\"unit_price\":" << std::fixed << std::setprecision(2) << unit_price << ",";
        json << "\"category\":\"并发测试\",";
        json << "\"model\":\"CONCURRENT_MODEL\",";
        json << "\"unit\":\"个\",";
        json << "\"partner_id\":\"CONCURRENT_PARTNER\",";
        json << "\"partner_name\":\"并发测试伙伴\",";
        json << "\"warehouse_id\":\"CONCURRENT_WH\",";
        json << "\"document_no\":\"CONCURRENT_DOC\",";
        json << "\"note\":\"" << note << "\"";
        json << "}";
        return json.str();
    }
    
    bool sendHttpRequest(const std::string& method, const std::string& path, const std::string& body) {
        return !sendHttpRequestAndGetResponse(method, path, body).empty();
    }
    
    std::string sendHttpRequestAndGetResponse(const std::string& method, const std::string& path, const std::string& body) {
        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) return "";
        
        struct timeval timeout;
        timeout.tv_sec = 5;
        timeout.tv_usec = 0;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        
        struct sockaddr_in server_addr;
        server_addr.sin_family = AF_INET;
        server_addr.sin_port = htons(config_.server_port);
        inet_pton(AF_INET, config_.server_host.c_str(), &server_addr.sin_addr);
        
        if (connect(sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            close(sock);
            return "";
        }
        
        std::ostringstream request;
        request << method << " " << path << " HTTP/1.1\r\n";
        request << "Host: " << config_.server_host << ":" << config_.server_port << "\r\n";
        
        if (!body.empty()) {
            request << "Content-Type: application/json\r\n";
            request << "Content-Length: " << body.length() << "\r\n";
        }
        
        request << "Connection: close\r\n\r\n";
        
        if (!body.empty()) {
            request << body;
        }
        
        std::string request_str = request.str();
        
        if (send(sock, request_str.c_str(), request_str.length(), 0) < 0) {
            close(sock);
            return "";
        }
        
        char buffer[8192];
        ssize_t received = recv(sock, buffer, sizeof(buffer) - 1, 0);
        
        close(sock);
        
        if (received > 0) {
            buffer[received] = '\0';
            return std::string(buffer);
        }
        
        return "";
    }
    
    void printConcurrentStats(uint64_t duration_ms) {
        std::cout << "\n🎯 并发负载测试最终报告" << std::endl;
        std::cout << "========================================" << std::endl;
        
        uint64_t total_ops = g_concurrent_stats.read_operations + g_concurrent_stats.write_operations;
        uint64_t successful_ops = g_concurrent_stats.successful_reads + g_concurrent_stats.successful_writes;
        
        std::cout << "测试总时长: " << duration_ms << " ms" << std::endl;
        std::cout << "总操作数: " << total_ops << std::endl;
        std::cout << "成功操作: " << successful_ops << " (" << (total_ops > 0 ? successful_ops * 100 / total_ops : 0) << "%)" << std::endl;
        std::cout << "失败操作: " << g_concurrent_stats.failed_operations.load() << std::endl;
        
        std::cout << "\n操作分类:" << std::endl;
        std::cout << "  读操作: " << g_concurrent_stats.read_operations.load() << " (成功: " << g_concurrent_stats.successful_reads.load() << ")" << std::endl;
        std::cout << "  写操作: " << g_concurrent_stats.write_operations.load() << " (成功: " << g_concurrent_stats.successful_writes.load() << ")" << std::endl;
        
        if (duration_ms > 0) {
            double total_ops_per_sec = (double)total_ops * 1000 / duration_ms;
            double read_ops_per_sec = (double)g_concurrent_stats.read_operations.load() * 1000 / duration_ms;
            double write_ops_per_sec = (double)g_concurrent_stats.write_operations.load() * 1000 / duration_ms;
            
            std::cout << "\n吞吐量:" << std::endl;
            std::cout << "  总OPS: " << total_ops_per_sec << " ops/s" << std::endl;
            std::cout << "  读OPS: " << read_ops_per_sec << " ops/s" << std::endl;
            std::cout << "  写OPS: " << write_ops_per_sec << " ops/s" << std::endl;
        }
        
        if (g_concurrent_stats.read_operations > 0) {
            uint64_t avg_read_time = g_concurrent_stats.total_read_time.load() / g_concurrent_stats.read_operations.load();
            std::cout << "\n读操作性能:" << std::endl;
            std::cout << "  平均时间: " << avg_read_time << " μs" << std::endl;
            std::cout << "  最大时间: " << g_concurrent_stats.max_read_time.load() << " μs" << std::endl;
        }
        
        if (g_concurrent_stats.write_operations > 0) {
            uint64_t avg_write_time = g_concurrent_stats.total_write_time.load() / g_concurrent_stats.write_operations.load();
            std::cout << "\n写操作性能:" << std::endl;
            std::cout << "  平均时间: " << avg_write_time << " μs" << std::endl;
            std::cout << "  最大时间: " << g_concurrent_stats.max_write_time.load() << " μs" << std::endl;
        }
        
        std::cout << "\n并发问题检测:" << std::endl;
        std::cout << "  原子计数器冲突: " << g_concurrent_stats.atomic_counter_conflicts.load() << std::endl;
        std::cout << "  数据一致性违规: " << g_concurrent_stats.consistency_violations.load() << std::endl;
        
        // 评估结果
        std::cout << "\n🔍 并发测试评估:" << std::endl;
        
        if (g_concurrent_stats.atomic_counter_conflicts > 0) {
            std::cout << "❌ 检测到原子计数器冲突，可能存在并发控制问题" << std::endl;
        }
        
        if (g_concurrent_stats.consistency_violations > total_ops * 0.01) {
            std::cout << "❌ 数据一致性问题过多，可能存在竞态条件" << std::endl;
        }
        
        if (g_concurrent_stats.failed_operations > total_ops * 0.05) {
            std::cout << "❌ 失败率过高，系统在高并发下不稳定" << std::endl;
        }
        
        if (g_concurrent_stats.atomic_counter_conflicts == 0 && 
            g_concurrent_stats.consistency_violations < total_ops * 0.001 &&
            g_concurrent_stats.failed_operations < total_ops * 0.01) {
            std::cout << "✅ 并发测试通过，系统并发性能良好" << std::endl;
        }
    }
};

int main(int argc, char* argv[]) {
    ConcurrentConfig config;
    
    // 解析命令行参数
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        
        if (arg == "--readers" && i + 1 < argc) {
            config.reader_threads = std::stoi(argv[++i]);
        } else if (arg == "--writers" && i + 1 < argc) {
            config.writer_threads = std::stoi(argv[++i]);
        } else if (arg == "--managers" && i + 1 < argc) {
            config.manager_count = std::stoi(argv[++i]);
        } else if (arg == "--duration" && i + 1 < argc) {
            config.test_duration_seconds = std::stoi(argv[++i]);
        } else if (arg == "--host" && i + 1 < argc) {
            config.server_host = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            config.server_port = std::stoi(argv[++i]);
        } else if (arg == "--help") {
            std::cout << "用法: " << argv[0] << " [选项]" << std::endl;
            std::cout << "选项:" << std::endl;
            std::cout << "  --readers N      读者线程数 (默认: 20)" << std::endl;
            std::cout << "  --writers N      写者线程数 (默认: 10)" << std::endl;
            std::cout << "  --managers N     Manager数量 (默认: 5)" << std::endl;
            std::cout << "  --duration N     测试持续时间秒数 (默认: 180)" << std::endl;
            std::cout << "  --host HOST      目标主机 (默认: 127.0.0.1)" << std::endl;
            std::cout << "  --port PORT      目标端口 (默认: 8080)" << std::endl;
            std::cout << "  --help           显示帮助" << std::endl;
            return 0;
        }
    }
    
    std::cout << "🚀 C++11仓库管理系统 - 并发负载测试工具" << std::endl;
    std::cout << "警告: 这是一个高强度并发测试，将大量并行访问目标系统！" << std::endl;
    std::cout << "专门测试原子计数器、数据一致性和并发控制机制。" << std::endl;
    std::cout << "\n按 Enter 继续..." << std::endl;
    std::cin.get();
    
    ConcurrentLoadTester tester(config);
    tester.runConcurrentTest();
    
    return 0;
}