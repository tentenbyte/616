#include "item.h"

Item::Item() : id_(0), name_(""), description_(""), price_(0.0), quantity_(0) {
}

Item::Item(int id, const std::string& name, const std::string& description, 
           double price, int quantity) 
    : id_(id), name_(name), description_(description), price_(price), quantity_(quantity) {
}

bool Item::addStock(int amount) {
    if (amount <= 0) {
        return false;
    }
    quantity_ += amount;
    return true;
}

bool Item::removeStock(int amount) {
    if (amount <= 0 || amount > quantity_) {
        return false;
    }
    quantity_ -= amount;
    return true;
}