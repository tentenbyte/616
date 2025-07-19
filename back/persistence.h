#ifndef PERSISTENCE_H
#define PERSISTENCE_H

#include "transaction.h"
#include <string>
#include <fstream>
#include <memory>

// 持久化管理器
class PersistenceManager {
public:
    PersistenceManager(const std::string& data_dir = "./data");
    ~PersistenceManager();
    
    // ========== WAL (Write-Ahead Logging) ==========
    
    // 写前日志：在内存更新前先写磁盘
    bool writeToWAL(const std::string& manager_id, const TransactionRecord& trans);
    
    // 刷新WAL缓冲区到磁盘
    bool flushWAL();
    
    // ========== 数据恢复 ==========
    
    // 从WAL文件恢复所有数据
    std::unordered_map<std::string, std::vector<TransactionRecord>> recoverFromWAL();
    
    // 验证数据完整性
    bool validateDataIntegrity(const std::unordered_map<std::string, std::vector<TransactionRecord>>& data);
    
    // ========== 快照管理 ==========
    
    // 创建数据快照
    bool createSnapshot(const std::unordered_map<std::string, std::vector<TransactionRecord>>& data);
    
    // 从最新快照恢复
    std::unordered_map<std::string, std::vector<TransactionRecord>> recoverFromSnapshot();
    
    // 清理旧的WAL文件（在快照后）
    bool cleanupOldWAL(const std::string& before_timestamp);
    
    // ========== 配置管理 ==========
    
    // 设置自动快照间隔（秒）
    void setSnapshotInterval(int seconds) { snapshot_interval_ = seconds; }
    
    // 设置WAL文件大小限制（MB）
    void setWALSizeLimit(int mb) { wal_size_limit_ = mb * 1024 * 1024; }
    
    // 检查是否需要创建快照
    bool shouldCreateSnapshot() const;
    
    // ========== 文件管理 ==========
    
    // 获取数据目录状态
    struct StorageInfo {
        std::string data_dir;
        std::string current_wal_file;
        std::string latest_snapshot_file;
        size_t wal_file_size;
        size_t total_transactions;
        std::string last_snapshot_time;
        
        StorageInfo() : wal_file_size(0), total_transactions(0) {}
    };
    
    StorageInfo getStorageInfo() const;
    
    // 压缩和归档旧数据
    bool archiveOldData(int days_old);

private:
    std::string data_dir_;
    std::string wal_file_path_;
    std::unique_ptr<std::ofstream> wal_stream_;
    
    // 配置参数
    int snapshot_interval_;     // 快照间隔（秒）
    size_t wal_size_limit_;     // WAL文件大小限制
    std::string last_snapshot_time_;
    
    // 内部方法
    bool initializeDataDirectory();
    std::string getCurrentTimestamp() const;
    std::string generateSnapshotFilename() const;
    std::string generateWALFilename() const;
    
    // 序列化方法
    std::string serializeTransaction(const std::string& manager_id, const TransactionRecord& trans) const;
    bool deserializeTransaction(const std::string& line, std::string& manager_id, TransactionRecord& trans) const;
    
    // 文件操作
    bool rotateWALFile();
    std::vector<std::string> getWALFiles() const;
    std::vector<std::string> getSnapshotFiles() const;
    
    // JSON序列化（用于快照）
    std::string transactionToJSON(const TransactionRecord& trans) const;
    bool transactionFromJSON(const std::string& json, TransactionRecord& trans) const;
    
    // 错误处理
    void logError(const std::string& operation, const std::string& error) const;
    
    // 文件锁（防止多进程冲突）
    bool acquireFileLock();
    void releaseFileLock();
    int lock_fd_;
};

#endif // PERSISTENCE_H