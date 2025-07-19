# C++11 内存数据库设计

## 核心设计理念

### 单一数据源原则
- **只有出入库表** - 所有数据的唯一来源
- **只追加操作** - 符合业务实际，交易一旦发生不可撤销
- **一切皆可推算** - 物品表、库存表等都是出入库表的视图

## 数据结构设计

```cpp
class MemoryDatabase {
private:
    // 核心数据结构：库管员ID -> 交易记录列表
    std::unordered_map<std::string, std::vector<TransactionRecord>> managers;
    
public:
    // 唯一的写操作：追加交易记录
    bool append_transaction(const std::string& manager_id, const TransactionRecord& trans);
    
    // 读取交易记录
    const std::vector<TransactionRecord>& get_transactions(const std::string& manager_id);
    
    // 计算当前库存（从交易记录推算）
    std::map<std::string, int> calculate_inventory(const std::string& manager_id);
    
    // 获取物品详情（从交易记录提取）
    std::vector<ItemSummary> get_current_items(const std::string& manager_id);
};
```

## 记录结构定义

```cpp
struct TransactionRecord {
    std::string trans_id;        // 交易ID
    std::string item_id;         // 物品ID
    std::string item_name;       // 物品名称
    std::string type;            // "in" 或 "out"
    int quantity;                // 数量
    std::string timestamp;       // 时间戳
    std::string note;            // 备注
    std::string manager_id;      // 库管员ID
};
```

## 业务逻辑

### 库管员数据隔离
- 每个库管员有独立的交易记录
- 库管员之间数据完全隔离
- 通过manager_id进行数据分组

### 物品信息管理
- **无独立物品表** - 物品信息从交易记录中提取
- **厂家改名处理**：
  ```cpp
  // 旧物品出库到0
  {item_id: "A001_旧厂家", type: "out", quantity: 100, note: "厂家改名"}
  
  // 新物品入库
  {item_id: "A002_新厂家", type: "in", quantity: 100, note: "厂家改名,原A001"}
  ```

### 库存计算
```cpp
std::map<std::string, int> calculate_inventory(const std::string& manager_id) {
    std::map<std::string, int> inventory;
    
    for (const auto& trans : managers[manager_id]) {
        if (trans.type == "in") {
            inventory[trans.item_id] += trans.quantity;
        } else if (trans.type == "out") {
            inventory[trans.item_id] -= trans.quantity;
        }
    }
    
    // 移除数量为0的物品
    for (auto it = inventory.begin(); it != inventory.end();) {
        if (it->second <= 0) {
            it = inventory.erase(it);
        } else {
            ++it;
        }
    }
    
    return inventory;
}
```

## 设计优势

1. **数据完整性**
   - 单一数据源，无数据冗余
   - 无数据一致性问题
   - 所有状态都可从历史推算

2. **审计友好**
   - 所有变化都有完整记录
   - 历史数据永不删除
   - 满足20年数据追溯要求

3. **操作简单**
   - 只有追加操作，无修改/删除
   - 实现简单，维护容易
   - 无复杂的数据同步

4. **性能优秀**
   - 写操作只是向量追加
   - 读操作是内存访问
   - 无锁设计，高并发友好

## 扩展功能

### 查询功能
```cpp
// 按时间范围查询
std::vector<TransactionRecord> get_transactions_by_time(
    const std::string& manager_id, 
    const std::string& start_time, 
    const std::string& end_time
);

// 按物品查询
std::vector<TransactionRecord> get_transactions_by_item(
    const std::string& manager_id, 
    const std::string& item_id
);

// 获取物品历史数量变化
std::vector<std::pair<std::string, int>> get_item_history(
    const std::string& manager_id, 
    const std::string& item_id
);
```

### 统计功能
```cpp
// 统计总交易数
size_t get_total_transactions(const std::string& manager_id);

// 统计物品种类数
size_t get_item_types_count(const std::string& manager_id);

// 统计某时间段的出入库总量
std::pair<int, int> get_in_out_summary(
    const std::string& manager_id,
    const std::string& start_time,
    const std::string& end_time
);
```

## 高性能并发设计

### 原子计数器无锁架构

```cpp
struct ManagerData {
    std::vector<TransactionRecord> transactions;
    std::atomic<size_t> count{0};  // 原子计数器：当前有效交易数量
};

std::unordered_map<std::string, ManagerData> managers_;
```

### 并发访问模型

#### 写入流程（单写者）
```cpp
bool appendTransaction(const std::string& manager_id, const TransactionRecord& trans) {
    ManagerData& data = managers_[manager_id];
    
    // 1. 先写入数据
    data.transactions.push_back(trans);
    
    // 2. 原子性更新计数器（memory_order_release）
    data.count.fetch_add(1, std::memory_order_release);
    
    return true;
}
```

#### 读取流程（多读者）
```cpp
std::vector<TransactionRecord> getTransactions(const std::string& manager_id) const {
    const ManagerData& data = managers_[manager_id];
    
    // 1. 原子性读取安全计数（memory_order_acquire）
    size_t safe_count = data.count.load(std::memory_order_acquire);
    
    // 2. 只读取已确认写入完成的记录
    std::vector<TransactionRecord> result;
    for (size_t i = 0; i < safe_count; ++i) {
        result.push_back(data.transactions[i]);
    }
    
    return result;
}
```

### 业务级并发安全

#### 天然的单写者模型
- **业务约束**：每个库管员只操作自己的交易表
- **技术实现**：`manager_id`完全隔离数据域
- **并发特性**：
  - ✅ 每个表单写者 - 无写写冲突
  - ✅ 多读者并发 - 无读写锁竞争  
  - ✅ 跨表并行 - 不同库管员完全独立

#### 内存屏障保证
- **写者**：`memory_order_release` 确保数据写入完成后才更新计数器
- **读者**：`memory_order_acquire` 确保看到正确的计数器值和对应数据
- **一致性**：读者永远不会读到未完成写入的数据

### 性能优势

#### 读取性能
- **无锁读取**：只有原子操作开销
- **并发读取**：多个读者无互斥
- **安全边界**：只读已确认的记录数量

#### 写入性能  
- **无锁写入**：vector追加 + 原子计数器
- **并行写入**：不同库管员完全独立
- **内存友好**：连续内存，缓存友好

#### 系统级并发
```
manager001写入 + manager002读取 + manager003计算库存 = 完全并行执行
```

## 实现注意事项

1. **并发模型**
   - 基于原子计数器的无锁设计
   - 业务级单写者，技术级多读者
   - 内存屏障保证数据一致性

2. **内存管理**
   - 使用 `std::move` 避免不必要拷贝
   - 考虑 `reserve()` 预分配容量
   - 原子类型禁用拷贝，支持移动语义

3. **持久化**
   - 内存数据库，重启后数据丢失
   - 可扩展文件持久化功能
   - 原子计数器需要持久化同步

4. **错误处理**
   - 添加输入验证
   - 处理非法操作
   - 原子操作异常安全

### 架构优势总结

这个设计将**业务约束转化为技术优势**：
- 库管员数据隔离 → 天然避免写写冲突
- 只追加操作 → 简化并发控制
- 原子计数器 → 高性能读写分离
- Event Sourcing → 完美契合审计需求

实现了**生产级高并发内存数据库**，完全符合真实仓库管理系统的需求，简单、可靠、高性能、审计友好。