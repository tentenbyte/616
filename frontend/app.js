// 库存管理系统主应用
const InventoryApp = {
    // 初始化应用
    init() {
        try {
            // 初始化渲染器
            InventoryRenderer.init('tableCanvas');
            
            // 设置事件监听器
            this.setupEventListeners();
            
            // 首次渲染
            this.refresh();
            
            // 更新UI状态
            this.updateUI();
            
            console.log('库存管理系统初始化成功');
        } catch (error) {
            console.error('库存管理系统初始化失败:', error);
            this.updateStatus('初始化失败: ' + error.message);
        }
    },
    
    // 设置事件监听器
    setupEventListeners() {
        // 表格切换按钮
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tableType = e.target.dataset.table;
                this.switchTable(tableType);
            });
        });
        
        // 功能按钮
        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => {
                this.addNewItem();
            });
        }
        
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportData();
            });
        }
        
        // 状态栏操作
        const saveAction = document.getElementById('save-action');
        if (saveAction) {
            saveAction.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveData();
            });
        }
        
        const refreshAction = document.getElementById('refresh-action');
        if (refreshAction) {
            refreshAction.addEventListener('click', (e) => {
                e.preventDefault();
                this.refresh();
            });
        }
        
        const helpAction = document.getElementById('help-action');
        if (helpAction) {
            helpAction.addEventListener('click', (e) => {
                e.preventDefault();
                this.showHelp();
            });
        }
        
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    },
    
    
    // 切换表格类型
    switchTable(tableType) {
        InventoryData.setTableType(tableType);
        
        // 更新tab按钮状态
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.classList.remove('active');
            if (button.dataset.table === tableType) {
                button.classList.add('active');
            }
        });
        
        // 更新添加按钮文本
        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) {
            addItemBtn.textContent = tableType === 'items' ? '添加物品' : '添加交易';
        }
        
        // 清除筛选和排序
        InventoryData.clearFiltersAndSort();
        
        // 重新计算列宽
        InventoryRenderer.calculateColumnWidths();
        
        this.refresh();
        this.updateUI();
        this.updateStatus(`已切换到 ${InventoryData.getCurrentTableName()}`);
    },
    
    // 刷新表格
    refresh() {
        InventoryRenderer.render();
    },
    
    // 更新UI状态
    updateUI() {
        // 表格标题已移除
    },
    
    // 单元格选择回调
    onCellSelected(row, col) {
        const cellValue = InventoryData.getCellData(row, col);
        const columnHeader = InventoryData.getCellData(0, col);
        
        this.updateStatus(`选中单元格: ${columnHeader} (第${row + 1}行) = "${cellValue}"`);
    },
    
    // 添加新项目
    addNewItem() {
        const currentTable = InventoryData.currentTable;
        let newItem;
        
        if (currentTable === 'items') {
            // 生成新的物品编号
            const existingItems = InventoryData.getCurrentData();
            const newId = `ITM${String(existingItems.length).padStart(3, '0')}`;
            
            newItem = [
                newId,
                '新物品',
                '未分类',
                '标准',
                '个',
                '0',
                '0.00',
                '0.00',
                '待确认',
                new Date().toISOString().split('T')[0]
            ];
        } else {
            // 添加新交易记录
            newItem = [
                '',
                '',
                '入库',
                '0',
                '0.00',
                '0.00',
                '系统',
                new Date().toISOString().replace('T', ' ').split('.')[0],
                '新增交易'
            ];
        }
        
        InventoryData.addNewItem(newItem);
        this.refresh();
        this.updateUI();
        
        // 选中新添加的行
        const newRowIndex = InventoryData.getCurrentData().length - 1;
        InventoryRenderer.setSelectedCell(newRowIndex, 1);
        InventoryRenderer.scrollToSelected();
        
        this.updateStatus(`已添加新的${currentTable === 'items' ? '物品' : '交易'}记录`);
    },
    
    // 导出数据
    exportData() {
        const data = InventoryData.getCurrentData();
        const tableName = InventoryData.getCurrentTableName();
        
        // 创建CSV格式数据
        const csvContent = data.map(row => 
            row.map(cell => `"${cell}"`).join(',')
        ).join('\n');
        
        // 创建下载链接
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${tableName}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.updateStatus('数据导出成功');
        } else {
            // 如果浏览器不支持下载，则显示在新窗口
            const newWindow = window.open('', '_blank');
            newWindow.document.write(`<pre>${csvContent}</pre>`);
            
            this.updateStatus('数据已在新窗口中显示');
        }
    },
    
    // 保存数据
    saveData() {
        try {
            // 这里可以添加保存到后端的逻辑
            // 目前只是模拟保存
            const data = InventoryData.getCurrentData();
            localStorage.setItem(`inventory_${InventoryData.currentTable}`, JSON.stringify(data));
            
            this.updateStatus('数据保存成功');
        } catch (error) {
            this.updateStatus('数据保存失败: ' + error.message);
        }
    },
    
    // 处理键盘快捷键
    handleKeyboardShortcuts(e) {
        // Ctrl+S 保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveData();
        }
        
        // Ctrl+E 导出
        if (e.ctrlKey && e.key === 'e') {
            e.preventDefault();
            this.exportData();
        }
        
        // Ctrl+N 新建
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            this.addNewItem();
        }
        
        // Tab 切换表格
        if (e.key === 'Tab' && !e.ctrlKey && !e.shiftKey) {
            const activeElement = document.activeElement;
            if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'SELECT') {
                e.preventDefault();
                const currentTable = InventoryData.currentTable;
                const newTable = currentTable === 'items' ? 'transactions' : 'items';
                this.switchTable(newTable);
            }
        }
        
        // 方向键导航
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const selected = InventoryRenderer.getSelectedCell();
            if (selected.row >= 0 && selected.col >= 0) {
                e.preventDefault();
                
                let newRow = selected.row;
                let newCol = selected.col;
                const data = InventoryData.getCurrentData();
                
                switch (e.key) {
                    case 'ArrowUp':
                        newRow = Math.max(0, selected.row - 1);
                        break;
                    case 'ArrowDown':
                        newRow = Math.min(data.length - 1, selected.row + 1);
                        break;
                    case 'ArrowLeft':
                        newCol = Math.max(0, selected.col - 1);
                        break;
                    case 'ArrowRight':
                        newCol = Math.min(data[0].length - 1, selected.col + 1);
                        break;
                }
                
                InventoryRenderer.setSelectedCell(newRow, newCol);
                InventoryRenderer.scrollToSelected();
                InventoryRenderer.render();
            }
        }
    },
    
    // 显示帮助信息
    showHelp() {
        const helpText = `
库存管理系统 - 快捷键说明

键盘快捷键：
• Ctrl+S: 保存数据
• Ctrl+E: 导出数据
• Ctrl+N: 添加新记录
• Tab: 切换表格类型
• 方向键: 导航选择单元格

鼠标操作：
• 单击: 选择单元格
• 滚轮: 滚动表格
• 双击: 编辑单元格（计划中）

界面功能：
• 表格切换: 在物品表和交易表之间切换
• 添加物品/交易: 添加新记录
• 导出数据: 导出为CSV格式
        `;
        
        alert(helpText);
    },
    
    // 更新状态栏
    updateStatus(message) {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
        }
    },
    
    // 获取当前数据
    getData() {
        return InventoryData.getCurrentData();
    },
    
    // 设置单元格数据
    setCellData(row, col, value) {
        InventoryData.setCellData(row, col, value);
        this.refresh();
        this.updateUI();
    }
};

// 将应用暴露到全局作用域
window.InventoryApp = InventoryApp;