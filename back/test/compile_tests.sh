#!/bin/bash

echo "🔨 编译安全和压力测试程序..."

# 创建bin目录
mkdir -p bin

# 编译标志
CXXFLAGS="-std=c++11 -pthread -O2 -Wall -Wextra"

# 编译所有测试程序
echo "编译压力测试..."
g++ $CXXFLAGS -o bin/stress_test stress_test.cpp
if [ $? -eq 0 ]; then
    echo "✅ stress_test 编译成功"
else
    echo "❌ stress_test 编译失败"
fi

echo "编译边界测试..."
g++ $CXXFLAGS -o bin/boundary_test boundary_test.cpp
if [ $? -eq 0 ]; then
    echo "✅ boundary_test 编译成功"
else
    echo "❌ boundary_test 编译失败"
fi

echo "编译并发负载测试..."
g++ $CXXFLAGS -o bin/concurrent_load_test concurrent_load_test.cpp
if [ $? -eq 0 ]; then
    echo "✅ concurrent_load_test 编译成功"
else
    echo "❌ concurrent_load_test 编译失败"
fi

# 检查是否有安全测试文件（由第一个Task创建）
if [ -f "security_attack_test.cpp" ]; then
    echo "编译安全攻击测试..."
    g++ $CXXFLAGS -o bin/security_attack_test security_attack_test.cpp
    if [ $? -eq 0 ]; then
        echo "✅ security_attack_test 编译成功"
    else
        echo "❌ security_attack_test 编译失败"
    fi
fi

if [ -f "malicious_client.cpp" ]; then
    echo "编译恶意客户端..."
    g++ $CXXFLAGS -o bin/malicious_client malicious_client.cpp
    if [ $? -eq 0 ]; then
        echo "✅ malicious_client 编译成功"
    else
        echo "❌ malicious_client 编译失败"
    fi
fi

if [ -f "dos_attack_test.cpp" ]; then
    echo "编译DoS攻击测试..."
    g++ $CXXFLAGS -o bin/dos_attack_test dos_attack_test.cpp
    if [ $? -eq 0 ]; then
        echo "✅ dos_attack_test 编译成功"
    else
        echo "❌ dos_attack_test 编译失败"
    fi
fi

echo ""
echo "📁 编译完成的测试程序："
ls -la bin/

echo ""
echo "🚀 使用方法："
echo "  ./bin/stress_test --help          # 压力测试"
echo "  ./bin/boundary_test --help        # 边界测试"
echo "  ./bin/concurrent_load_test --help # 并发测试"

if [ -f "bin/security_attack_test" ]; then
    echo "  ./bin/security_attack_test --help # 安全攻击测试"
fi

echo ""
echo "⚠️  运行测试前请确保目标服务器正在端口8080运行！"