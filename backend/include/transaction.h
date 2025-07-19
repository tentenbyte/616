#ifndef TRANSACTION_H
#define TRANSACTION_H

#include <string>
#include <ctime>

enum class TransactionType {
    IN,  // 入库
    OUT  // 出库
};

class Transaction {
public:
    Transaction();
    Transaction(int id, int itemId, TransactionType type, int quantity, 
                const std::string& description, time_t timestamp = 0);
    
    // Getters
    int getId() const { return id_; }
    int getItemId() const { return itemId_; }
    TransactionType getType() const { return type_; }
    int getQuantity() const { return quantity_; }
    const std::string& getDescription() const { return description_; }
    time_t getTimestamp() const { return timestamp_; }
    
    // Setters
    void setId(int id) { id_ = id; }
    void setItemId(int itemId) { itemId_ = itemId; }
    void setType(TransactionType type) { type_ = type; }
    void setQuantity(int quantity) { quantity_ = quantity; }
    void setDescription(const std::string& description) { description_ = description; }
    void setTimestamp(time_t timestamp) { timestamp_ = timestamp; }
    
    // 工具方法
    std::string getTypeString() const;
    std::string getTimestampString() const;
    
private:
    int id_;
    int itemId_;
    TransactionType type_;
    int quantity_;
    std::string description_;
    time_t timestamp_;
};

#endif // TRANSACTION_H