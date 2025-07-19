#!/bin/bash

echo "🧪 C++11仓库管理系统 - 全面安全测试套件"
echo "================================================="

# 检查目标服务器是否运行
check_server() {
    echo "🔍 检查目标服务器状态..."
    curl -s --connect-timeout 3 http://127.0.0.1:8080/api/system/status > /dev/null
    if [ $? -eq 0 ]; then
        echo "✅ 服务器运行正常"
        return 0
    else
        echo "❌ 服务器未响应，请先启动服务器"
        return 1
    fi
}

# 运行测试并记录结果
run_test() {
    local test_name=$1
    local test_binary=$2
    local test_args=$3
    
    echo ""
    echo "🚀 开始运行: $test_name"
    echo "================================================="
    
    if [ ! -f "bin/$test_binary" ]; then
        echo "❌ 测试程序 $test_binary 不存在，请先运行 ./compile_tests.sh"
        return 1
    fi
    
    # 记录开始时间
    start_time=$(date +%s)
    
    # 运行测试
    echo "执行: ./bin/$test_binary $test_args"
    echo "按Ctrl+C可以中断当前测试..."
    
    # 使用timeout避免测试程序卡死
    timeout 600 ./bin/$test_binary $test_args
    test_result=$?
    
    # 记录结束时间
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo ""
    if [ $test_result -eq 0 ]; then
        echo "✅ $test_name 完成 (耗时: ${duration}秒)"
    elif [ $test_result -eq 124 ]; then
        echo "⏰ $test_name 超时 (10分钟)"
    else
        echo "❌ $test_name 异常退出 (退出码: $test_result)"
    fi
    
    echo "================================================="
    return $test_result
}

# 主测试流程
main() {
    # 检查服务器
    if ! check_server; then
        exit 1
    fi
    
    echo ""
    echo "⚠️  警告: 即将运行破坏性安全测试！"
    echo "这些测试将尝试攻击、破坏和压垮目标系统。"
    echo "请确保："
    echo "1. 在隔离的测试环境中运行"
    echo "2. 已获得适当的测试授权"
    echo "3. 目标系统可以承受高负载"
    echo ""
    read -p "确认继续? (y/N): " confirm
    
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo "测试已取消"
        exit 0
    fi
    
    # 创建测试日志目录
    log_dir="test_logs_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$log_dir"
    
    echo ""
    echo "📝 测试日志将保存到: $log_dir/"
    
    # 记录系统信息
    echo "记录测试环境信息..."
    {
        echo "测试开始时间: $(date)"
        echo "系统信息: $(uname -a)"
        echo "CPU信息: $(cat /proc/cpuinfo | grep 'model name' | head -1)"
        echo "内存信息: $(free -h)"
        echo "目标服务器: 127.0.0.1:8080"
        echo ""
    } > "$log_dir/test_environment.log"
    
    # 运行各类测试
    total_tests=0
    passed_tests=0
    
    # 1. 边界条件测试（相对安全）
    echo "🔬 第一阶段: 边界条件测试"
    if run_test "边界条件测试" "boundary_test" "" 2>&1 | tee "$log_dir/boundary_test.log"; then
        ((passed_tests++))
    fi
    ((total_tests++))
    
    sleep 5
    check_server || echo "⚠️  服务器可能已崩溃"
    
    # 2. 并发负载测试
    echo ""
    echo "🔄 第二阶段: 并发负载测试"
    if run_test "并发负载测试" "concurrent_load_test" "--duration 120" 2>&1 | tee "$log_dir/concurrent_test.log"; then
        ((passed_tests++))
    fi
    ((total_tests++))
    
    sleep 10
    check_server || echo "⚠️  服务器可能已崩溃"
    
    # 3. 压力测试
    echo ""
    echo "💪 第三阶段: 高强度压力测试"
    if run_test "压力测试" "stress_test" "--threads 50 --requests 500 --duration 180" 2>&1 | tee "$log_dir/stress_test.log"; then
        ((passed_tests++))
    fi
    ((total_tests++))
    
    sleep 10
    check_server || echo "⚠️  服务器可能已崩溃"
    
    # 4. 安全攻击测试（如果存在）
    if [ -f "bin/security_attack_test" ]; then
        echo ""
        echo "🔥 第四阶段: 安全攻击测试"
        if run_test "安全攻击测试" "security_attack_test" "" 2>&1 | tee "$log_dir/security_test.log"; then
            ((passed_tests++))
        fi
        ((total_tests++))
        
        sleep 5
        check_server || echo "⚠️  服务器可能已崩溃"
    fi
    
    # 5. DoS攻击测试（如果存在）
    if [ -f "bin/dos_attack_test" ]; then
        echo ""
        echo "💥 第五阶段: DoS攻击测试"
        echo "⚠️  这可能会导致服务器崩溃！"
        read -p "继续DoS测试? (y/N): " dos_confirm
        
        if [[ $dos_confirm =~ ^[Yy]$ ]]; then
            if run_test "DoS攻击测试" "dos_attack_test" "" 2>&1 | tee "$log_dir/dos_test.log"; then
                ((passed_tests++))
            fi
            ((total_tests++))
        fi
    fi
    
    # 6. 恶意客户端测试（如果存在）
    if [ -f "bin/malicious_client" ]; then
        echo ""
        echo "😈 第六阶段: 恶意客户端测试"
        if run_test "恶意客户端测试" "malicious_client" "" 2>&1 | tee "$log_dir/malicious_client.log"; then
            ((passed_tests++))
        fi
        ((total_tests++))
    fi
    
    # 最终服务器状态检查
    echo ""
    echo "🔍 最终服务器状态检查..."
    if check_server; then
        echo "✅ 服务器在所有测试后仍然运行"
        server_survived=true
    else
        echo "❌ 服务器已崩溃或停止响应"
        server_survived=false
    fi
    
    # 生成最终报告
    echo ""
    echo "📊 测试完成 - 最终报告"
    echo "================================================="
    echo "测试总数: $total_tests"
    echo "通过测试: $passed_tests"
    echo "失败测试: $((total_tests - passed_tests))"
    echo "服务器存活: $([ "$server_survived" = true ] && echo "是" || echo "否")"
    echo "测试日志: $log_dir/"
    
    # 保存最终报告
    {
        echo "C++11仓库管理系统安全测试报告"
        echo "=================================="
        echo "测试完成时间: $(date)"
        echo "测试总数: $total_tests"
        echo "通过测试: $passed_tests"
        echo "失败测试: $((total_tests - passed_tests))"
        echo "服务器存活: $([ "$server_survived" = true ] && echo "是" || echo "否")"
        echo ""
        echo "安全评估:"
        
        if [ "$server_survived" = true ] && [ $passed_tests -eq $total_tests ]; then
            echo "✅ 系统表现良好，通过了所有安全测试"
        elif [ "$server_survived" = true ] && [ $passed_tests -gt $((total_tests / 2)) ]; then
            echo "⚠️  系统基本稳定，但存在一些问题需要修复"
        elif [ "$server_survived" = false ]; then
            echo "❌ 系统在测试中崩溃，存在严重安全或稳定性问题"
        else
            echo "❌ 系统未通过多项测试，需要全面安全审查"
        fi
        
        echo ""
        echo "建议:"
        echo "1. 检查所有测试日志中的错误和警告"
        echo "2. 修复发现的安全漏洞和稳定性问题"
        echo "3. 重新运行测试验证修复效果"
        echo "4. 考虑添加更多的输入验证和错误处理"
        
    } > "$log_dir/final_report.txt"
    
    echo ""
    echo "📝 详细报告已保存到: $log_dir/final_report.txt"
    echo ""
    
    if [ "$server_survived" = false ]; then
        echo "🔴 注意: 服务器已崩溃，请检查服务器日志！"
        exit 1
    elif [ $passed_tests -ne $total_tests ]; then
        echo "🟡 注意: 部分测试失败，请检查测试日志！"
        exit 2
    else
        echo "🟢 所有测试通过，系统安全性良好！"
        exit 0
    fi
}

# 运行主程序
main "$@"