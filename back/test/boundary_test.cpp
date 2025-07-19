#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <climits>
#include <cfloat>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <cstring>
#include <random>
#include <iomanip>

class BoundaryTester {
public:
    BoundaryTester(const std::string& host = "127.0.0.1", int port = 8080) 
        : host_(host), port_(port) {}
    
    void runAllTests() {
        std::cout << "🔬 开始边界条件测试..." << std::endl;
        std::cout << "目标: " << host_ << ":" << port_ << std::endl;
        
        testIntegerBoundaries();
        testStringBoundaries();
        testJsonBoundaries();
        testHttpBoundaries();
        testBinaryProtocolBoundaries();
        testSpecialCharacters();
        testTimeAndDateBoundaries();
        testConcurrencyEdgeCases();
        
        std::cout << "\n📊 边界测试完成! 发现问题: " << issues_found_ << " 个" << std::endl;
    }
    
private:
    std::string host_;
    int port_;
    int issues_found_ = 0;
    
    void testIntegerBoundaries() {
        std::cout << "\n🔢 测试整数边界条件..." << std::endl;
        
        // 测试各种整数边界值
        std::vector<std::pair<std::string, long long>> test_values = {
            {"最小int32", INT32_MIN},
            {"最大int32", INT32_MAX},
            {"最小int64", LLONG_MIN},
            {"最大int64", LLONG_MAX},
            {"零值", 0},
            {"负一", -1},
            {"最大uint32", UINT32_MAX},
            {"溢出值", (long long)UINT32_MAX + 1},
            {"极大负数", -999999999999LL}
        };
        
        for (const auto& test : test_values) {
            std::cout << "  测试 " << test.first << ": " << test.second << std::endl;
            
            std::string json = createTransactionJson(
                "BOUNDARY_TEST",
                "ITEM_INT_" + test.first,
                "测试物品",
                "in",
                test.second,  // 可能溢出的数量
                99.99,
                "边界测试"
            );
            
            bool success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", json);
            if (!success) {
                std::cout << "    ❌ " << test.first << " 导致请求失败" << std::endl;
                issues_found_++;
            }
        }
        
        // 测试浮点数边界
        std::vector<std::pair<std::string, double>> float_tests = {
            {"最小float", FLT_MIN},
            {"最大float", FLT_MAX},
            {"NaN", std::numeric_limits<double>::quiet_NaN()},
            {"正无穷", std::numeric_limits<double>::infinity()},
            {"负无穷", -std::numeric_limits<double>::infinity()},
            {"极小正数", 1e-100},
            {"极大数", 1e100}
        };
        
        for (const auto& test : float_tests) {
            std::cout << "  测试浮点 " << test.first << ": " << test.second << std::endl;
            
            std::string json = createTransactionJson(
                "FLOAT_TEST",
                "ITEM_FLOAT",
                "浮点测试",
                "in",
                1,
                test.second,  // 边界浮点数
                "浮点边界测试"
            );
            
            bool success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", json);
            if (!success) {
                std::cout << "    ❌ 浮点 " << test.first << " 导致请求失败" << std::endl;
                issues_found_++;
            }
        }
    }
    
    void testStringBoundaries() {
        std::cout << "\n📝 测试字符串边界条件..." << std::endl;
        
        // 空字符串测试
        std::cout << "  测试空字符串..." << std::endl;
        std::string empty_json = createTransactionJson("", "", "", "in", 1, 1.0, "");
        sendHttpRequest("POST", "/api/managers//transactions", empty_json);
        
        // 超长字符串测试
        std::cout << "  测试超长字符串..." << std::endl;
        std::string mega_string(1024 * 1024, 'A');  // 1MB字符串
        std::string long_json = createTransactionJson(
            "LONG_TEST",
            mega_string,
            mega_string,
            "in",
            1,
            1.0,
            mega_string
        );
        
        bool long_success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", long_json);
        if (!long_success) {
            std::cout << "    ❌ 超长字符串导致请求失败" << std::endl;
            issues_found_++;
        }
        
        // 不同长度的字符串
        std::vector<int> lengths = {1, 10, 100, 1000, 10000, 100000};
        for (int len : lengths) {
            std::string test_str(len, 'X');
            std::string json = createTransactionJson(
                "LEN_" + std::to_string(len),
                test_str,
                "长度测试",
                "in",
                1,
                1.0,
                "长度" + std::to_string(len) + "测试"
            );
            
            bool success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", json);
            std::cout << "    长度 " << len << ": " << (success ? "✅" : "❌") << std::endl;
            if (!success) issues_found_++;
        }
    }
    
    void testJsonBoundaries() {
        std::cout << "\n🗂️ 测试JSON边界条件..." << std::endl;
        
        // 深度嵌套JSON
        std::cout << "  测试深度嵌套JSON..." << std::endl;
        std::string nested_json = "{";
        for (int i = 0; i < 1000; ++i) {
            nested_json += "\"level" + std::to_string(i) + "\":{";
        }
        nested_json += "\"value\":\"deep\"}";
        for (int i = 0; i < 1000; ++i) {
            nested_json += "}";
        }
        
        bool nested_success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", nested_json);
        if (!nested_success) {
            std::cout << "    ❌ 深度嵌套JSON导致失败" << std::endl;
            issues_found_++;
        }
        
        // 格式错误的JSON
        std::vector<std::string> malformed_jsons = {
            "{",  // 不完整
            "}",  // 只有结束
            "{\"key\":}",  // 缺少值
            "{\"key\":",  // 不完整
            "{\"key\":\"value\",}",  // 多余逗号
            "{'key':'value'}",  // 单引号
            "{\"key\":\"value\" \"key2\":\"value2\"}",  // 缺少逗号
            "null",  // 非对象
            "[]",    // 数组而非对象
            "",      // 空字符串
            "invalid json",  // 完全无效
            "{\"key\":NaN}",  // 无效值
            "{\"key\":undefined}",  // JavaScript特有
            "{\"key\":Infinity}",   // 无效值
        };
        
        std::cout << "  测试格式错误的JSON..." << std::endl;
        for (size_t i = 0; i < malformed_jsons.size(); ++i) {
            bool success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", malformed_jsons[i]);
            std::cout << "    格式错误" << i + 1 << ": " << (success ? "❌ 错误被接受!" : "✅ 正确拒绝") << std::endl;
            if (success) issues_found_++;  // 错误被接受是问题
        }
        
        // 巨大的JSON数组
        std::cout << "  测试巨大JSON数组..." << std::endl;
        std::ostringstream huge_array;
        huge_array << "{\"data\":[";
        for (int i = 0; i < 100000; ++i) {
            if (i > 0) huge_array << ",";
            huge_array << "\"item" << i << "\"";
        }
        huge_array << "]}";
        
        bool huge_success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", huge_array.str());
        if (!huge_success) {
            std::cout << "    ❌ 巨大JSON数组导致失败" << std::endl;
            issues_found_++;
        }
    }
    
    void testHttpBoundaries() {
        std::cout << "\n🌐 测试HTTP协议边界..." << std::endl;
        
        // 超长URL测试
        std::cout << "  测试超长URL..." << std::endl;
        std::string long_url = "/api/managers/";
        long_url.append(10000, 'A');  // 10KB的manager ID
        long_url += "/transactions";
        
        bool url_success = sendHttpRequest("GET", long_url, "");
        std::cout << "    超长URL: " << (url_success ? "✅" : "❌") << std::endl;
        if (!url_success) issues_found_++;
        
        // 超长HTTP头测试
        std::cout << "  测试超长HTTP头..." << std::endl;
        std::string huge_header(100000, 'X');
        bool header_success = sendHttpRequestWithCustomHeader("GET", "/api/system/status", "", "X-Custom-Header", huge_header);
        std::cout << "    超长头部: " << (header_success ? "✅" : "❌") << std::endl;
        if (!header_success) issues_found_++;
        
        // 无效HTTP方法
        std::vector<std::string> invalid_methods = {
            "INVALID", "HACK", "DELETE_ALL", "DROP", "SELECT", 
            "'; DROP TABLE;--", "GET POST", "G E T"
        };
        
        std::cout << "  测试无效HTTP方法..." << std::endl;
        for (const auto& method : invalid_methods) {
            bool success = sendHttpRequest(method, "/api/system/status", "");
            std::cout << "    方法 '" << method << "': " << (success ? "❌ 被接受!" : "✅ 正确拒绝") << std::endl;
            if (success) issues_found_++;
        }
        
        // 超大请求体
        std::cout << "  测试超大请求体..." << std::endl;
        std::string huge_body(10 * 1024 * 1024, 'D');  // 10MB
        bool body_success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", huge_body);
        std::cout << "    10MB请求体: " << (body_success ? "✅" : "❌") << std::endl;
        if (!body_success) issues_found_++;
    }
    
    void testBinaryProtocolBoundaries() {
        std::cout << "\n🔧 测试二进制协议边界..." << std::endl;
        
        // 测试各种二进制数据
        std::vector<std::pair<std::string, std::vector<uint8_t>>> binary_tests = {
            {"空数据", {}},
            {"单字节", {0x00}},
            {"全FF", std::vector<uint8_t>(1000, 0xFF)},
            {"全00", std::vector<uint8_t>(1000, 0x00)},
            {"随机数据", generateRandomBytes(10000)},
            {"巨大数据", std::vector<uint8_t>(1024 * 1024, 0xAA)}  // 1MB
        };
        
        for (const auto& test : binary_tests) {
            std::cout << "  测试 " << test.first << " (" << test.second.size() << " 字节)..." << std::endl;
            
            std::string binary_str(test.second.begin(), test.second.end());
            bool success = sendHttpRequestWithBinaryBody("POST", "/api/binary_test", binary_str);
            std::cout << "    " << test.first << ": " << (success ? "✅" : "❌") << std::endl;
            if (!success) issues_found_++;
        }
    }
    
    void testSpecialCharacters() {
        std::cout << "\n🎭 测试特殊字符..." << std::endl;
        
        // Unicode和特殊字符测试
        std::vector<std::pair<std::string, std::string>> special_chars = {
            {"NULL字节", std::string("test\0test", 9)},
            {"回车换行", "test\r\ntest"},
            {"制表符", "test\ttest"},
            {"中文", "测试中文字符"},
            {"日文", "テスト"},
            {"表情符号", "😀😁😂🤣😃😄"},
            {"控制字符", "\x01\x02\x03\x04\x05"},
            {"高位字符", "\x80\x81\x82\x83\x84"},
            {"UTF-8 BOM", "\xEF\xBB\xBFtest"},
            {"SQL注入", "'; DROP TABLE users; --"},
            {"XSS", "<script>alert('xss')</script>"},
            {"路径遍历", "../../../etc/passwd"},
            {"命令注入", "; cat /etc/passwd"},
            {"格式字符串", "%s%s%s%s%s%n"},
            {"JavaScript", "javascript:alert(1)"},
            {"文件协议", "file:///etc/passwd"}
        };
        
        for (const auto& test : special_chars) {
            std::cout << "  测试 " << test.first << "..." << std::endl;
            
            std::string json = createTransactionJson(
                "SPECIAL_" + test.first,
                test.second,
                test.second,
                "in",
                1,
                1.0,
                test.second
            );
            
            bool success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", json);
            std::cout << "    " << test.first << ": " << (success ? "✅" : "❌") << std::endl;
            if (!success) issues_found_++;
        }
    }
    
    void testTimeAndDateBoundaries() {
        std::cout << "\n⏰ 测试时间日期边界..." << std::endl;
        
        std::vector<std::pair<std::string, std::string>> time_tests = {
            {"Unix纪元", "1970-01-01T00:00:00Z"},
            {"Y2K", "2000-01-01T00:00:00Z"},
            {"Y2038问题", "2038-01-19T03:14:07Z"},
            {"未来时间", "2099-12-31T23:59:59Z"},
            {"无效日期", "2021-02-29T00:00:00Z"},  // 2021不是闰年
            {"无效时间", "25:99:99"},
            {"空时间", ""},
            {"格式错误", "not-a-date"},
            {"超长时间", std::string(1000, '2') + "-01-01T00:00:00Z"}
        };
        
        for (const auto& test : time_tests) {
            std::cout << "  测试时间 " << test.first << "..." << std::endl;
            
            std::ostringstream json;
            json << "{";
            json << "\"trans_id\":\"TIME_TEST\",";
            json << "\"item_id\":\"TIME_ITEM\",";
            json << "\"item_name\":\"时间测试\",";
            json << "\"type\":\"in\",";
            json << "\"quantity\":1,";
            json << "\"timestamp\":\"" << escapeJson(test.second) << "\",";
            json << "\"note\":\"时间边界测试\"";
            json << "}";
            
            bool success = sendHttpRequest("POST", "/api/managers/boundary_test/transactions", json.str());
            std::cout << "    " << test.first << ": " << (success ? "✅" : "❌") << std::endl;
            if (!success) issues_found_++;
        }
    }
    
    void testConcurrencyEdgeCases() {
        std::cout << "\n🔄 测试并发边界情况..." << std::endl;
        
        // 快速连续请求
        std::cout << "  测试快速连续请求..." << std::endl;
        int rapid_requests = 0;
        for (int i = 0; i < 100; ++i) {
            std::string json = createTransactionJson(
                "RAPID_" + std::to_string(i),
                "RAPID_ITEM",
                "快速请求",
                "in",
                1,
                1.0,
                "快速连续请求测试"
            );
            
            if (sendHttpRequest("POST", "/api/managers/concurrent_test/transactions", json)) {
                rapid_requests++;
            }
        }
        std::cout << "    快速请求成功率: " << rapid_requests << "/100" << std::endl;
        
        // 相同ID的并发请求（测试竞态条件）
        std::cout << "  测试相同ID并发冲突..." << std::endl;
        std::vector<std::thread> threads;
        std::atomic<int> conflicts(0);
        
        for (int i = 0; i < 10; ++i) {
            threads.emplace_back([this, &conflicts]() {
                std::string json = createTransactionJson(
                    "CONFLICT_ID",  // 相同的ID
                    "CONFLICT_ITEM",
                    "冲突测试",
                    "in",
                    1,
                    1.0,
                    "ID冲突测试"
                );
                
                if (sendHttpRequest("POST", "/api/managers/conflict_test/transactions", json)) {
                    conflicts++;
                }
            });
        }
        
        for (auto& t : threads) {
            t.join();
        }
        
        std::cout << "    ID冲突处理: " << conflicts.load() << "/10 成功" << std::endl;
        if (conflicts.load() > 1) {
            std::cout << "    ❌ 检测到重复ID被接受，可能存在竞态条件!" << std::endl;
            issues_found_++;
        }
    }
    
    std::string createTransactionJson(const std::string& trans_id,
                                    const std::string& item_id,
                                    const std::string& item_name,
                                    const std::string& type,
                                    long long quantity,
                                    double unit_price,
                                    const std::string& note) {
        std::ostringstream json;
        json << "{";
        json << "\"trans_id\":\"" << escapeJson(trans_id) << "\",";
        json << "\"item_id\":\"" << escapeJson(item_id) << "\",";
        json << "\"item_name\":\"" << escapeJson(item_name) << "\",";
        json << "\"type\":\"" << escapeJson(type) << "\",";
        json << "\"quantity\":" << quantity << ",";
        json << "\"unit_price\":" << std::fixed << std::setprecision(2) << unit_price << ",";
        json << "\"category\":\"边界测试\",";
        json << "\"model\":\"BOUNDARY_MODEL\",";
        json << "\"unit\":\"个\",";
        json << "\"partner_id\":\"BOUNDARY_PARTNER\",";
        json << "\"partner_name\":\"边界测试伙伴\",";
        json << "\"warehouse_id\":\"BOUNDARY_WH\",";
        json << "\"document_no\":\"BOUNDARY_DOC\",";
        json << "\"note\":\"" << escapeJson(note) << "\"";
        json << "}";
        return json.str();
    }
    
    std::string escapeJson(const std::string& str) {
        std::string result;
        for (char c : str) {
            switch (c) {
                case '"': result += "\\\""; break;
                case '\\': result += "\\\\"; break;
                case '\b': result += "\\b"; break;
                case '\f': result += "\\f"; break;
                case '\n': result += "\\n"; break;
                case '\r': result += "\\r"; break;
                case '\t': result += "\\t"; break;
                default:
                    if (c < 0x20) {
                        result += "\\u00";
                        result += "0123456789abcdef"[c >> 4];
                        result += "0123456789abcdef"[c & 0xf];
                    } else {
                        result += c;
                    }
                    break;
            }
        }
        return result;
    }
    
    std::vector<uint8_t> generateRandomBytes(size_t size) {
        std::vector<uint8_t> data(size);
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> dis(0, 255);
        
        for (size_t i = 0; i < size; ++i) {
            data[i] = static_cast<uint8_t>(dis(gen));
        }
        
        return data;
    }
    
    bool sendHttpRequest(const std::string& method, const std::string& path, const std::string& body) {
        return sendHttpRequestWithCustomHeader(method, path, body, "", "");
    }
    
    bool sendHttpRequestWithBinaryBody(const std::string& method, const std::string& path, const std::string& body) {
        return sendHttpRequestWithCustomHeader(method, path, body, "Content-Type", "application/octet-stream");
    }
    
    bool sendHttpRequestWithCustomHeader(const std::string& method, const std::string& path, const std::string& body,
                                        const std::string& header_name, const std::string& header_value) {
        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) return false;
        
        // 设置短超时以快速检测问题
        struct timeval timeout;
        timeout.tv_sec = 10;
        timeout.tv_usec = 0;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        
        struct sockaddr_in server_addr;
        server_addr.sin_family = AF_INET;
        server_addr.sin_port = htons(port_);
        inet_pton(AF_INET, host_.c_str(), &server_addr.sin_addr);
        
        if (connect(sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            close(sock);
            return false;
        }
        
        // 构造HTTP请求
        std::ostringstream request;
        request << method << " " << path << " HTTP/1.1\r\n";
        request << "Host: " << host_ << ":" << port_ << "\r\n";
        
        if (!header_name.empty()) {
            request << header_name << ": " << header_value << "\r\n";
        }
        
        if (!body.empty()) {
            if (header_name != "Content-Type") {
                request << "Content-Type: application/json\r\n";
            }
            request << "Content-Length: " << body.length() << "\r\n";
        }
        
        request << "Connection: close\r\n";
        request << "\r\n";
        
        if (!body.empty()) {
            request << body;
        }
        
        std::string request_str = request.str();
        
        // 发送请求
        ssize_t sent = send(sock, request_str.c_str(), request_str.length(), 0);
        if (sent < 0) {
            close(sock);
            return false;
        }
        
        // 接收响应
        char buffer[4096];
        ssize_t received = recv(sock, buffer, sizeof(buffer) - 1, 0);
        
        close(sock);
        
        if (received > 0) {
            buffer[received] = '\0';
            // 检查是否是HTTP响应
            return std::string(buffer).find("HTTP/") == 0;
        }
        
        return false;
    }
};

int main(int argc, char* argv[]) {
    std::string host = "127.0.0.1";
    int port = 8080;
    
    // 解析命令行参数
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        
        if (arg == "--host" && i + 1 < argc) {
            host = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        } else if (arg == "--help") {
            std::cout << "用法: " << argv[0] << " [选项]" << std::endl;
            std::cout << "选项:" << std::endl;
            std::cout << "  --host HOST      目标主机 (默认: 127.0.0.1)" << std::endl;
            std::cout << "  --port PORT      目标端口 (默认: 8080)" << std::endl;
            std::cout << "  --help           显示帮助" << std::endl;
            return 0;
        }
    }
    
    std::cout << "🧪 C++11仓库管理系统 - 边界条件测试工具" << std::endl;
    std::cout << "警告: 这个工具将发送各种极端和异常的输入来测试系统的边界处理!" << std::endl;
    std::cout << "请确保在测试环境中运行。" << std::endl;
    std::cout << "\n按 Enter 继续..." << std::endl;
    std::cin.get();
    
    BoundaryTester tester(host, port);
    tester.runAllTests();
    
    return 0;
}