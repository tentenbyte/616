#!/bin/bash

# 运行所有安全攻击测试的脚本
# 用法：./run_all_attacks.sh [服务器IP] [端口]

SERVER_HOST=${1:-"127.0.0.1"}
SERVER_PORT=${2:-"8080"}

echo "🔥 安全攻击测试套件"
echo "🎯 目标服务器: $SERVER_HOST:$SERVER_PORT"
echo "⚠️  警告：这些测试可能会导致服务器不稳定或崩溃！"
echo ""

# 检查服务器是否运行
echo "📡 检查服务器连接..."
if timeout 5 bash -c "</dev/tcp/$SERVER_HOST/$SERVER_PORT"; then
    echo "✅ 服务器连接正常"
else
    echo "❌ 无法连接到服务器 $SERVER_HOST:$SERVER_PORT"
    echo "请确保服务器正在运行！"
    exit 1
fi

echo ""
read -p "🤔 确认要开始安全攻击测试吗？(y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "🚫 测试已取消"
    exit 0
fi

echo ""
echo "🔥 开始安全攻击测试..."
echo "=========================================="

# 检查可执行文件是否存在
if [ ! -f "bin/security_attack_test" ] || [ ! -f "bin/malicious_client" ] || [ ! -f "bin/dos_attack_test" ]; then
    echo "❌ 找不到编译后的测试程序"
    echo "请先运行: ./compile_security_tests.sh"
    exit 1
fi

# 创建日志目录
mkdir -p logs
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo ""
echo "🚀 第一阶段：主要安全攻击测试"
echo "----------------------------------------"
./bin/security_attack_test 2>&1 | tee logs/security_attack_${TIMESTAMP}.log

echo ""
echo "⏳ 等待5秒让服务器恢复..."
sleep 5

echo ""
echo "🚀 第二阶段：恶意客户端攻击"
echo "----------------------------------------"
./bin/malicious_client 2>&1 | tee logs/malicious_client_${TIMESTAMP}.log

echo ""
echo "⏳ 等待10秒让服务器恢复..."
sleep 10

echo ""
echo "🚀 第三阶段：拒绝服务攻击测试"
echo "----------------------------------------"
echo "⚠️  这是最危险的测试阶段！"
read -p "🤔 确认要继续DoS攻击测试吗？(y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./bin/dos_attack_test 2>&1 | tee logs/dos_attack_${TIMESTAMP}.log
else
    echo "🚫 DoS攻击测试已跳过"
fi

echo ""
echo "=========================================="
echo "🏁 所有安全攻击测试完成！"
echo ""
echo "📊 测试结果日志保存在 logs/ 目录："
ls -la logs/*_${TIMESTAMP}.log 2>/dev/null || echo "没有生成日志文件"

echo ""
echo "🔍 后续检查建议："
echo "1. 检查服务器日志是否有异常"
echo "2. 监控服务器内存和CPU使用情况"
echo "3. 验证服务器是否仍能正常响应"
echo "4. 检查是否有内存泄漏"
echo "5. 分析攻击日志中的漏洞报告"

echo ""
echo "📡 最终服务器状态检查..."
if timeout 5 bash -c "</dev/tcp/$SERVER_HOST/$SERVER_PORT"; then
    echo "✅ 服务器仍在运行"
else
    echo "❌ 服务器无响应 - 可能已崩溃！"
fi