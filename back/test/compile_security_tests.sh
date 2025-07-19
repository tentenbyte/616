#!/bin/bash

# 安全测试编译脚本
# 用法：./compile_security_tests.sh

echo "🔧 编译安全测试程序..."

# 编译器选项
CXX="g++"
CXXFLAGS="-std=c++11 -O2 -Wall -Wextra -pthread"

# 创建输出目录
mkdir -p bin

echo "📁 编译 security_attack_test.cpp..."
if $CXX $CXXFLAGS -o bin/security_attack_test security_attack_test.cpp; then
    echo "✅ security_attack_test 编译成功"
else
    echo "❌ security_attack_test 编译失败"
    exit 1
fi

echo "📁 编译 malicious_client.cpp..."
if $CXX $CXXFLAGS -o bin/malicious_client malicious_client.cpp; then
    echo "✅ malicious_client 编译成功"
else
    echo "❌ malicious_client 编译失败"
    exit 1
fi

echo "📁 编译 dos_attack_test.cpp..."
if $CXX $CXXFLAGS -o bin/dos_attack_test dos_attack_test.cpp; then
    echo "✅ dos_attack_test 编译成功"
else
    echo "❌ dos_attack_test 编译失败"
    exit 1
fi

echo ""
echo "🎉 所有安全测试程序编译完成！"
echo ""
echo "📋 可执行文件位置："
echo "   bin/security_attack_test  - 主要安全攻击测试"
echo "   bin/malicious_client      - 恶意客户端模拟"
echo "   bin/dos_attack_test       - 拒绝服务攻击测试"
echo ""
echo "⚠️  警告：这些工具仅用于安全测试！"
echo "   请确保只在测试环境中运行！"
echo ""
echo "🚀 使用方法："
echo "   ./bin/security_attack_test"
echo "   ./bin/malicious_client"
echo "   ./bin/dos_attack_test"