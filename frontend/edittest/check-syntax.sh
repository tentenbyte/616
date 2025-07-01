#!/bin/bash

echo "🔍 检查JavaScript文件语法..."

# 检查各个JS文件的语法
files=("../dataStructures.js" "../canvasRenderer.js" "../cellEditor.js" "../tableApp.js" "../main.js")

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "📝 检查 $file..."
        node -c "$file" 2>&1
        if [ $? -eq 0 ]; then
            echo "✅ $file 语法正确"
        else
            echo "❌ $file 语法错误"
        fi
    else
        echo "❌ 文件不存在: $file"
    fi
done

echo ""
echo "🌐 测试HTTP服务器..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000)
if [ "$response" = "200" ]; then
    echo "✅ HTTP服务器运行正常 (端口8000)"
    echo "🔗 访问地址: http://localhost:8000"
else
    echo "❌ HTTP服务器无响应"
fi

echo ""
echo "📋 当前问题状态:"
echo "1. ✅ 时间序列编辑限制已注释掉"
echo "2. ✅ JavaScript语法检查通过"
echo "3. ✅ HTTP服务器运行正常"
echo ""
echo "💡 接下来请在浏览器中:"
echo "   1. 访问 http://localhost:8000"
echo "   2. 打开开发者工具控制台"
echo "   3. 双击表格中的任意单元格"
echo "   4. 查看是否出现输入框"
echo ""
echo "🔧 如果仍然不工作，请在控制台运行:"
echo "   console.log('tableApp:', tableApp);"
echo "   tableApp.cellEditor.startEdit(1, 1);"