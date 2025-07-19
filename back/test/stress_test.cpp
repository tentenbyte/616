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
#include <fstream>

// 压力测试配置
struct StressConfig {
    std::string server_host = "127.0.0.1";
    int server_port = 8080;
    int num_threads = 100;
    int requests_per_thread = 1000;
    int test_duration_seconds = 300; // 5分钟
    bool enable_memory_monitoring = true;
    bool enable_json_test = true;
    bool enable_binary_test = true;
    int max_transaction_size = 10000;
};

// 统计信息
struct StressStats {
    std::atomic<uint64_t> total_requests{0};
    std::atomic<uint64_t> successful_requests{0};
    std::atomic<uint64_t> failed_requests{0};
    std::atomic<uint64_t> timeout_requests{0};
    std::atomic<uint64_t> connection_errors{0};
    std::atomic<uint64_t> total_bytes_sent{0};
    std::atomic<uint64_t> total_bytes_received{0};
    
    std::atomic<uint64_t> min_response_time{UINT64_MAX};
    std::atomic<uint64_t> max_response_time{0};
    std::atomic<uint64_t> total_response_time{0};
    
    std::mutex response_times_mutex;
    std::vector<uint64_t> response_times;
} g_stats;

class StressTester {
public:
    StressTester(const StressConfig& config) : config_(config) {}
    
    void runStressTest() {
        std::cout << "🔥 启动压力测试..." << std::endl;
        std::cout << "目标服务器: " << config_.server_host << ":" << config_.server_port << std::endl;
        std::cout << "并发线程数: " << config_.num_threads << std::endl;
        std::cout << "每线程请求数: " << config_.requests_per_thread << std::endl;
        std::cout << "测试持续时间: " << config_.test_duration_seconds << " 秒" << std::endl;
        
        auto start_time = std::chrono::high_resolution_clock::now();
        
        // 启动监控线程
        std::thread monitor_thread(&StressTester::monitorProgress, this, start_time);
        
        // 启动内存监控线程
        std::thread memory_thread;
        if (config_.enable_memory_monitoring) {
            memory_thread = std::thread(&StressTester::monitorMemory, this);
        }
        
        // 启动压力测试线程
        std::vector<std::thread> worker_threads;
        for (int i = 0; i < config_.num_threads; ++i) {
            worker_threads.emplace_back(&StressTester::workerThread, this, i);
        }
        
        // 等待所有工作线程完成
        for (auto& t : worker_threads) {
            t.join();
        }
        
        auto end_time = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
        
        // 停止监控线程
        stop_monitoring_ = true;
        if (monitor_thread.joinable()) monitor_thread.join();
        if (memory_thread.joinable()) memory_thread.join();
        
        // 输出最终统计
        printFinalStats(duration.count());
    }
    
private:
    StressConfig config_;
    std::atomic<bool> stop_monitoring_{false};
    
    void workerThread(int thread_id) {
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> manager_dis(1, 100);
        std::uniform_int_distribution<> quantity_dis(1, 1000);
        std::uniform_real_distribution<> price_dis(1.0, 100.0);
        
        for (int i = 0; i < config_.requests_per_thread; ++i) {
            auto start = std::chrono::high_resolution_clock::now();
            
            bool success = false;
            if (config_.enable_json_test && i % 2 == 0) {
                success = sendJsonRequest(thread_id, i, gen, manager_dis, quantity_dis, price_dis);
            } else if (config_.enable_binary_test) {
                success = sendBinaryRequest(thread_id, i, gen);
            }
            
            auto end = std::chrono::high_resolution_clock::now();
            auto response_time = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();
            
            // 更新统计
            g_stats.total_requests++;
            if (success) {
                g_stats.successful_requests++;
            } else {
                g_stats.failed_requests++;
            }
            
            updateResponseTimeStats(response_time);
            
            // 记录响应时间（采样）
            if (i % 100 == 0) {
                std::lock_guard<std::mutex> lock(g_stats.response_times_mutex);
                g_stats.response_times.push_back(response_time);
            }
        }
    }
    
    bool sendJsonRequest(int thread_id, int request_id, std::mt19937& gen,
                        std::uniform_int_distribution<>& manager_dis,
                        std::uniform_int_distribution<>& quantity_dis,
                        std::uniform_real_distribution<>& price_dis) {
        
        std::string manager_id = "stress_manager_" + std::to_string(manager_dis(gen));
        
        // 构造巨大的JSON请求（压力测试）
        std::ostringstream json;
        json << "{";
        json << "\"trans_id\":\"STRESS_" << thread_id << "_" << request_id << "\",";
        json << "\"item_id\":\"STRESS_ITEM_" << request_id << "\",";
        json << "\"item_name\":\"";
        
        // 添加大量数据以增加压力
        for (int i = 0; i < 100; ++i) {
            json << "STRESS_TEST_ITEM_WITH_VERY_LONG_NAME_" << i << "_";
        }
        json << "\",";
        
        json << "\"type\":\"in\",";
        json << "\"quantity\":" << quantity_dis(gen) << ",";
        json << "\"unit_price\":" << price_dis(gen) << ",";
        json << "\"category\":\"STRESS_CATEGORY\",";
        json << "\"model\":\"STRESS_MODEL_" << request_id << "\",";
        json << "\"unit\":\"个\",";
        json << "\"partner_id\":\"STRESS_PARTNER_" << (request_id % 10) << "\",";
        json << "\"partner_name\":\"压力测试供应商\",";
        json << "\"warehouse_id\":\"WH_STRESS_" << (request_id % 5) << "\",";
        json << "\"document_no\":\"DOC_STRESS_" << request_id << "\",";
        json << "\"note\":\"压力测试数据 - 线程" << thread_id << " 请求" << request_id << "\"";
        json << "}";
        
        std::string json_data = json.str();
        
        // 构造HTTP请求
        std::ostringstream http_request;
        http_request << "POST /api/managers/" << manager_id << "/transactions HTTP/1.1\r\n";
        http_request << "Host: " << config_.server_host << ":" << config_.server_port << "\r\n";
        http_request << "Content-Type: application/json\r\n";
        http_request << "Content-Length: " << json_data.length() << "\r\n";
        http_request << "Connection: close\r\n";
        http_request << "\r\n";
        http_request << json_data;
        
        std::string request = http_request.str();
        
        return sendHttpRequest(request);
    }
    
    bool sendBinaryRequest(int thread_id, int request_id, std::mt19937& gen) {
        // 构造大量uint32数据进行二进制协议压力测试
        std::vector<uint32_t> uint32_data;
        uint32_data.reserve(config_.max_transaction_size);
        
        std::uniform_int_distribution<uint32_t> uint32_dis(1, UINT32_MAX);
        for (int i = 0; i < config_.max_transaction_size; ++i) {
            uint32_data.push_back(uint32_dis(gen));
        }
        
        // 简化的二进制协议构造（这里只是压力测试，不需要完整实现）
        std::string binary_data;
        binary_data.reserve(uint32_data.size() * 4 + 100);
        
        // 添加随机二进制数据
        for (auto value : uint32_data) {
            binary_data.append(reinterpret_cast<char*>(&value), sizeof(value));
        }
        
        // 构造HTTP请求包装二进制数据
        std::ostringstream http_request;
        http_request << "POST /api/binary_test HTTP/1.1\r\n";
        http_request << "Host: " << config_.server_host << ":" << config_.server_port << "\r\n";
        http_request << "Content-Type: application/octet-stream\r\n";
        http_request << "Content-Length: " << binary_data.length() << "\r\n";
        http_request << "Connection: close\r\n";
        http_request << "\r\n";
        http_request << binary_data;
        
        std::string request = http_request.str();
        
        return sendHttpRequest(request);
    }
    
    bool sendHttpRequest(const std::string& request) {
        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) {
            g_stats.connection_errors++;
            return false;
        }
        
        // 设置超时
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
            g_stats.connection_errors++;
            return false;
        }
        
        // 发送请求
        ssize_t sent = send(sock, request.c_str(), request.length(), 0);
        if (sent < 0) {
            close(sock);
            g_stats.failed_requests++;
            return false;
        }
        
        g_stats.total_bytes_sent += sent;
        
        // 接收响应
        char buffer[4096];
        ssize_t received = recv(sock, buffer, sizeof(buffer) - 1, 0);
        if (received > 0) {
            g_stats.total_bytes_received += received;
        }
        
        close(sock);
        return received > 0;
    }
    
    void updateResponseTimeStats(uint64_t response_time) {
        // 更新最小响应时间
        uint64_t current_min = g_stats.min_response_time.load();
        while (response_time < current_min && 
               !g_stats.min_response_time.compare_exchange_weak(current_min, response_time)) {
        }
        
        // 更新最大响应时间
        uint64_t current_max = g_stats.max_response_time.load();
        while (response_time > current_max && 
               !g_stats.max_response_time.compare_exchange_weak(current_max, response_time)) {
        }
        
        g_stats.total_response_time += response_time;
    }
    
    void monitorProgress(std::chrono::high_resolution_clock::time_point start_time) {
        uint64_t last_requests = 0;
        
        while (!stop_monitoring_) {
            std::this_thread::sleep_for(std::chrono::seconds(5));
            
            auto now = std::chrono::high_resolution_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time).count();
            
            uint64_t current_requests = g_stats.total_requests.load();
            uint64_t requests_per_sec = (current_requests - last_requests) / 5;
            last_requests = current_requests;
            
            std::cout << "\n📊 实时统计 [" << elapsed << "s]" << std::endl;
            std::cout << "  总请求数: " << current_requests << std::endl;
            std::cout << "  成功请求: " << g_stats.successful_requests.load() << std::endl;
            std::cout << "  失败请求: " << g_stats.failed_requests.load() << std::endl;
            std::cout << "  连接错误: " << g_stats.connection_errors.load() << std::endl;
            std::cout << "  QPS: " << requests_per_sec << " req/s" << std::endl;
            std::cout << "  发送数据: " << g_stats.total_bytes_sent.load() / 1024 << " KB" << std::endl;
            std::cout << "  接收数据: " << g_stats.total_bytes_received.load() / 1024 << " KB" << std::endl;
            
            if (g_stats.total_requests > 0) {
                uint64_t avg_time = g_stats.total_response_time.load() / g_stats.total_requests.load();
                std::cout << "  平均响应时间: " << avg_time << " μs" << std::endl;
                std::cout << "  最小响应时间: " << g_stats.min_response_time.load() << " μs" << std::endl;
                std::cout << "  最大响应时间: " << g_stats.max_response_time.load() << " μs" << std::endl;
            }
        }
    }
    
    void monitorMemory() {
        std::ofstream memory_log("stress_memory.log");
        
        while (!stop_monitoring_) {
            std::this_thread::sleep_for(std::chrono::seconds(10));
            
            // 读取内存使用情况
            std::ifstream status("/proc/self/status");
            std::string line;
            
            while (std::getline(status, line)) {
                if (line.substr(0, 6) == "VmRSS:") {
                    auto now = std::chrono::system_clock::now();
                    auto time_t = std::chrono::system_clock::to_time_t(now);
                    
                    memory_log << time_t << " " << line << std::endl;
                    break;
                }
            }
        }
    }
    
    void printFinalStats(uint64_t duration_ms) {
        std::cout << "\n🎯 最终压力测试报告" << std::endl;
        std::cout << "================================" << std::endl;
        
        uint64_t total = g_stats.total_requests.load();
        uint64_t success = g_stats.successful_requests.load();
        uint64_t failed = g_stats.failed_requests.load();
        
        std::cout << "总测试时间: " << duration_ms << " ms" << std::endl;
        std::cout << "总请求数: " << total << std::endl;
        std::cout << "成功请求: " << success << " (" << (total > 0 ? success * 100 / total : 0) << "%)" << std::endl;
        std::cout << "失败请求: " << failed << " (" << (total > 0 ? failed * 100 / total : 0) << "%)" << std::endl;
        std::cout << "连接错误: " << g_stats.connection_errors.load() << std::endl;
        
        if (duration_ms > 0) {
            double qps = (double)total * 1000 / duration_ms;
            std::cout << "平均QPS: " << qps << " req/s" << std::endl;
        }
        
        std::cout << "数据传输: " << std::endl;
        std::cout << "  发送: " << g_stats.total_bytes_sent.load() / 1024 << " KB" << std::endl;
        std::cout << "  接收: " << g_stats.total_bytes_received.load() / 1024 << " KB" << std::endl;
        
        if (total > 0) {
            uint64_t avg_time = g_stats.total_response_time.load() / total;
            std::cout << "响应时间统计:" << std::endl;
            std::cout << "  平均: " << avg_time << " μs" << std::endl;
            std::cout << "  最小: " << g_stats.min_response_time.load() << " μs" << std::endl;
            std::cout << "  最大: " << g_stats.max_response_time.load() << " μs" << std::endl;
            
            // 计算百分位数
            std::lock_guard<std::mutex> lock(g_stats.response_times_mutex);
            if (!g_stats.response_times.empty()) {
                std::sort(g_stats.response_times.begin(), g_stats.response_times.end());
                size_t size = g_stats.response_times.size();
                
                std::cout << "  P50: " << g_stats.response_times[size * 50 / 100] << " μs" << std::endl;
                std::cout << "  P90: " << g_stats.response_times[size * 90 / 100] << " μs" << std::endl;
                std::cout << "  P95: " << g_stats.response_times[size * 95 / 100] << " μs" << std::endl;
                std::cout << "  P99: " << g_stats.response_times[size * 99 / 100] << " μs" << std::endl;
            }
        }
        
        // 判断压力测试结果
        std::cout << "\n🔍 压力测试评估:" << std::endl;
        
        if (failed > total * 0.1) {
            std::cout << "❌ 高失败率警告: " << (failed * 100 / total) << "% 失败率过高！" << std::endl;
        }
        
        if (g_stats.connection_errors > total * 0.05) {
            std::cout << "❌ 连接问题警告: 连接错误过多，服务器可能无法处理高并发" << std::endl;
        }
        
        if (g_stats.max_response_time > 10000000) { // 10秒
            std::cout << "❌ 响应时间警告: 最大响应时间超过10秒" << std::endl;
        }
        
        if (success > total * 0.95 && g_stats.max_response_time < 1000000) { // 1秒
            std::cout << "✅ 压力测试通过: 系统表现良好" << std::endl;
        }
    }
};

int main(int argc, char* argv[]) {
    StressConfig config;
    
    // 解析命令行参数
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        
        if (arg == "--threads" && i + 1 < argc) {
            config.num_threads = std::stoi(argv[++i]);
        } else if (arg == "--requests" && i + 1 < argc) {
            config.requests_per_thread = std::stoi(argv[++i]);
        } else if (arg == "--duration" && i + 1 < argc) {
            config.test_duration_seconds = std::stoi(argv[++i]);
        } else if (arg == "--host" && i + 1 < argc) {
            config.server_host = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            config.server_port = std::stoi(argv[++i]);
        } else if (arg == "--size" && i + 1 < argc) {
            config.max_transaction_size = std::stoi(argv[++i]);
        } else if (arg == "--help") {
            std::cout << "用法: " << argv[0] << " [选项]" << std::endl;
            std::cout << "选项:" << std::endl;
            std::cout << "  --threads N      并发线程数 (默认: 100)" << std::endl;
            std::cout << "  --requests N     每线程请求数 (默认: 1000)" << std::endl;
            std::cout << "  --duration N     测试持续时间秒数 (默认: 300)" << std::endl;
            std::cout << "  --host HOST      目标主机 (默认: 127.0.0.1)" << std::endl;
            std::cout << "  --port PORT      目标端口 (默认: 8080)" << std::endl;
            std::cout << "  --size N         数据包大小 (默认: 10000)" << std::endl;
            std::cout << "  --help           显示帮助" << std::endl;
            return 0;
        }
    }
    
    std::cout << "🚀 C++11仓库管理系统 - 压力测试工具" << std::endl;
    std::cout << "警告: 这是一个高强度压力测试，可能对目标系统造成重负载！" << std::endl;
    std::cout << "请确保在测试环境中运行，并已获得适当授权。" << std::endl;
    std::cout << "\n按 Enter 继续..." << std::endl;
    std::cin.get();
    
    StressTester tester(config);
    tester.runStressTest();
    
    return 0;
}