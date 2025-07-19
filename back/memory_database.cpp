#include "memory_database.h"
#include <algorithm>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <iostream>

MemoryDatabase::MemoryDatabase(const std::string& data_dir) 
    : persistence_enabled_(true) {
    
    LOG_INFO("MemoryDatabase", "constructor", "Initializing memory database with data_dir: " + data_dir);
    
    try {
        persistence_.reset(new PersistenceManager(data_dir));
        
        // 启动时从持久化存储恢复数据
        TIMER("database_recovery_time");
        auto recovered_data = persistence_->recoverFromWAL();
        
        if (!recovered_data.empty()) {
            if (persistence_->validateDataIntegrity(recovered_data)) {
                // 恢复数据到内存
                size_t total_transactions = 0;
                for (const auto& manager_pair : recovered_data) {
                    const std::string& manager_id = manager_pair.first;
                    const auto& transactions = manager_pair.second;
                    
                    ManagerData& data = managers_[manager_id];
                    data.transactions = transactions;
                    data.count.store(transactions.size(), std::memory_order_release);
                    total_transactions += transactions.size();
                    
                    LOG_DEBUG("MemoryDatabase", "recovery", 
                             "Restored " + std::to_string(transactions.size()) + 
                             " transactions for manager: " + manager_id);
                }
                
                LOG_INFO("MemoryDatabase", "recovery", 
                        "Data recovery completed. Restored " + std::to_string(recovered_data.size()) +
                        " managers with " + std::to_string(total_transactions) + " total transactions");
                
                // 更新监控指标
                SET_GAUGE("database_managers_count", recovered_data.size());
                SET_GAUGE("database_transactions_count", total_transactions);
                
            } else {
                LOG_ERROR("MemoryDatabase", "recovery", "Data integrity validation failed, starting with empty state");
                ErrorHandler::logError(ErrorCode::DATA_CORRUPTION_DETECTED, 
                                      "Data integrity validation failed during recovery",
                                      ERROR_CONTEXT("MemoryDatabase", "recovery"));
            }
        } else {
            LOG_INFO("MemoryDatabase", "recovery", "No existing data found, starting with empty database");
        }
        
    } catch (const std::exception& e) {
        LOG_ERROR("MemoryDatabase", "constructor", "Persistence initialization failed: " + std::string(e.what()));
        ErrorHandler::logError(ErrorCode::PERSISTENCE_INIT_FAILED, e.what(),
                              ERROR_CONTEXT("MemoryDatabase", "constructor"));
        persistence_enabled_ = false;
    }
    
    LOG_INFO("MemoryDatabase", "constructor", "Memory database initialized successfully");
}

MemoryDatabase::~MemoryDatabase() {
    if (persistence_enabled_ && persistence_) {
        // 关闭前创建最终快照
        try {
            std::unordered_map<std::string, std::vector<TransactionRecord>> all_data;
            for (const auto& manager_pair : managers_) {
                all_data[manager_pair.first] = manager_pair.second.transactions;
            }
            
            if (persistence_->createSnapshot(all_data)) {
                std::cout << "✓ 最终快照创建成功" << std::endl;
            }
        } catch (const std::exception& e) {
            std::cerr << "⚠️ 创建最终快照失败: " << e.what() << std::endl;
        }
    }
}

// ========== 核心操作 ==========

Result<void> MemoryDatabase::appendTransaction(const std::string& manager_id, const TransactionRecord& trans) {
    TIMER("append_transaction_time");
    
    LOG_DEBUG("MemoryDatabase", "appendTransaction", 
             "Attempting to append transaction: " + trans.trans_id + " for manager: " + manager_id);
    
    // 输入验证
    if (manager_id.empty()) {
        LOG_WARNING("MemoryDatabase", "appendTransaction", "Empty manager_id provided");
        return RESULT_ERROR_VOID(ErrorCode::INVALID_PARAMETER, "Manager ID cannot be empty",
                                ERROR_CONTEXT_WITH_IDS("MemoryDatabase", "appendTransaction", manager_id, trans.trans_id));
    }
    
    if (trans.trans_id.empty() || trans.item_id.empty()) {
        LOG_WARNING("MemoryDatabase", "appendTransaction", 
                   "Empty transaction ID or item ID provided: trans_id=" + trans.trans_id + ", item_id=" + trans.item_id);
        return RESULT_ERROR_VOID(ErrorCode::INVALID_PARAMETER, "Transaction ID and Item ID cannot be empty",
                                ERROR_CONTEXT_WITH_IDS("MemoryDatabase", "appendTransaction", manager_id, trans.trans_id));
    }
    
    if (trans.type != "in" && trans.type != "out") {
        LOG_WARNING("MemoryDatabase", "appendTransaction", 
                   "Invalid transaction type: " + trans.type + " for transaction: " + trans.trans_id);
        return RESULT_ERROR_VOID(ErrorCode::INVALID_TRANSACTION_TYPE, "Transaction type must be 'in' or 'out'",
                                ERROR_CONTEXT_WITH_IDS("MemoryDatabase", "appendTransaction", manager_id, trans.trans_id));
    }
    
    if (trans.quantity <= 0) {
        LOG_WARNING("MemoryDatabase", "appendTransaction", 
                   "Invalid quantity: " + std::to_string(trans.quantity) + " for transaction: " + trans.trans_id);
        return RESULT_ERROR_VOID(ErrorCode::INVALID_PARAMETER, "Quantity must be positive",
                                ERROR_CONTEXT_WITH_IDS("MemoryDatabase", "appendTransaction", manager_id, trans.trans_id));
    }
    
    // 检查重复交易ID（可选的业务逻辑）
    auto it = managers_.find(manager_id);
    if (it != managers_.end()) {
        size_t current_count = it->second.count.load(std::memory_order_acquire);
        for (size_t i = 0; i < current_count && i < it->second.transactions.size(); ++i) {
            if (it->second.transactions[i].trans_id == trans.trans_id) {
                LOG_WARNING("MemoryDatabase", "appendTransaction", 
                           "Duplicate transaction ID detected: " + trans.trans_id);
                return RESULT_ERROR_VOID(ErrorCode::DUPLICATE_TRANSACTION_ID, 
                                        "Transaction ID already exists",
                                        ERROR_CONTEXT_WITH_IDS("MemoryDatabase", "appendTransaction", manager_id, trans.trans_id));
            }
        }
    }
    
    try {
        // WAL: 先写磁盘，再更新内存（Write-Ahead Logging）
        if (persistence_enabled_ && persistence_) {
            TIMER("wal_write_time");
            if (!persistence_->writeToWAL(manager_id, trans)) {
                LOG_ERROR("MemoryDatabase", "appendTransaction", 
                         "WAL write failed for transaction: " + trans.trans_id);
                RECORD_WAL_WRITE(false, 0.0);
                return RESULT_ERROR_VOID(ErrorCode::WAL_WRITE_FAILED, 
                                        "Failed to write transaction to WAL",
                                        ERROR_CONTEXT_WITH_IDS("MemoryDatabase", "appendTransaction", manager_id, trans.trans_id));
            }
            RECORD_WAL_WRITE(true, 0.0);  // Duration would be measured by TIMER
        }
        
        // 内存更新：先追加记录，再原子性更新计数器
        ManagerData& data = managers_[manager_id];
        data.transactions.push_back(trans);
        
        // 关键：写完数据后，原子性地增加计数器
        // 这确保读者看到的计数器值对应已完成的写入
        data.count.fetch_add(1, std::memory_order_release);
        
        // 记录业务指标
        RECORD_TRANSACTION(manager_id, trans.type, trans.getTotalAmount());
        INC_COUNTER("total_transactions");
        SET_GAUGE("database_transactions_count", getTotalTransactionCount(""));
        
        LOG_INFO("MemoryDatabase", "appendTransaction", 
                "Transaction appended successfully: " + trans.trans_id + 
                " (" + trans.type + ", " + std::to_string(trans.quantity) + " " + trans.unit + ")");
        
        return RESULT_SUCCESS_VOID();
        
    } catch (const std::exception& e) {
        LOG_ERROR("MemoryDatabase", "appendTransaction", 
                 "Exception during transaction append: " + std::string(e.what()));
        RECORD_TRANSACTION_ERROR("append_exception");
        return RESULT_ERROR_VOID(ErrorCode::UNKNOWN_ERROR, e.what(),
                                ERROR_CONTEXT_WITH_IDS("MemoryDatabase", "appendTransaction", manager_id, trans.trans_id));
    }
}

std::vector<TransactionRecord> MemoryDatabase::getTransactions(const std::string& manager_id) const {
    auto it = managers_.find(manager_id);
    if (it == managers_.end()) {
        return std::vector<TransactionRecord>();
    }
    
    // 无锁读取：先获取安全的记录数量，再读取对应数量的数据
    const ManagerData& data = it->second;
    size_t safe_count = data.count.load(std::memory_order_acquire);
    
    // 安全拷贝：只读取已确认写入完成的记录
    std::vector<TransactionRecord> result;
    result.reserve(safe_count);
    
    for (size_t i = 0; i < safe_count && i < data.transactions.size(); ++i) {
        result.push_back(data.transactions[i]);
    }
    
    return result;
}

size_t MemoryDatabase::getTransactionCount(const std::string& manager_id) const {
    auto it = managers_.find(manager_id);
    if (it == managers_.end()) {
        return 0;
    }
    
    return it->second.count.load(std::memory_order_acquire);
}

// ========== 持久化管理 ==========

void MemoryDatabase::enablePersistence(bool enable) {
    persistence_enabled_ = enable && (persistence_ != nullptr);
}

bool MemoryDatabase::createSnapshot() {
    if (!persistence_enabled_ || !persistence_) {
        return false;
    }
    
    try {
        std::unordered_map<std::string, std::vector<TransactionRecord>> all_data;
        for (const auto& manager_pair : managers_) {
            all_data[manager_pair.first] = manager_pair.second.transactions;
        }
        
        return persistence_->createSnapshot(all_data);
    } catch (const std::exception& e) {
        std::cerr << "创建快照失败: " << e.what() << std::endl;
        return false;
    }
}

PersistenceManager::StorageInfo MemoryDatabase::getStorageInfo() const {
    if (persistence_enabled_ && persistence_) {
        return persistence_->getStorageInfo();
    }
    
    return PersistenceManager::StorageInfo();
}

// ========== 派生表计算 ==========

std::map<std::string, std::vector<InventoryRecord>> MemoryDatabase::calculateInventory(const std::string& manager_id) const {
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    std::map<std::string, std::vector<InventoryRecord>> result;
    
    // 按 warehouse_id + item_id 分组计算库存
    std::map<std::pair<std::string, std::string>, InventoryRecord> inventory_map;
    
    for (const auto& trans : transactions) {
        auto key = std::make_pair(trans.warehouse_id, trans.item_id);
        
        if (inventory_map.find(key) == inventory_map.end()) {
            inventory_map[key].item_id = trans.item_id;
            inventory_map[key].warehouse_id = trans.warehouse_id;
            inventory_map[key].quantity = 0;
            inventory_map[key].avg_price = 0.0;
        }
        
        auto& record = inventory_map[key];
        
        if (trans.isInbound()) {
            // 入库：增加数量，更新平均价格
            double total_value = record.quantity * record.avg_price + trans.quantity * trans.unit_price;
            record.quantity += trans.quantity;
            if (record.quantity > 0) {
                record.avg_price = total_value / record.quantity;
            }
        } else {
            // 出库：减少数量
            record.quantity -= trans.quantity;
        }
    }
    
    // 按仓库分组，只保留数量大于0的记录
    for (const auto& pair : inventory_map) {
        if (pair.second.quantity > 0) {
            result[pair.first.first].push_back(pair.second);
        }
    }
    
    return result;
}

std::vector<ItemSummary> MemoryDatabase::getCurrentItems(const std::string& manager_id) const {
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    std::vector<ItemSummary> result;
    auto item_map = buildItemSummaryMap(transactions);
    
    for (const auto& pair : item_map) {
        if (pair.second.total_quantity > 0) {
            result.push_back(pair.second);
        }
    }
    
    return result;
}

std::vector<DocumentSummary> MemoryDatabase::getDocuments(const std::string& manager_id) const {
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    std::vector<DocumentSummary> result;
    auto doc_map = buildDocumentSummaryMap(transactions);
    
    for (const auto& pair : doc_map) {
        result.push_back(pair.second);
    }
    
    return result;
}

// ========== 查询功能 ==========

std::vector<TransactionRecord> MemoryDatabase::getTransactionsByTimeRange(
    const std::string& manager_id,
    const std::string& start_time,
    const std::string& end_time) const {
    
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    std::vector<TransactionRecord> result;
    
    for (const auto& trans : transactions) {
        if (isTimeInRange(trans.timestamp, start_time, end_time)) {
            result.push_back(trans);
        }
    }
    
    return result;
}

std::vector<TransactionRecord> MemoryDatabase::getTransactionsByItem(
    const std::string& manager_id,
    const std::string& item_id) const {
    
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    std::vector<TransactionRecord> result;
    
    for (const auto& trans : transactions) {
        if (trans.item_id == item_id) {
            result.push_back(trans);
        }
    }
    
    return result;
}

std::vector<TransactionRecord> MemoryDatabase::getTransactionsByDocument(
    const std::string& manager_id,
    const std::string& document_no) const {
    
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    std::vector<TransactionRecord> result;
    
    for (const auto& trans : transactions) {
        if (trans.document_no == document_no) {
            result.push_back(trans);
        }
    }
    
    return result;
}

std::vector<TransactionRecord> MemoryDatabase::getTransactionsByPartner(
    const std::string& manager_id,
    const std::string& partner_id) const {
    
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    std::vector<TransactionRecord> result;
    
    for (const auto& trans : transactions) {
        if (trans.partner_id == partner_id) {
            result.push_back(trans);
        }
    }
    
    return result;
}

// ========== 统计功能 ==========

size_t MemoryDatabase::getTotalTransactionCount(const std::string& manager_id) const {
    return getTransactionCount(manager_id);
}

size_t MemoryDatabase::getItemTypeCount(const std::string& manager_id) const {
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    auto item_map = buildItemSummaryMap(transactions);
    
    size_t count = 0;
    for (const auto& pair : item_map) {
        if (pair.second.total_quantity > 0) {
            count++;
        }
    }
    
    return count;
}

MemoryDatabase::InOutSummary MemoryDatabase::getInOutSummary(
    const std::string& manager_id,
    const std::string& start_time,
    const std::string& end_time) const {
    
    InOutSummary summary;
    
    auto transactions = getTransactionsByTimeRange(manager_id, start_time, end_time);
    
    for (const auto& trans : transactions) {
        if (trans.isInbound()) {
            summary.in_quantity += trans.quantity;
            summary.in_amount += trans.getTotalAmount();
        } else {
            summary.out_quantity += trans.quantity;
            summary.out_amount += trans.getTotalAmount();
        }
    }
    
    return summary;
}

std::map<std::string, int> MemoryDatabase::getInventoryByCategory(const std::string& manager_id) const {
    // 无锁读取交易记录
    auto transactions = getTransactions(manager_id);
    
    std::map<std::string, int> result;
    auto item_map = buildItemSummaryMap(transactions);
    
    for (const auto& pair : item_map) {
        if (pair.second.total_quantity > 0) {
            result[pair.second.category] += pair.second.total_quantity;
        }
    }
    
    return result;
}

// ========== 工具方法 ==========

std::vector<std::string> MemoryDatabase::getAllManagerIds() const {
    std::vector<std::string> result;
    for (const auto& pair : managers_) {
        result.push_back(pair.first);
    }
    
    return result;
}

bool MemoryDatabase::hasManager(const std::string& manager_id) const {
    return managers_.find(manager_id) != managers_.end();
}

std::string MemoryDatabase::generateTransactionId() const {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    
    std::stringstream ss;
    ss << "TXN" << std::put_time(std::localtime(&time_t), "%Y%m%d%H%M%S") << std::setfill('0') << std::setw(3) << ms.count();
    
    return ss.str();
}

MemoryDatabase::SystemStatus MemoryDatabase::getSystemStatus() const {
    SystemStatus status;
    status.total_managers = managers_.size();
    
    for (const auto& pair : managers_) {
        status.total_transactions += pair.second.count.load(std::memory_order_acquire);
    }
    
    // 粗略估算内存使用 (每条记录约500字节)
    status.memory_usage_kb = status.total_transactions * 500 / 1024;
    
    return status;
}

// ========== 内部辅助方法 ==========

std::vector<TransactionRecord> MemoryDatabase::getEmptyTransactionList() const {
    static std::vector<TransactionRecord> empty_list;
    return empty_list;
}

bool MemoryDatabase::isValidTimeFormat(const std::string& timestamp) const {
    // 简化验证：检查长度和基本格式 (YYYY-MM-DDTHH:MM:SS)
    return timestamp.length() >= 19 && timestamp[4] == '-' && timestamp[7] == '-' && timestamp[10] == 'T';
}

bool MemoryDatabase::isTimeInRange(const std::string& timestamp, 
                                  const std::string& start_time, 
                                  const std::string& end_time) const {
    // 简化比较：字符串直接比较 (假设都是ISO 8601格式)
    return timestamp >= start_time && timestamp <= end_time;
}

std::map<std::string, ItemSummary> MemoryDatabase::buildItemSummaryMap(
    const std::vector<TransactionRecord>& transactions) const {
    
    std::map<std::string, ItemSummary> item_map;
    
    for (const auto& trans : transactions) {
        if (item_map.find(trans.item_id) == item_map.end()) {
            ItemSummary& summary = item_map[trans.item_id];
            summary.item_id = trans.item_id;
            summary.item_name = trans.item_name;
            summary.category = trans.category;
            summary.model = trans.model;
            summary.unit = trans.unit;
            summary.latest_price = trans.unit_price;
            summary.total_quantity = 0;
            summary.last_updated = trans.timestamp;
        }
        
        ItemSummary& summary = item_map[trans.item_id];
        
        // 更新数量
        if (trans.isInbound()) {
            summary.total_quantity += trans.quantity;
        } else {
            summary.total_quantity -= trans.quantity;
        }
        
        // 更新最新信息
        if (trans.timestamp > summary.last_updated) {
            summary.latest_price = trans.unit_price;
            summary.last_updated = trans.timestamp;
            // 更新可能变化的属性
            summary.item_name = trans.item_name;
            summary.category = trans.category;
            summary.model = trans.model;
            summary.unit = trans.unit;
        }
    }
    
    return item_map;
}

std::map<std::string, DocumentSummary> MemoryDatabase::buildDocumentSummaryMap(
    const std::vector<TransactionRecord>& transactions) const {
    
    std::map<std::string, DocumentSummary> doc_map;
    
    for (const auto& trans : transactions) {
        if (trans.document_no.empty()) continue;
        
        if (doc_map.find(trans.document_no) == doc_map.end()) {
            DocumentSummary& summary = doc_map[trans.document_no];
            summary.document_no = trans.document_no;
            summary.type = trans.type;
            summary.partner_id = trans.partner_id;
            summary.partner_name = trans.partner_name;
            summary.manager_id = trans.manager_id;
            summary.timestamp = trans.timestamp;
            summary.total_amount = 0.0;
            summary.item_count = 0;
        }
        
        DocumentSummary& summary = doc_map[trans.document_no];
        summary.total_amount += trans.getTotalAmount();
        summary.item_count++;
        
        // 保持最早的时间戳
        if (trans.timestamp < summary.timestamp) {
            summary.timestamp = trans.timestamp;
        }
    }
    
    return doc_map;
}