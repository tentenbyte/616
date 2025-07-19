#ifndef TRANSACTION_H
#define TRANSACTION_H

#include <string>
#include <vector>
#include <unordered_map>
#include <map>

// 交易记录结构体 - 唯一的数据源
struct TransactionRecord {
    // 基础信息
    std::string trans_id;        // 交易ID (唯一标识)
    std::string item_id;         // 物品ID
    std::string item_name;       // 物品名称
    std::string type;            // "in" 或 "out"
    int quantity;                // 数量
    std::string timestamp;       // 时间戳 (ISO 8601格式)
    std::string manager_id;      // 库管员ID
    std::string note;            // 备注信息
    
    // 物品属性
    std::string category;        // 物品分类
    std::string model;           // 物品型号
    std::string unit;            // 计量单位
    double unit_price;           // 单价
    
    // 业务对象
    std::string partner_id;      // 供应商ID(入库) / 客户ID(出库)
    std::string partner_name;    // 供应商名称 / 客户名称
    
    // 位置信息
    std::string warehouse_id;    // 仓库位置
    
    // 单据信息
    std::string document_no;     // 单据号 (关联多个交易记录)
    
    // 构造函数
    TransactionRecord() : quantity(0), unit_price(0.0) {}
    
    // 计算总金额
    double getTotalAmount() const {
        return quantity * unit_price;
    }
    
    // 判断是否为入库
    bool isInbound() const {
        return type == "in";
    }
    
    // 判断是否为出库
    bool isOutbound() const {
        return type == "out";
    }
};

// 物品摘要 - 从交易记录计算得出
struct ItemSummary {
    std::string item_id;
    std::string item_name;
    std::string category;
    std::string model;
    std::string unit;
    double latest_price;         // 最新价格
    int total_quantity;          // 当前库存总量
    std::string last_updated;    // 最后更新时间
    
    ItemSummary() : latest_price(0.0), total_quantity(0) {}
};

// 库存记录 - 按仓库分组的库存
struct InventoryRecord {
    std::string item_id;
    std::string warehouse_id;
    int quantity;                // 该仓库中的数量
    double avg_price;            // 平均价格
    
    InventoryRecord() : quantity(0), avg_price(0.0) {}
};

// 单据摘要 - 从交易记录计算得出
struct DocumentSummary {
    std::string document_no;
    std::string type;            // "in" 或 "out"
    std::string partner_id;
    std::string partner_name;
    std::string manager_id;
    std::string timestamp;
    double total_amount;         // 单据总金额
    int item_count;              // 物品种类数
    
    DocumentSummary() : total_amount(0.0), item_count(0) {}
};

#endif // TRANSACTION_H