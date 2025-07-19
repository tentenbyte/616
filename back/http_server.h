#ifndef HTTP_SERVER_H
#define HTTP_SERVER_H

#include "memory_database.h"
#include <string>
#include <memory>

// 简单的HTTP服务器，提供REST API接口
class HttpServer {
public:
    HttpServer(int port, std::shared_ptr<MemoryDatabase> db);
    ~HttpServer();
    
    // 启动服务器
    bool start();
    
    // 停止服务器
    void stop();
    
    // 检查是否运行中
    bool isRunning() const;

private:
    int port_;
    bool running_;
    std::shared_ptr<MemoryDatabase> db_;
    
    // 处理HTTP请求的核心方法
    std::string handleRequest(const std::string& method, 
                             const std::string& path, 
                             const std::string& body);
    
    // API端点处理方法
    std::string handleGetTransactions(const std::string& manager_id);
    std::string handlePostTransaction(const std::string& manager_id, const std::string& body);
    std::string handleGetInventory(const std::string& manager_id);
    std::string handleGetItems(const std::string& manager_id);
    std::string handleGetDocuments(const std::string& manager_id);
    std::string handleGetStatistics(const std::string& manager_id);
    
    // JSON序列化方法
    std::string transactionToJson(const TransactionRecord& trans);
    std::string inventoryToJson(const std::map<std::string, std::vector<InventoryRecord>>& inventory);
    std::string itemsToJson(const std::vector<ItemSummary>& items);
    std::string documentsToJson(const std::vector<DocumentSummary>& documents);
    std::string statisticsToJson(const std::string& manager_id);
    
    // JSON反序列化方法
    TransactionRecord jsonToTransaction(const std::string& json);
    
    // 工具方法
    std::string urlDecode(const std::string& str);
    std::string createHttpResponse(const std::string& content, 
                                  const std::string& content_type = "application/json",
                                  int status_code = 200,
                                  const std::string& additional_headers = "");
    std::string createErrorResponse(const std::string& error, int status_code = 400, 
                                   const std::string& additional_headers = "");
    
    // 简化的JSON转义
    std::string escapeJson(const std::string& str);
    std::string getCurrentTimestamp();
};

#endif // HTTP_SERVER_H