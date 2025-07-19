#include "memory_database.h"
#include "http_server.h"
#include "logger.h"
#include "error_handling.h"
#include "monitoring.h"
#include <iostream>
#include <memory>
#include <signal.h>
#include <thread>

// 全局变量，用于信号处理
std::shared_ptr<HttpServer> g_server;

void signalHandler(int signal) {
    if (g_server) {
        std::cout << "\n收到信号 " << signal << "，正在关闭服务器..." << std::endl;
        g_server->stop();
    }
}

int main(int argc, char* argv[]) {
    std::cout << "=== C++11 内存数据库仓库管理系统 ===" << std::endl;
    std::cout << "基于单一数据源的设计理念" << std::endl;
    std::cout << "--------------------------------------" << std::endl;
    
    // 初始化日志系统
    auto& logger = Logger::getInstance();
    logger.setLogLevel(LogLevel::INFO);
    logger.setLogFile("./logs/warehouse.log");
    logger.enableConsoleOutput(true);
    logger.enableAsyncMode(true);
    
    if (!logger.start()) {
        std::cerr << "Failed to initialize logging system" << std::endl;
        return 1;
    }
    
    LOG_INFO("Main", "startup", "=== Warehouse Management System Starting ===");
    LOG_INFO("Main", "startup", "Event Sourcing + Atomic Counter Architecture");
    
    // 初始化监控系统
    auto& monitor = MonitoringManager::getInstance();
    monitor.setEnabled(true);
    monitor.startPeriodicCollection();
    
    // 注册系统指标
    monitor.registerCounter("total_transactions", "Total number of transactions processed");
    monitor.registerCounter("total_errors", "Total number of errors encountered");
    monitor.registerGauge("database_managers_count", "Number of active managers");
    monitor.registerGauge("database_transactions_count", "Current total transaction count");
    monitor.registerHistogram("append_transaction_time", "Time spent appending transactions (ms)");
    monitor.registerHistogram("wal_write_time", "Time spent writing to WAL (ms)");
    
    LOG_INFO("Main", "startup", "Monitoring system initialized");
    
    // 创建内存数据库实例
    std::shared_ptr<MemoryDatabase> database;
    try {
        database = std::make_shared<MemoryDatabase>();
        LOG_INFO("Main", "startup", "Memory database initialized successfully");
    } catch (const std::exception& e) {
        LOG_FATAL("Main", "startup", "Failed to initialize memory database: " + std::string(e.what()));
        logger.stop();
        return 1;
    }
    
    // 设置服务器端口
    int port = 8080;
    if (argc > 1) {
        port = std::atoi(argv[1]);
        if (port <= 0 || port > 65535) {
            std::cerr << "错误：端口号无效，使用默认端口 8080" << std::endl;
            port = 8080;
        }
    }
    
    // 创建HTTP服务器
    g_server = std::make_shared<HttpServer>(port, database);
    std::cout << "✓ HTTP服务器创建完成，端口: " << port << std::endl;
    
    // 设置信号处理器
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    // 添加一些示例数据（可选）
    if (argc > 2 && std::string(argv[2]) == "--demo") {
        std::cout << "正在添加示例数据..." << std::endl;
        
        TransactionRecord demo1;
        demo1.trans_id = database->generateTransactionId();
        demo1.item_id = "ITEM001";
        demo1.item_name = "测试物品A";
        demo1.type = "in";
        demo1.quantity = 100;
        demo1.timestamp = "2024-01-15T10:30:00";
        demo1.manager_id = "manager001";
        demo1.category = "电子产品";
        demo1.model = "型号A1";
        demo1.unit = "个";
        demo1.unit_price = 25.50;
        demo1.partner_id = "SUPPLIER001";
        demo1.partner_name = "供应商A";
        demo1.warehouse_id = "WH001";
        demo1.document_no = "DOC20240115001";
        demo1.note = "首批入库";
        
        TransactionRecord demo2;
        demo2.trans_id = database->generateTransactionId();
        demo2.item_id = "ITEM002";
        demo2.item_name = "测试物品B";
        demo2.type = "in";
        demo2.quantity = 50;
        demo2.timestamp = "2024-01-15T11:00:00";
        demo2.manager_id = "manager001";
        demo2.category = "办公用品";
        demo2.model = "型号B2";
        demo2.unit = "盒";
        demo2.unit_price = 12.80;
        demo2.partner_id = "SUPPLIER002";
        demo2.partner_name = "供应商B";
        demo2.warehouse_id = "WH001";
        demo2.document_no = "DOC20240115002";
        demo2.note = "办公用品补充";
        
        auto result1 = database->appendTransaction("manager001", demo1);
        auto result2 = database->appendTransaction("manager001", demo2);
        
        if (result1.isSuccess() && result2.isSuccess()) {
            LOG_INFO("Main", "demo_data", "Demo data added successfully");
        } else {
            LOG_WARNING("Main", "demo_data", "Failed to add some demo data");
            if (result1.isError()) {
                LOG_ERROR("Main", "demo_data", "Demo1 error: " + result1.getErrorMessage());
            }
            if (result2.isError()) {
                LOG_ERROR("Main", "demo_data", "Demo2 error: " + result2.getErrorMessage());
            }
        }
        
        std::cout << "✓ 示例数据添加完成" << std::endl;
    }
    
    // 启动服务器
    std::cout << "正在启动HTTP服务器..." << std::endl;
    if (!g_server->start()) {
        std::cerr << "错误：服务器启动失败" << std::endl;
        return 1;
    }
    
    std::cout << "✓ 服务器启动成功！" << std::endl;
    std::cout << "--------------------------------------" << std::endl;
    std::cout << "API 端点:" << std::endl;
    std::cout << "GET  /api/managers/{id}/transactions  - 获取交易记录" << std::endl;
    std::cout << "POST /api/managers/{id}/transactions  - 添加交易记录" << std::endl;
    std::cout << "GET  /api/managers/{id}/inventory     - 获取库存信息" << std::endl;
    std::cout << "GET  /api/managers/{id}/items         - 获取物品清单" << std::endl;
    std::cout << "GET  /api/managers/{id}/documents     - 获取单据列表" << std::endl;
    std::cout << "GET  /api/managers/{id}/statistics    - 获取统计信息" << std::endl;
    std::cout << "GET  /api/system/status               - 获取系统状态" << std::endl;
    std::cout << "--------------------------------------" << std::endl;
    std::cout << "按 Ctrl+C 停止服务器" << std::endl;
    
    // 主循环
    while (g_server && g_server->isRunning()) {
        // 简单的心跳检查
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    
    std::cout << "服务器已关闭" << std::endl;
    return 0;
}