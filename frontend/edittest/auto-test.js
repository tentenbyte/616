// 自动化测试脚本 - 直接在浏览器中运行
// 使用方法：在浏览器控制台中运行 runEditTests()

function runEditTests() {
    console.log('🚀 开始自动化编辑测试...');
    
    // 检查必要的对象是否存在
    if (typeof tableApp === 'undefined') {
        console.error('❌ tableApp 未定义，请确保主应用已加载');
        return;
    }
    
    const app = tableApp;
    const data = app.dataStructures;
    const renderer = app.renderer;
    const editor = app.cellEditor;
    
    console.log('📊 应用状态检查:');
    console.log(`  数据行数: ${data.currentRowCount}`);
    console.log(`  可编辑行: ${data.currentRowCount - 1}`);
    console.log(`  编辑器状态: ${editor.isEditing ? '正在编辑' : '未编辑'}`);
    
    // 测试1: 模拟双击最后一行
    setTimeout(() => {
        console.log('\n🖱️ 测试1: 模拟双击最后一行');
        simulateDoubleClick(renderer.canvas, data.currentRowCount - 1, 0);
    }, 1000);
    
    // 测试2: 模拟双击第一行（应该失败）
    setTimeout(() => {
        console.log('\n🚫 测试2: 模拟双击第一行（应该失败）');
        simulateDoubleClick(renderer.canvas, 0, 0);
    }, 3000);
    
    // 测试3: 手动调用编辑
    setTimeout(() => {
        console.log('\n✏️ 测试3: 手动调用编辑');
        const lastRow = data.currentRowCount - 1;
        const success = editor.startEdit(lastRow, 1);
        console.log(`手动编辑结果: ${success ? '✅ 成功' : '❌ 失败'}`);
    }, 5000);
    
    // 测试4: 检查输入框是否创建
    setTimeout(() => {
        console.log('\n🔍 测试4: 检查页面上的输入框');
        const inputs = document.querySelectorAll('.cell-editor-input');
        console.log(`找到 ${inputs.length} 个编辑器输入框`);
        inputs.forEach((input, index) => {
            console.log(`  输入框${index}: 显示=${input.style.display}, 值="${input.value}"`);
        });
    }, 7000);
}

function simulateDoubleClick(canvas, targetRow, targetCol) {
    console.log(`  目标单元格: (${targetRow}, ${targetCol})`);
    
    // 计算单元格中心位置
    const renderer = tableApp.renderer;
    const cellWidth = renderer.config.cellWidth;
    const cellHeight = renderer.config.cellHeight;
    const headerHeight = renderer.config.headerHeight;
    
    const x = targetCol * cellWidth + cellWidth / 2 - renderer.scrollX;
    const y = headerHeight + targetRow * cellHeight + cellHeight / 2 - renderer.scrollY;
    
    console.log(`  计算位置: (${x.toFixed(1)}, ${y.toFixed(1)})`);
    
    // 检查位置是否在画布内
    const rect = canvas.getBoundingClientRect();
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        console.log(`  ⚠️ 位置超出画布范围`);
    }
    
    // 创建双击事件
    const event = new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
        button: 0
    });
    
    console.log(`  🖱️ 触发双击事件...`);
    canvas.dispatchEvent(event);
    
    // 检查结果
    setTimeout(() => {
        const cell = renderer.getCellFromPosition(x, y);
        console.log(`  计算得到单元格: (${cell.row}, ${cell.col})`);
        
        const isEditing = tableApp.cellEditor.isEditing;
        console.log(`  编辑状态: ${isEditing ? '✅ 正在编辑' : '❌ 未编辑'}`);
        
        if (isEditing) {
            const editingCell = tableApp.cellEditor.getEditingCell();
            console.log(`  正在编辑: (${editingCell.row}, ${editingCell.col})`);
        }
    }, 500);
}

// 诊断函数
function diagnoseProblem() {
    console.log('🔧 问题诊断开始...');
    
    if (typeof tableApp === 'undefined') {
        console.error('❌ tableApp 未定义');
        return;
    }
    
    const app = tableApp;
    
    console.log('1. 数据结构检查:');
    console.log(`   currentRowCount: ${app.dataStructures.currentRowCount}`);
    console.log(`   cols: ${app.dataStructures.cols}`);
    
    console.log('2. 渲染器检查:');
    console.log(`   canvas 存在: ${!!app.renderer.canvas}`);
    console.log(`   配置: cellWidth=${app.renderer.config.cellWidth}, cellHeight=${app.renderer.config.cellHeight}`);
    
    console.log('3. 编辑器检查:');
    console.log(`   CellEditor 存在: ${!!app.cellEditor}`);
    console.log(`   canEditCell 方法存在: ${typeof app.cellEditor.canEditCell === 'function'}`);
    console.log(`   startEdit 方法存在: ${typeof app.cellEditor.startEdit === 'function'}`);
    
    console.log('4. 事件监听器检查:');
    const canvas = app.renderer.canvas;
    const listeners = getEventListeners ? getEventListeners(canvas) : '需要在Chrome DevTools中运行getEventListeners(canvas)';
    console.log(`   Canvas事件监听器:`, listeners);
    
    console.log('5. 最后一行编辑测试:');
    const lastRow = app.dataStructures.currentRowCount - 1;
    try {
        const canEdit = app.cellEditor.canEditCell(lastRow, 0);
        console.log(`   canEditCell(${lastRow}, 0): ${canEdit}`);
        
        if (canEdit) {
            console.log('   尝试开始编辑...');
            const success = app.cellEditor.startEdit(lastRow, 0);
            console.log(`   startEdit 结果: ${success}`);
            
            if (success) {
                // 立即取消编辑
                app.cellEditor.cancelEdit();
                console.log('   已取消编辑');
            }
        }
    } catch (error) {
        console.error('   编辑测试出错:', error);
    }
}

// 监控编辑器状态
function monitorEditor() {
    if (typeof tableApp === 'undefined') {
        console.error('❌ tableApp 未定义');
        return;
    }
    
    const editor = tableApp.cellEditor;
    
    // 备份原始方法
    const originalStartEdit = editor.startEdit.bind(editor);
    const originalCanEditCell = editor.canEditCell.bind(editor);
    const originalCreateInputElement = editor.createInputElement.bind(editor);
    
    // 添加监控
    editor.startEdit = function(row, col, initialValue) {
        console.log(`📝 startEdit 被调用: (${row}, ${col}), initialValue="${initialValue}"`);
        const result = originalStartEdit(row, col, initialValue);
        console.log(`📝 startEdit 返回: ${result}`);
        return result;
    };
    
    editor.canEditCell = function(row, col) {
        const result = originalCanEditCell(row, col);
        console.log(`🔍 canEditCell(${row}, ${col}) = ${result}`);
        return result;
    };
    
    editor.createInputElement = function(value) {
        console.log(`🎨 createInputElement 被调用, value="${value}"`);
        const result = originalCreateInputElement(value);
        console.log(`🎨 输入框已创建:`, this.inputElement);
        return result;
    };
    
    console.log('✅ 编辑器监控已启用');
}

// 导出到全局
window.editTestUtils = {
    runEditTests,
    diagnoseProblem,
    simulateDoubleClick,
    monitorEditor
};

console.log('🔧 编辑测试工具已加载');
console.log('使用方法:');
console.log('  runEditTests() - 运行自动化测试');
console.log('  diagnoseProblem() - 诊断问题');
console.log('  monitorEditor() - 监控编辑器调用');