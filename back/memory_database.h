#ifndef MEMORY_DATABASE_H
#define MEMORY_DATABASE_H

#include "transaction.h"
#include "persistence.h"
#include "logger.h"
#include "error_handling.h"
#include "monitoring.h"
#include <string>
#include <vector>
#include <unordered_map>
#include <map>
#include <memory>
#include <atomic>

class MemoryDatabase {
public:
    MemoryDatabase(const std::string& data_dir = "./data");
    ~MemoryDatabase();
    
    // ========== 持久化管理 ==========
    
    // 启用/禁用持久化
    void enablePersistence(bool enable = true);
    
    // 手动创建快照
    bool createSnapshot();
    
    // 获取存储信息
    PersistenceManager::StorageInfo getStorageInfo() const;
    
    // ========== 核心操作 ==========
    
    // 唯一的写操作：追加交易记录
    Result<void> appendTransaction(const std::string& manager_id, const TransactionRecord& trans);
    
    // 读取指定库管员的交易记录（安全读取指定数量）
    std::vector<TransactionRecord> getTransactions(const std::string& manager_id) const;
    
    // 获取当前交易记录数量
    size_t getTransactionCount(const std::string& manager_id) const;
    
    // ========== 派生表计算 ==========
    
    // 计算当前库存 (按仓库分组)
    std::map<std::string, std::vector<InventoryRecord>> calculateInventory(const std::string& manager_id) const;
    
    // 获取物品清单
    std::vector<ItemSummary> getCurrentItems(const std::string& manager_id) const;
    
    // 获取单据列表
    std::vector<DocumentSummary> getDocuments(const std::string& manager_id) const;
    
    // ========== 查询功能 ==========
    
    // 按时间范围查询交易记录
    std::vector<TransactionRecord> getTransactionsByTimeRange(
        const std::string& manager_id,
        const std::string& start_time,
        const std::string& end_time) const;
    
    // 按物品ID查询交易记录
    std::vector<TransactionRecord> getTransactionsByItem(
        const std::string& manager_id,
        const std::string& item_id) const;
    
    // 按单据号查询交易记录
    std::vector<TransactionRecord> getTransactionsByDocument(
        const std::string& manager_id,
        const std::string& document_no) const;
    
    // 按供应商/客户查询交易记录
    std::vector<TransactionRecord> getTransactionsByPartner(
        const std::string& manager_id,
        const std::string& partner_id) const;
    
    // ========== 统计功能 ==========
    
    // 统计总交易数
    size_t getTotalTransactionCount(const std::string& manager_id) const;
    
    // 统计物品种类数
    size_t getItemTypeCount(const std::string& manager_id) const;
    
    // 统计某时间段的出入库总量和总金额
    struct InOutSummary {
        int in_quantity;
        int out_quantity;
        double in_amount;
        double out_amount;
        
        InOutSummary() : in_quantity(0), out_quantity(0), in_amount(0.0), out_amount(0.0) {}
    };
    
    InOutSummary getInOutSummary(
        const std::string& manager_id,
        const std::string& start_time,
        const std::string& end_time) const;
    
    // 按分类统计库存
    std::map<std::string, int> getInventoryByCategory(const std::string& manager_id) const;
    
    // ========== 工具方法 ==========
    
    // 获取所有库管员ID列表
    std::vector<std::string> getAllManagerIds() const;
    
    // 检查库管员是否存在
    bool hasManager(const std::string& manager_id) const;
    
    // 生成新的交易ID
    std::string generateTransactionId() const;
    
    // 获取系统状态信息
    struct SystemStatus {
        size_t total_managers;
        size_t total_transactions;
        size_t memory_usage_kb;
        
        SystemStatus() : total_managers(0), total_transactions(0), memory_usage_kb(0) {}
    };
    
    SystemStatus getSystemStatus() const;

private:
    // 核心数据结构：库管员ID -> 交易记录列表和原子计数器
    struct ManagerData {
        std::vector<TransactionRecord> transactions;
        std::atomic<size_t> count{0};  // 原子计数器：当前有效交易数量
        
        ManagerData() = default;
        
        // 禁用拷贝构造和赋值（因为atomic不可拷贝）
        ManagerData(const ManagerData&) = delete;
        ManagerData& operator=(const ManagerData&) = delete;
        
        // 支持移动构造和赋值
        ManagerData(ManagerData&& other) noexcept 
            : transactions(std::move(other.transactions))
            , count(other.count.load()) {
        }
        
        ManagerData& operator=(ManagerData&& other) noexcept {
            if (this != &other) {
                transactions = std::move(other.transactions);
                count.store(other.count.load());
            }
            return *this;
        }
    };
    
    std::unordered_map<std::string, ManagerData> managers_;
    
    // 持久化管理器
    std::unique_ptr<PersistenceManager> persistence_;
    bool persistence_enabled_;
    
    // 内部辅助方法
    std::vector<TransactionRecord> getEmptyTransactionList() const;
    bool isValidTimeFormat(const std::string& timestamp) const;
    bool isTimeInRange(const std::string& timestamp, 
                      const std::string& start_time, 
                      const std::string& end_time) const;
    
    // 计算辅助方法
    std::map<std::string, ItemSummary> buildItemSummaryMap(
        const std::vector<TransactionRecord>& transactions) const;
    
    std::map<std::string, DocumentSummary> buildDocumentSummaryMap(
        const std::vector<TransactionRecord>& transactions) const;
};

#endif // MEMORY_DATABASE_H