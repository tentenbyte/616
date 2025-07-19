#include "http_server.h"
#include "logger.h"
#include "error_handling.h"
#include "monitoring.h"
#include <iostream>
#include <sstream>
#include <thread>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>
#include <algorithm>
#include <regex>
#include <iomanip>

HttpServer::HttpServer(int port, std::shared_ptr<MemoryDatabase> db)
    : port_(port), running_(false), db_(db) {
    LOG_INFO("HttpServer", "constructor", "HTTP Server initialized on port " + std::to_string(port));
}

HttpServer::~HttpServer() {
    if (running_) {
        stop();
    }
}

bool HttpServer::start() {
    if (running_) {
        LOG_WARNING("HttpServer", "start", "Server is already running");
        return false;
    }
    
    LOG_INFO("HttpServer", "start", "Starting HTTP server on port " + std::to_string(port_));
    
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == -1) {
        LOG_ERROR("HttpServer", "start", "Failed to create socket: " + std::string(strerror(errno)));
        return false;
    }
    
    // 设置socket选项，允许地址重用
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        LOG_WARNING("HttpServer", "start", "Failed to set SO_REUSEADDR: " + std::string(strerror(errno)));
    }
    
    struct sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(port_);
    
    if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
        LOG_ERROR("HttpServer", "start", "Failed to bind socket: " + std::string(strerror(errno)));
        close(server_fd);
        return false;
    }
    
    if (listen(server_fd, 10) < 0) {
        LOG_ERROR("HttpServer", "start", "Failed to listen on socket: " + std::string(strerror(errno)));
        close(server_fd);
        return false;
    }
    
    running_ = true;
    LOG_INFO("HttpServer", "start", "HTTP server started successfully");
    
    // 服务器主循环
    std::thread server_thread([this, server_fd]() {
        while (running_) {
            struct sockaddr_in client_address;
            socklen_t client_len = sizeof(client_address);
            
            int client_socket = accept(server_fd, (struct sockaddr*)&client_address, &client_len);
            if (client_socket < 0) {
                if (running_) {
                    LOG_ERROR("HttpServer", "accept", "Failed to accept connection: " + std::string(strerror(errno)));
                }
                continue;
            }
            
            // 处理客户端请求（在新线程中）
            std::thread client_thread([this, client_socket]() {
                TIMER("http_request_duration");
                
                char buffer[4096] = {0};
                ssize_t bytes_read = read(client_socket, buffer, 4095);
                
                if (bytes_read > 0) {
                    std::string request(buffer, bytes_read);
                    
                    // 解析HTTP请求
                    std::istringstream request_stream(request);
                    std::string method, path, version;
                    request_stream >> method >> path >> version;
                    
                    LOG_DEBUG("HttpServer", "handleRequest", method + " " + path);
                    
                    // 提取请求体
                    std::string body;
                    size_t body_start = request.find("\r\n\r\n");
                    if (body_start != std::string::npos) {
                        body = request.substr(body_start + 4);
                    }
                    
                    auto start_time = std::chrono::high_resolution_clock::now();
                    
                    // 处理请求
                    std::string response = handleRequest(method, path, body);
                    
                    auto end_time = std::chrono::high_resolution_clock::now();
                    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time);
                    double duration_ms = duration.count() / 1000.0;
                    
                    // 记录HTTP请求指标
                    int status_code = 200;  // 简化：从response中提取真实状态码
                    if (response.find("400") != std::string::npos) status_code = 400;
                    else if (response.find("404") != std::string::npos) status_code = 404;
                    else if (response.find("500") != std::string::npos) status_code = 500;
                    
                    RECORD_HTTP_REQUEST(method, path, status_code, duration_ms);
                    
                    // 发送响应
                    send(client_socket, response.c_str(), response.length(), 0);
                    
                    LOG_DEBUG("HttpServer", "response", "Sent response (" + std::to_string(response.length()) + " bytes)");
                }
                
                close(client_socket);
            });
            client_thread.detach();
        }
        
        close(server_fd);
    });
    server_thread.detach();
    
    return true;
}

void HttpServer::stop() {
    if (running_) {
        running_ = false;
        LOG_INFO("HttpServer", "stop", "HTTP server stopped");
    }
}

bool HttpServer::isRunning() const {
    return running_;
}

std::string HttpServer::handleRequest(const std::string& method, const std::string& path, const std::string& body) {
    try {
        // CORS 头部
        std::string cors_headers = 
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type, Authorization\r\n";
        
        // 处理 OPTIONS 请求（CORS 预检）
        if (method == "OPTIONS") {
            return "HTTP/1.1 200 OK\r\n" + cors_headers + "\r\n";
        }
        
        // API路由解析
        std::regex api_pattern(R"(/api/managers/([^/]+)/([^/\?]+))");
        std::regex system_pattern(R"(/api/system/([^/\?]+))");
        std::smatch matches;
        
        if (std::regex_match(path, matches, api_pattern)) {
            std::string manager_id = urlDecode(matches[1].str());
            std::string endpoint = matches[2].str();
            
            if (method == "GET") {
                if (endpoint == "transactions") {
                    return createHttpResponse(handleGetTransactions(manager_id), "application/json", 200, cors_headers);
                } else if (endpoint == "inventory") {
                    return createHttpResponse(handleGetInventory(manager_id), "application/json", 200, cors_headers);
                } else if (endpoint == "items") {
                    return createHttpResponse(handleGetItems(manager_id), "application/json", 200, cors_headers);
                } else if (endpoint == "documents") {
                    return createHttpResponse(handleGetDocuments(manager_id), "application/json", 200, cors_headers);
                } else if (endpoint == "statistics") {
                    return createHttpResponse(handleGetStatistics(manager_id), "application/json", 200, cors_headers);
                }
            } else if (method == "POST" && endpoint == "transactions") {
                return createHttpResponse(handlePostTransaction(manager_id, body), "application/json", 201, cors_headers);
            }
        } else if (std::regex_match(path, matches, system_pattern)) {
            std::string endpoint = matches[1].str();
            
            if (method == "GET" && endpoint == "status") {
                auto status = db_->getSystemStatus();
                std::string json = "{\"status\":\"healthy\",\"managers\":" + std::to_string(status.total_managers) +
                                 ",\"transactions\":" + std::to_string(status.total_transactions) +
                                 ",\"memory_kb\":" + std::to_string(status.memory_usage_kb) +
                                 ",\"timestamp\":\"" + getCurrentTimestamp() + "\"}";
                return createHttpResponse(json, "application/json", 200, cors_headers);
            }
        }
        
        // 404 Not Found
        return createErrorResponse("Endpoint not found", 404, cors_headers);
        
    } catch (const std::exception& e) {
        LOG_ERROR("HttpServer", "handleRequest", "Exception: " + std::string(e.what()));
        return createErrorResponse("Internal server error", 500);
    }
}

std::string HttpServer::handleGetTransactions(const std::string& manager_id) {
    auto transactions = db_->getTransactions(manager_id);
    
    std::ostringstream json;
    json << "{\"manager_id\":\"" << escapeJson(manager_id) << "\",\"transactions\":[";
    
    for (size_t i = 0; i < transactions.size(); ++i) {
        if (i > 0) json << ",";
        json << transactionToJson(transactions[i]);
    }
    
    json << "],\"count\":" << transactions.size() << "}";
    return json.str();
}

std::string HttpServer::handlePostTransaction(const std::string& manager_id, const std::string& body) {
    try {
        TransactionRecord trans = jsonToTransaction(body);
        trans.manager_id = manager_id;
        
        // 如果没有transaction_id，自动生成
        if (trans.trans_id.empty()) {
            trans.trans_id = db_->generateTransactionId();
        }
        
        // 如果没有时间戳，使用当前时间
        if (trans.timestamp.empty()) {
            trans.timestamp = getCurrentTimestamp();
        }
        
        auto result = db_->appendTransaction(manager_id, trans);
        
        if (result.isSuccess()) {
            std::string json = "{\"success\":true,\"transaction_id\":\"" + escapeJson(trans.trans_id) + "\"}";
            return json;
        } else {
            return "{\"success\":false,\"error\":\"" + escapeJson(result.getErrorMessage()) + "\"}";
        }
        
    } catch (const std::exception& e) {
        LOG_ERROR("HttpServer", "handlePostTransaction", "Exception: " + std::string(e.what()));
        return "{\"success\":false,\"error\":\"Invalid JSON format\"}";
    }
}

std::string HttpServer::handleGetInventory(const std::string& manager_id) {
    auto inventory = db_->calculateInventory(manager_id);
    return inventoryToJson(inventory);
}

std::string HttpServer::handleGetItems(const std::string& manager_id) {
    auto items = db_->getCurrentItems(manager_id);
    return itemsToJson(items);
}

std::string HttpServer::handleGetDocuments(const std::string& manager_id) {
    auto documents = db_->getDocuments(manager_id);
    return documentsToJson(documents);
}

std::string HttpServer::handleGetStatistics(const std::string& manager_id) {
    return statisticsToJson(manager_id);
}

// ========== JSON 序列化方法 ==========

std::string HttpServer::transactionToJson(const TransactionRecord& trans) {
    std::ostringstream json;
    json << "{";
    json << "\"trans_id\":\"" << escapeJson(trans.trans_id) << "\",";
    json << "\"item_id\":\"" << escapeJson(trans.item_id) << "\",";
    json << "\"item_name\":\"" << escapeJson(trans.item_name) << "\",";
    json << "\"type\":\"" << escapeJson(trans.type) << "\",";
    json << "\"quantity\":" << trans.quantity << ",";
    json << "\"unit_price\":" << trans.unit_price << ",";
    json << "\"category\":\"" << escapeJson(trans.category) << "\",";
    json << "\"model\":\"" << escapeJson(trans.model) << "\",";
    json << "\"unit\":\"" << escapeJson(trans.unit) << "\",";
    json << "\"partner_id\":\"" << escapeJson(trans.partner_id) << "\",";
    json << "\"partner_name\":\"" << escapeJson(trans.partner_name) << "\",";
    json << "\"warehouse_id\":\"" << escapeJson(trans.warehouse_id) << "\",";
    json << "\"document_no\":\"" << escapeJson(trans.document_no) << "\",";
    json << "\"timestamp\":\"" << escapeJson(trans.timestamp) << "\",";
    json << "\"note\":\"" << escapeJson(trans.note) << "\",";
    json << "\"manager_id\":\"" << escapeJson(trans.manager_id) << "\"";
    json << "}";
    return json.str();
}

std::string HttpServer::inventoryToJson(const std::map<std::string, std::vector<InventoryRecord>>& inventory) {
    std::ostringstream json;
    json << "{\"warehouses\":[";
    
    bool first_warehouse = true;
    for (const auto& warehouse_pair : inventory) {
        if (!first_warehouse) json << ",";
        first_warehouse = false;
        
        json << "{\"warehouse_id\":\"" << escapeJson(warehouse_pair.first) << "\",\"items\":[";
        
        bool first_item = true;
        for (const auto& item : warehouse_pair.second) {
            if (!first_item) json << ",";
            first_item = false;
            
            json << "{";
            json << "\"item_id\":\"" << escapeJson(item.item_id) << "\",";
            json << "\"quantity\":" << item.quantity << ",";
            json << "\"avg_price\":" << item.avg_price;
            json << "}";
        }
        
        json << "]}";
    }
    
    json << "]}";
    return json.str();
}

std::string HttpServer::itemsToJson(const std::vector<ItemSummary>& items) {
    std::ostringstream json;
    json << "{\"items\":[";
    
    for (size_t i = 0; i < items.size(); ++i) {
        if (i > 0) json << ",";
        const auto& item = items[i];
        
        json << "{";
        json << "\"item_id\":\"" << escapeJson(item.item_id) << "\",";
        json << "\"item_name\":\"" << escapeJson(item.item_name) << "\",";
        json << "\"category\":\"" << escapeJson(item.category) << "\",";
        json << "\"model\":\"" << escapeJson(item.model) << "\",";
        json << "\"unit\":\"" << escapeJson(item.unit) << "\",";
        json << "\"total_quantity\":" << item.total_quantity << ",";
        json << "\"latest_price\":" << item.latest_price << ",";
        json << "\"last_updated\":\"" << escapeJson(item.last_updated) << "\"";
        json << "}";
    }
    
    json << "],\"count\":" << items.size() << "}";
    return json.str();
}

std::string HttpServer::documentsToJson(const std::vector<DocumentSummary>& documents) {
    std::ostringstream json;
    json << "{\"documents\":[";
    
    for (size_t i = 0; i < documents.size(); ++i) {
        if (i > 0) json << ",";
        const auto& doc = documents[i];
        
        json << "{";
        json << "\"document_no\":\"" << escapeJson(doc.document_no) << "\",";
        json << "\"type\":\"" << escapeJson(doc.type) << "\",";
        json << "\"partner_id\":\"" << escapeJson(doc.partner_id) << "\",";
        json << "\"partner_name\":\"" << escapeJson(doc.partner_name) << "\",";
        json << "\"manager_id\":\"" << escapeJson(doc.manager_id) << "\",";
        json << "\"timestamp\":\"" << escapeJson(doc.timestamp) << "\",";
        json << "\"total_amount\":" << doc.total_amount << ",";
        json << "\"item_count\":" << doc.item_count;
        json << "}";
    }
    
    json << "],\"count\":" << documents.size() << "}";
    return json.str();
}

std::string HttpServer::statisticsToJson(const std::string& manager_id) {
    auto total_transactions = db_->getTotalTransactionCount(manager_id);
    auto item_types = db_->getItemTypeCount(manager_id);
    auto inventory_by_category = db_->getInventoryByCategory(manager_id);
    
    std::ostringstream json;
    json << "{";
    json << "\"manager_id\":\"" << escapeJson(manager_id) << "\",";
    json << "\"total_transactions\":" << total_transactions << ",";
    json << "\"item_types\":" << item_types << ",";
    json << "\"inventory_by_category\":{";
    
    bool first = true;
    for (const auto& pair : inventory_by_category) {
        if (!first) json << ",";
        first = false;
        json << "\"" << escapeJson(pair.first) << "\":" << pair.second;
    }
    
    json << "},";
    json << "\"timestamp\":\"" << getCurrentTimestamp() << "\"";
    json << "}";
    
    return json.str();
}

// ========== JSON 反序列化方法 ==========

TransactionRecord HttpServer::jsonToTransaction(const std::string& json) {
    TransactionRecord trans;
    
    // 简化的JSON解析（生产环境应使用专业JSON库）
    auto getValue = [&json](const std::string& key) -> std::string {
        std::regex pattern("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"|\"" + key + "\"\\s*:\\s*([^,}\\s]+)");
        std::smatch match;
        if (std::regex_search(json, match, pattern)) {
            return match[1].matched ? match[1].str() : match[2].str();
        }
        return "";
    };
    
    trans.trans_id = getValue("trans_id");
    trans.item_id = getValue("item_id");
    trans.item_name = getValue("item_name");
    trans.type = getValue("type");
    trans.category = getValue("category");
    trans.model = getValue("model");
    trans.unit = getValue("unit");
    trans.partner_id = getValue("partner_id");
    trans.partner_name = getValue("partner_name");
    trans.warehouse_id = getValue("warehouse_id");
    trans.document_no = getValue("document_no");
    trans.timestamp = getValue("timestamp");
    trans.note = getValue("note");
    
    std::string quantity_str = getValue("quantity");
    if (!quantity_str.empty()) {
        trans.quantity = std::stoi(quantity_str);
    }
    
    std::string price_str = getValue("unit_price");
    if (!price_str.empty()) {
        trans.unit_price = std::stod(price_str);
    }
    
    return trans;
}

// ========== 工具方法 ==========

std::string HttpServer::urlDecode(const std::string& str) {
    std::string result;
    for (size_t i = 0; i < str.length(); ++i) {
        if (str[i] == '%' && i + 2 < str.length()) {
            std::string hex = str.substr(i + 1, 2);
            char c = static_cast<char>(std::stoi(hex, nullptr, 16));
            result += c;
            i += 2;
        } else if (str[i] == '+') {
            result += ' ';
        } else {
            result += str[i];
        }
    }
    return result;
}

std::string HttpServer::createHttpResponse(const std::string& content, 
                                          const std::string& content_type,
                                          int status_code,
                                          const std::string& additional_headers) {
    std::string status_text;
    switch (status_code) {
        case 200: status_text = "OK"; break;
        case 201: status_text = "Created"; break;
        case 400: status_text = "Bad Request"; break;
        case 404: status_text = "Not Found"; break;
        case 500: status_text = "Internal Server Error"; break;
        default: status_text = "Unknown"; break;
    }
    
    std::ostringstream response;
    response << "HTTP/1.1 " << status_code << " " << status_text << "\r\n";
    response << "Content-Type: " << content_type << "\r\n";
    response << "Content-Length: " << content.length() << "\r\n";
    response << "Connection: close\r\n";
    if (!additional_headers.empty()) {
        response << additional_headers;
    }
    response << "\r\n";
    response << content;
    
    return response.str();
}

std::string HttpServer::createErrorResponse(const std::string& error, int status_code, const std::string& additional_headers) {
    std::string json = "{\"error\":\"" + escapeJson(error) + "\",\"status\":" + std::to_string(status_code) + "}";
    return createHttpResponse(json, "application/json", status_code, additional_headers);
}

std::string HttpServer::escapeJson(const std::string& str) {
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
                    result += "\\u00" + std::to_string(c / 16) + std::to_string(c % 16);
                } else {
                    result += c;
                }
                break;
        }
    }
    return result;
}

std::string HttpServer::getCurrentTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    
    std::stringstream ss;
    ss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%SZ");
    return ss.str();
}