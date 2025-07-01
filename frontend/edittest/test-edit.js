// 编辑模块测试脚本
let testData, testRenderer, testCellEditor;
let debugLog = [];

// 调试日志函数
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    debugLog.push(logMessage);
    updateDebugDisplay();
    console.log(logMessage);
}

function updateDebugDisplay() {
    const logElement = document.getElementById('debugLog');
    if (logElement) {
        logElement.textContent = debugLog.join('\n');
        logElement.scrollTop = logElement.scrollHeight;
    }
}

function clearLog() {
    debugLog = [];
    updateDebugDisplay();
}

// 初始化测试
function initializeTest() {
    try {
        log('初始化测试数据结构...');
        
        // 创建测试数据结构（5行4列）
        testData = new TableDataStructures(5, 4);
        
        // 添加一些测试数据
        const testValues = [
            ['时间', '开盘', '最高', '最低'],
            ['09:30', '100.0', '102.0', '99.5'],
            ['10:00', '101.5', '103.0', '100.8'],
            ['10:30', '102.0', '104.0', '101.2']
        ];
        
        // 临时解除编辑限制来加载测试数据
        const originalSetCellValue = testData.setCellValue;
        testData.setCellValue = function(row, col, value) {
            if (row >= this.rows || col >= this.cols || row < 0 || col < 0) {
                throw new Error(`Cell position out of bounds: (${row}, ${col})`);
            }
            const stringIndex = this.addString(value);
            const cellIndex = col * this.rows + row;
            this.cellDataView[cellIndex] = stringIndex;
        };
        
        // 加载测试数据
        for (let row = 0; row < testValues.length; row++) {
            for (let col = 0; col < testValues[row].length; col++) {
                testData.setCellValue(row, col, testValues[row][col]);
            }
        }
        
        // 设置当前行数
        testData.currentRowCount = testValues.length;
        
        // 恢复编辑限制
        testData.setCellValue = originalSetCellValue;
        
        log(`测试数据加载完成，当前行数: ${testData.currentRowCount}`);
        
        // 初始化渲染器
        const canvas = document.getElementById('testCanvas');
        if (!canvas) {
            throw new Error('Canvas element not found');
        }
        
        testRenderer = new CanvasTableRenderer(canvas, testData);
        log('Canvas渲染器初始化完成');
        
        // 初始化单元格编辑器
        testCellEditor = new CellEditor(canvas.parentElement, testRenderer, testData);
        log('CellEditor初始化完成');
        
        // 设置编辑器回调
        setupEditorCallbacks();
        
        // 设置事件监听
        setupEventListeners();
        
        // 首次渲染
        testRenderer.render();
        log('首次渲染完成');
        
        // 显示数据结构信息
        showDataStructure();
        
    } catch (error) {
        log(`初始化失败: ${error.message}`);
        console.error('初始化错误:', error);
    }
}

// 设置编辑器回调
function setupEditorCallbacks() {
    testCellEditor.onEditStart = (row, col, value) => {
        log(`开始编辑单元格 (${row}, ${col}), 当前值: "${value}"`);
    };
    
    testCellEditor.onEditComplete = (row, col, newValue) => {
        log(`编辑完成 (${row}, ${col}), 新值: "${newValue}"`);
        testRenderer.render();
    };
    
    testCellEditor.onEditCancel = (row, col) => {
        log(`取消编辑 (${row}, ${col})`);
    };
    
    testCellEditor.onRequestNewRow = () => {
        log('请求追加新行');
        const newRowIndex = testData.appendRow();
        testRenderer.render();
        log(`已追加新行，行索引: ${newRowIndex}`);
    };
}

// 设置事件监听
function setupEventListeners() {
    const canvas = document.getElementById('testCanvas');
    
    // 单击选择
    testRenderer.onCellSelected = (row, col) => {
        log(`选中单元格 (${row}, ${col}), 值: "${testData.getCellValue(row, col)}"`);
    };
    
    // 双击编辑
    canvas.addEventListener('dblclick', (e) => {
        log('检测到双击事件');
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        log(`双击位置: (${x.toFixed(1)}, ${y.toFixed(1)})`);
        
        const cell = testRenderer.getCellFromPosition(x, y);
        log(`计算得到单元格: (${cell.row}, ${cell.col})`);
        
        if (cell.row >= 0 && cell.col >= 0) {
            log(`尝试开始编辑单元格 (${cell.row}, ${cell.col})`);
            const success = testCellEditor.startEdit(cell.row, cell.col);
            log(`编辑启动${success ? '成功' : '失败'}`);
        } else {
            log('双击位置不在有效单元格内');
        }
    });
    
    // Enter键编辑
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !testCellEditor.isEditing) {
            const selected = testRenderer.getSelectedCell();
            if (selected.row >= 0 && selected.col >= 0) {
                log(`Enter键触发编辑 (${selected.row}, ${selected.col})`);
                const success = testCellEditor.startEdit(selected.row, selected.col);
                log(`编辑启动${success ? '成功' : '失败'}`);
                e.preventDefault();
            }
        }
    });
}

// 测试函数
function testEditCell(row, col) {
    log(`手动测试编辑单元格 (${row}, ${col})`);
    
    // 检查单元格是否可编辑
    const canEdit = testCellEditor.canEditCell(row, col);
    log(`单元格 (${row}, ${col}) ${canEdit ? '可以' : '不可以'} 编辑`);
    
    if (canEdit) {
        const success = testCellEditor.startEdit(row, col);
        log(`编辑启动${success ? '成功' : '失败'}`);
    }
}

function testEditLastRow() {
    const lastRow = testData.currentRowCount - 1;
    log(`测试编辑最后一行 (${lastRow}, 0)`);
    testEditCell(lastRow, 0);
}

function showDataStructure() {
    log('=== 数据结构信息 ===');
    log(`总行数: ${testData.rows}`);
    log(`总列数: ${testData.cols}`);
    log(`当前行数: ${testData.currentRowCount}`);
    log(`字符串数量: ${testData.stringArray.length}`);
    log(`字符串映射数量: ${testData.stringToIndexMap.size}`);
    
    log('=== 当前数据内容 ===');
    for (let row = 0; row < testData.currentRowCount; row++) {
        const rowData = [];
        for (let col = 0; col < testData.cols; col++) {
            rowData.push(`"${testData.getCellValue(row, col)}"`);
        }
        log(`第${row}行: [${rowData.join(', ')}]`);
    }
    
    log('=== 编辑限制检查 ===');
    for (let row = 0; row < testData.currentRowCount; row++) {
        const canEdit = testCellEditor.canEditCell(row, 0);
        log(`第${row}行 ${canEdit ? '可编辑' : '不可编辑'}`);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    log('页面加载完成，开始初始化测试...');
    setTimeout(initializeTest, 100);
});

// 导出到全局作用域以便调试
window.testDebug = {
    data: () => testData,
    renderer: () => testRenderer,
    editor: () => testCellEditor,
    log: log,
    showDataStructure: showDataStructure
};