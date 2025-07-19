#include "persistence.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <filesystem>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>

PersistenceManager::PersistenceManager(const std::string& data_dir) 
    : data_dir_(data_dir)
    , snapshot_interval_(3600)  // 默认1小时
    , wal_size_limit_(100 * 1024 * 1024)  // 默认100MB
    , lock_fd_(-1) {
    
    if (!initializeDataDirectory()) {
        throw std::runtime_error("Failed to initialize data directory: " + data_dir_);
    }
    
    wal_file_path_ = data_dir_ + "/current.wal";
    wal_stream_ = std::make_unique<std::ofstream>(wal_file_path_, std::ios::app);
    
    if (!wal_stream_->is_open()) {
        throw std::runtime_error("Failed to open WAL file: " + wal_file_path_);
    }
    
    acquireFileLock();
}

PersistenceManager::~PersistenceManager() {
    if (wal_stream_ && wal_stream_->is_open()) {
        wal_stream_->flush();
        wal_stream_->close();
    }
    
    releaseFileLock();
}

// ========== WAL (Write-Ahead Logging) ==========

bool PersistenceManager::writeToWAL(const std::string& manager_id, const TransactionRecord& trans) {
    if (!wal_stream_ || !wal_stream_->is_open()) {
        logError("writeToWAL", "WAL stream not available");
        return false;
    }
    
    try {
        // 序列化交易记录为一行
        std::string line = serializeTransaction(manager_id, trans);
        
        // 写入WAL文件
        *wal_stream_ << line << std::endl;
        
        // 立即刷新到磁盘（保证持久性）
        wal_stream_->flush();
        
        // 检查是否需要轮转WAL文件
        if (shouldCreateSnapshot()) {
            rotateWALFile();
        }
        
        return true;
    } catch (const std::exception& e) {
        logError("writeToWAL", e.what());
        return false;
    }
}

bool PersistenceManager::flushWAL() {
    if (wal_stream_ && wal_stream_->is_open()) {
        wal_stream_->flush();
        return true;
    }
    return false;
}

// ========== 序列化方法 ==========

std::string PersistenceManager::serializeTransaction(const std::string& manager_id, const TransactionRecord& trans) const {
    std::ostringstream oss;
    
    // 格式：timestamp|manager_id|trans_id|item_id|item_name|type|quantity|unit_price|category|model|unit|partner_id|partner_name|warehouse_id|document_no|note
    oss << getCurrentTimestamp() << "|"
        << manager_id << "|"
        << trans.trans_id << "|"
        << trans.item_id << "|"
        << trans.item_name << "|"
        << trans.type << "|"
        << trans.quantity << "|"
        << std::fixed << std::setprecision(2) << trans.unit_price << "|"
        << trans.category << "|"
        << trans.model << "|"
        << trans.unit << "|"
        << trans.partner_id << "|"
        << trans.partner_name << "|"
        << trans.warehouse_id << "|"
        << trans.document_no << "|"
        << trans.note;
    
    return oss.str();
}

bool PersistenceManager::deserializeTransaction(const std::string& line, std::string& manager_id, TransactionRecord& trans) const {
    std::istringstream iss(line);
    std::string token;
    std::vector<std::string> fields;
    
    // 按"|"分割字段
    while (std::getline(iss, token, '|')) {
        fields.push_back(token);
    }
    
    if (fields.size() != 16) {  // 期望16个字段
        return false;
    }
    
    try {
        // 跳过timestamp（fields[0]）
        manager_id = fields[1];
        trans.trans_id = fields[2];
        trans.item_id = fields[3];
        trans.item_name = fields[4];
        trans.type = fields[5];
        trans.quantity = std::stoi(fields[6]);
        trans.unit_price = std::stod(fields[7]);
        trans.category = fields[8];
        trans.model = fields[9];
        trans.unit = fields[10];
        trans.partner_id = fields[11];
        trans.partner_name = fields[12];
        trans.warehouse_id = fields[13];
        trans.document_no = fields[14];
        trans.note = fields[15];
        trans.timestamp = fields[0];  // 使用WAL中的时间戳
        
        return true;
    } catch (const std::exception& e) {
        logError("deserializeTransaction", e.what());
        return false;
    }
}

// ========== 数据恢复 ==========

std::unordered_map<std::string, std::vector<TransactionRecord>> PersistenceManager::recoverFromWAL() {
    std::unordered_map<std::string, std::vector<TransactionRecord>> data;
    
    // 获取所有WAL文件，按时间排序
    auto wal_files = getWALFiles();
    
    for (const auto& wal_file : wal_files) {
        std::ifstream file(data_dir_ + "/" + wal_file);
        if (!file.is_open()) {
            logError("recoverFromWAL", "Cannot open WAL file: " + wal_file);
            continue;
        }
        
        std::string line;
        while (std::getline(file, line)) {
            if (line.empty()) continue;
            
            std::string manager_id;
            TransactionRecord trans;
            
            if (deserializeTransaction(line, manager_id, trans)) {
                data[manager_id].push_back(trans);
            } else {
                logError("recoverFromWAL", "Failed to parse line: " + line);
            }
        }
    }
    
    return data;
}

bool PersistenceManager::validateDataIntegrity(const std::unordered_map<std::string, std::vector<TransactionRecord>>& data) {
    for (const auto& manager_pair : data) {
        const auto& transactions = manager_pair.second;
        
        // 检查交易记录时间顺序
        for (size_t i = 1; i < transactions.size(); ++i) {
            if (transactions[i].timestamp < transactions[i-1].timestamp) {
                logError("validateDataIntegrity", "Timestamp order violation for manager: " + manager_pair.first);
                return false;
            }
        }
        
        // 检查必填字段
        for (const auto& trans : transactions) {
            if (trans.trans_id.empty() || trans.item_id.empty() || 
                (trans.type != "in" && trans.type != "out") ||
                trans.quantity <= 0) {
                logError("validateDataIntegrity", "Invalid transaction data: " + trans.trans_id);
                return false;
            }
        }
    }
    
    return true;
}

// ========== 快照管理 ==========

bool PersistenceManager::createSnapshot(const std::unordered_map<std::string, std::vector<TransactionRecord>>& data) {
    std::string snapshot_file = generateSnapshotFilename();
    std::string temp_file = snapshot_file + ".tmp";
    
    std::ofstream file(temp_file);
    if (!file.is_open()) {
        logError("createSnapshot", "Cannot create snapshot file: " + temp_file);
        return false;
    }
    
    try {
        // 写入快照头部信息
        file << "# Snapshot created at: " << getCurrentTimestamp() << std::endl;
        file << "# Format: JSON lines, one manager per line" << std::endl;
        
        // 为每个库管员写入JSON格式的数据
        for (const auto& manager_pair : data) {
            file << "{\"manager_id\":\"" << manager_pair.first << "\",\"transactions\":[";
            
            const auto& transactions = manager_pair.second;
            for (size_t i = 0; i < transactions.size(); ++i) {
                if (i > 0) file << ",";
                file << transactionToJSON(transactions[i]);
            }
            
            file << "]}" << std::endl;
        }
        
        file.flush();
        file.close();
        
        // 原子性重命名
        if (std::rename(temp_file.c_str(), snapshot_file.c_str()) != 0) {
            logError("createSnapshot", "Failed to rename temp file to snapshot");
            return false;
        }
        
        last_snapshot_time_ = getCurrentTimestamp();
        return true;
        
    } catch (const std::exception& e) {
        logError("createSnapshot", e.what());
        std::remove(temp_file.c_str());
        return false;
    }
}

std::unordered_map<std::string, std::vector<TransactionRecord>> PersistenceManager::recoverFromSnapshot() {
    std::unordered_map<std::string, std::vector<TransactionRecord>> data;
    
    auto snapshot_files = getSnapshotFiles();
    if (snapshot_files.empty()) {
        return data;  // 无快照文件
    }
    
    // 使用最新的快照文件
    std::string latest_snapshot = data_dir_ + "/" + snapshot_files.back();
    std::ifstream file(latest_snapshot);
    
    if (!file.is_open()) {
        logError("recoverFromSnapshot", "Cannot open snapshot file: " + latest_snapshot);
        return data;
    }
    
    std::string line;
    while (std::getline(file, line)) {
        if (line.empty() || line[0] == '#') continue;  // 跳过注释
        
        // 解析JSON行（简化版本，生产环境建议使用JSON库）
        // 这里省略具体的JSON解析实现...
        // 在实际项目中，建议使用nlohmann/json等库
    }
    
    return data;
}

// ========== 工具方法 ==========

bool PersistenceManager::initializeDataDirectory() {
    try {
        std::filesystem::create_directories(data_dir_);
        return std::filesystem::exists(data_dir_);
    } catch (const std::exception& e) {
        logError("initializeDataDirectory", e.what());
        return false;
    }
}

std::string PersistenceManager::getCurrentTimestamp() const {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    
    std::stringstream ss;
    ss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%S");
    ss << "." << std::setfill('0') << std::setw(3) << ms.count() << "Z";
    
    return ss.str();
}

std::string PersistenceManager::generateSnapshotFilename() const {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    
    std::stringstream ss;
    ss << data_dir_ << "/snapshot_" << std::put_time(std::gmtime(&time_t), "%Y%m%d_%H%M%S") << ".json";
    
    return ss.str();
}

std::string PersistenceManager::generateWALFilename() const {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    
    std::stringstream ss;
    ss << data_dir_ << "/wal_" << std::put_time(std::gmtime(&time_t), "%Y%m%d_%H%M%S") << ".log";
    
    return ss.str();
}

bool PersistenceManager::shouldCreateSnapshot() const {
    // 检查WAL文件大小
    std::filesystem::path wal_path(wal_file_path_);
    if (std::filesystem::exists(wal_path)) {
        auto file_size = std::filesystem::file_size(wal_path);
        if (file_size > wal_size_limit_) {
            return true;
        }
    }
    
    // 检查时间间隔
    if (!last_snapshot_time_.empty()) {
        // 简化版本：实际应该解析时间戳并比较
        // 这里省略具体的时间比较逻辑
    }
    
    return false;
}

std::vector<std::string> PersistenceManager::getWALFiles() const {
    std::vector<std::string> wal_files;
    
    for (const auto& entry : std::filesystem::directory_iterator(data_dir_)) {
        if (entry.is_regular_file()) {
            std::string filename = entry.path().filename().string();
            if (filename.ends_with(".wal") || filename.ends_with(".log")) {
                wal_files.push_back(filename);
            }
        }
    }
    
    std::sort(wal_files.begin(), wal_files.end());
    return wal_files;
}

std::vector<std::string> PersistenceManager::getSnapshotFiles() const {
    std::vector<std::string> snapshot_files;
    
    for (const auto& entry : std::filesystem::directory_iterator(data_dir_)) {
        if (entry.is_regular_file()) {
            std::string filename = entry.path().filename().string();
            if (filename.starts_with("snapshot_") && filename.ends_with(".json")) {
                snapshot_files.push_back(filename);
            }
        }
    }
    
    std::sort(snapshot_files.begin(), snapshot_files.end());
    return snapshot_files;
}

std::string PersistenceManager::transactionToJSON(const TransactionRecord& trans) const {
    std::ostringstream oss;
    oss << "{"
        << "\"trans_id\":\"" << trans.trans_id << "\","
        << "\"item_id\":\"" << trans.item_id << "\","
        << "\"item_name\":\"" << trans.item_name << "\","
        << "\"type\":\"" << trans.type << "\","
        << "\"quantity\":" << trans.quantity << ","
        << "\"unit_price\":" << trans.unit_price << ","
        << "\"category\":\"" << trans.category << "\","
        << "\"model\":\"" << trans.model << "\","
        << "\"unit\":\"" << trans.unit << "\","
        << "\"partner_id\":\"" << trans.partner_id << "\","
        << "\"partner_name\":\"" << trans.partner_name << "\","
        << "\"warehouse_id\":\"" << trans.warehouse_id << "\","
        << "\"document_no\":\"" << trans.document_no << "\","
        << "\"timestamp\":\"" << trans.timestamp << "\","
        << "\"note\":\"" << trans.note << "\""
        << "}";
    
    return oss.str();
}

bool PersistenceManager::acquireFileLock() {
    std::string lock_file = data_dir_ + "/.lock";
    lock_fd_ = open(lock_file.c_str(), O_CREAT | O_WRONLY, 0644);
    
    if (lock_fd_ == -1) {
        return false;
    }
    
    struct flock fl;
    fl.l_type = F_WRLCK;
    fl.l_whence = SEEK_SET;
    fl.l_start = 0;
    fl.l_len = 0;
    
    return fcntl(lock_fd_, F_SETLK, &fl) != -1;
}

void PersistenceManager::releaseFileLock() {
    if (lock_fd_ != -1) {
        close(lock_fd_);
        lock_fd_ = -1;
    }
}

void PersistenceManager::logError(const std::string& operation, const std::string& error) const {
    std::cerr << "[PersistenceManager::" << operation << "] Error: " << error << std::endl;
}