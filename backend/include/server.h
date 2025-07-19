#ifndef SERVER_H
#define SERVER_H

#include <string>

class Server {
public:
    Server(int port);
    ~Server();
    
    bool start();
    void stop();
    bool isRunning() const;
    
private:
    int port_;
    bool running_;
};

#endif // SERVER_H