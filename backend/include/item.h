#ifndef ITEM_H
#define ITEM_H

#include <string>

class Item {
public:
    Item();
    Item(int id, const std::string& name, const std::string& description, 
         double price, int quantity);
    
    // Getters
    int getId() const { return id_; }
    const std::string& getName() const { return name_; }
    const std::string& getDescription() const { return description_; }
    double getPrice() const { return price_; }
    int getQuantity() const { return quantity_; }
    
    // Setters
    void setId(int id) { id_ = id; }
    void setName(const std::string& name) { name_ = name; }
    void setDescription(const std::string& description) { description_ = description; }
    void setPrice(double price) { price_ = price; }
    void setQuantity(int quantity) { quantity_ = quantity; }
    
    // 库存操作
    bool addStock(int amount);
    bool removeStock(int amount);
    
private:
    int id_;
    std::string name_;
    std::string description_;
    double price_;
    int quantity_;
};

#endif // ITEM_H