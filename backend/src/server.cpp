#include "server.h"
#include <iostream>

Server::Server(int port) : port_(port), running_(false) {
}

Server::~Server() {
    if (running_) {
        stop();
    }
}

bool Server::start() {
    if (running_) {
        return false;
    }
    
    std::cout << "Starting server on port " << port_ << std::endl;
    running_ = true;
    
    // 这里可以添加实际的服务器启动逻辑
    
    return true;
}

void Server::stop() {
    if (!running_) {
        return;
    }
    
    std::cout << "Stopping server..." << std::endl;
    running_ = false;
}

bool Server::isRunning() const {
    return running_;
}