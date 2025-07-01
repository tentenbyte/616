class TableApp {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas element with id '${canvasId}' not found`);
        }
        
        // 初始化数据结构
        this.dataStructures = new TableDataStructures(20, 10);
        
        // 初始化渲染器
        this.renderer = new CanvasTableRenderer(this.canvas, this.dataStructures);
        
        // 初始化持久化模块
        this.persistence = new TablePersistence();
        this.currentTableName = 'default';
        
        // 初始化单元格编辑器
        this.cellEditor = new CellEditor(this.canvas.parentElement, this.renderer, this.dataStructures);
        this.setupCellEditorCallbacks();
        
        // 将cellEditor引用传递给renderer
        this.renderer.cellEditor = this.cellEditor;
        
        // 初始化统一输入管理器
        this.inputManager = new InputManager(this.canvas, this);
        
        // 注册事件处理器到InputManager
        this.registerEventHandlers();
        
        // 初始化数据（优先从持久化加载）
        this.initializeData();
        
        // 首次渲染
        this.renderer.render();
    }
    
    registerEventHandlers() {
        // 注册鼠标事件处理器
        this.inputManager.registerHandler('click', 'mouse', (e) => this.handleCellClick(e), this.inputManager.priority.navigation);
        this.inputManager.registerHandler('dblclick', 'mouse', (e) => this.handleCellDoubleClick(e), this.inputManager.priority.navigation);
        this.inputManager.registerHandler('mousemove', 'mouse', (e) => this.handleMouseMove(e), this.inputManager.priority.navigation);
        this.inputManager.registerHandler('wheel', 'mouse', (e) => this.handleWheel(e), this.inputManager.priority.navigation);
        
        // 注册键盘事件处理器
        this.inputManager.registerHandler('keydown', 'keyboard', (e) => this.handleKeyDown(e), this.inputManager.priority.navigation);
        this.inputManager.registerHandler('keydown', 'keyboard', (e) => this.handleGlobalShortcuts(e), this.inputManager.priority.global);
        
        // 注册系统事件处理器
        this.inputManager.registerHandler('resize', 'system', (e) => this.handleResize(e), this.inputManager.priority.global);
        
        // 设置渲染器的选择回调
        this.renderer.onCellSelected = (row, col) => {
            this.onCellSelected(row, col);
        };
    }
    
    // 设置单元格编辑器回调
    setupCellEditorCallbacks() {
        // 编辑开始
        this.cellEditor.onEditStart = (row, col, value) => {
            this.updateStatusBar(`开始编辑单元格 (${row + 1}, ${this.getColumnName(col)})`);
        };
        
        // 编辑完成
        this.cellEditor.onEditComplete = (row, col, newValue) => {
            this.renderer.render();
            this.updateStatusBar(`更新单元格 (${row + 1}, ${this.getColumnName(col)}): ${newValue}`);
            
            // 更新InputManager状态
            this.inputManager.updateState({ isEditing: false, mode: 'normal' });
            
            // 自动保存（可选）
            if (this.persistence && this.persistence.isReady) {
                this.saveToPersistence().catch(err => {
                    console.warn('Auto-save failed:', err);
                });
            }
        };
        
        // 编辑取消
        this.cellEditor.onEditCancel = (row, col) => {
            this.updateStatusBar(`取消编辑单元格 (${row + 1}, ${this.getColumnName(col)})`);
            
            // 更新InputManager状态
            this.inputManager.updateState({ isEditing: false, mode: 'normal' });
        };
        
        // 编辑受限提示
        this.cellEditor.onEditRestricted = (row, col, reason) => {
            this.updateStatusBar(`无法编辑单元格 (${row + 1}, ${this.getColumnName(col)}): ${reason}`);
        };
        
        // 请求新行
        this.cellEditor.onRequestNewRow = () => {
            this.appendRow();
        };
        
        // 单元格移动回调
        this.cellEditor.onCellMove = (row, col) => {
            this.onCellSelected(row, col);
        };
    }
    
    // 初始化数据（优先从持久化加载，否则加载示例数据）
    async initializeData() {
        try {
            await this.persistence.initialize();
            
            // 尝试加载现有数据
            const exists = await this.persistence.tableExists(this.currentTableName);
            if (exists) {
                await this.loadFromPersistence();
                this.updateStatusBar('从本地存储加载表格数据');
            } else {
                this.loadSampleData();
                // 自动保存示例数据
                await this.saveToPersistence();
            }
        } catch (error) {
            console.error('Failed to initialize persistence:', error);
            this.loadSampleData();
            this.updateStatusBar('持久化初始化失败，使用示例数据');
        }
    }
    
    // 保存到持久化存储
    async saveToPersistence(tableName = null) {
        try {
            const name = tableName || this.currentTableName;
            const result = await this.persistence.saveTableData(this.dataStructures, name);
            this.updateStatusBar(`表格已保存: ${name} (${result.size})`);
            return result;
        } catch (error) {
            console.error('Failed to save table:', error);
            this.updateStatusBar(`保存失败: ${error.message}`);
            throw error;
        }
    }
    
    // 从持久化存储加载
    async loadFromPersistence(tableName = null) {
        try {
            const name = tableName || this.currentTableName;
            const result = await this.persistence.loadTableData(name);
            
            // 恢复数据结构
            this.restoreDataStructures(result.data);
            this.currentTableName = name;
            this.renderer.render();
            
            this.updateStatusBar(`表格已加载: ${name} (${this.dataStructures.currentRowCount} 行)`);
            return result;
        } catch (error) {
            console.error('Failed to load table:', error);
            this.updateStatusBar(`加载失败: ${error.message}`);
            throw error;
        }
    }
    
    // 恢复数据结构
    restoreDataStructures(data) {
        // 恢复基本属性
        this.dataStructures.rows = data.rows;
        this.dataStructures.cols = data.cols;
        this.dataStructures.currentRowCount = data.currentRowCount;
        this.dataStructures.nextStringIndex = data.nextStringIndex;
        
        // 恢复 ArrayBuffer
        this.dataStructures.cellDataBuffer = data.cellDataBuffer;
        this.dataStructures.cellDataView = new Uint32Array(data.cellDataBuffer);
        
        // 恢复字符串数组
        this.dataStructures.stringArray = data.stringArray;
        
        // 恢复 HashMap
        this.dataStructures.stringToIndexMap = data.stringToIndexMap;
    }
    
    // 获取存储信息
    async getStorageInfo() {
        try {
            return await this.persistence.getStorageInfo();
        } catch (error) {
            console.error('Failed to get storage info:', error);
            return null;
        }
    }
    
    // 列出所有表格
    async listTables() {
        try {
            return await this.persistence.listTables();
        } catch (error) {
            console.error('Failed to list tables:', error);
            return [];
        }
    }
    
    // 删除表格
    async deleteTable(tableName) {
        try {
            const result = await this.persistence.deleteTable(tableName);
            this.updateStatusBar(`表格已删除: ${tableName}`);
            return result;
        } catch (error) {
            console.error('Failed to delete table:', error);
            this.updateStatusBar(`删除失败: ${error.message}`);
            throw error;
        }
    }
    
    
    loadSampleData() {
        // 加载时间序列数据示例（股票价格数据）
        const timeSeriesData = [
            ['时间', '开盘价', '最高价', '最低价', '收盘价', '成交量', '涨跌幅'],
            ['2024-01-01 09:30', '100.00', '102.50', '99.80', '101.20', '1250000', '+1.20%'],
            ['2024-01-01 10:00', '101.20', '103.00', '100.90', '102.30', '980000', '+1.09%'],
            ['2024-01-01 10:30', '102.30', '102.80', '101.50', '101.90', '750000', '-0.39%'],
            ['2024-01-01 11:00', '101.90', '102.40', '101.20', '102.10', '650000', '+0.20%'],
            ['2024-01-01 11:30', '102.10', '103.20', '101.80', '102.80', '890000', '+0.69%'],
            ['2024-01-01 14:00', '102.80', '104.50', '102.60', '104.20', '1150000', '+1.36%'],
            ['2024-01-01 14:30', '104.20', '105.00', '103.90', '104.60', '920000', '+0.38%'],
            ['2024-01-01 15:00', '104.60', '105.80', '104.30', '105.20', '1080000', '+0.57%']
        ];
        
        // 使用临时放宽的编辑限制来加载历史数据
        const originalSetCellValue = this.dataStructures.setCellValue;
        this.dataStructures.setCellValue = function(row, col, value) {
            if (row >= this.rows || col >= this.cols || row < 0 || col < 0) {
                throw new Error(`Cell position out of bounds: (${row}, ${col})`);
            }
            const stringIndex = this.addString(value);
            const cellIndex = col * this.rows + row;
            this.cellDataView[cellIndex] = stringIndex;
        };
        
        // 加载数据并更新 currentRowCount
        for (let row = 0; row < timeSeriesData.length; row++) {
            for (let col = 0; col < timeSeriesData[row].length; col++) {
                this.dataStructures.setCellValue(row, col, timeSeriesData[row][col]);
            }
        }
        
        // 设置实际使用的行数
        this.dataStructures.currentRowCount = timeSeriesData.length;
        
        // 恢复编辑限制
        this.dataStructures.setCellValue = originalSetCellValue;
        
        this.updateStatusBar(`加载了 ${timeSeriesData.length} 行时间序列数据，只能编辑最后一行`);
    }
    
    onCellSelected(row, col) {
        const cellValue = this.dataStructures.getCellValue(row, col);
        this.updateStatusBar(`选中单元格 (${row + 1}, ${this.getColumnName(col)}): ${cellValue}`);
    }
    
    
    // 处理单元格点击
    handleCellClick(e) {
        if (e.cell.row >= 0 && e.cell.col >= 0) {
            this.renderer.setSelectedCell(e.cell.row, e.cell.col);
            this.onCellSelected(e.cell.row, e.cell.col);
            this.inputManager.updateState({ selectedCell: e.cell });
            return true;
        }
        return false;
    }
    
    // 处理单元格双击
    handleCellDoubleClick(e) {
        console.log('双击事件触发');
        console.log(`双击坐标: (${e.canvasX}, ${e.canvasY})`);
        console.log(`计算出的单元格: (${e.cell.row}, ${e.cell.col})`);
        
        if (e.cell.row >= 0 && e.cell.col >= 0) {
            console.log(`尝试编辑单元格 (${e.cell.row}, ${e.cell.col})`);
            // Excel风格：双击进入编辑模式，光标定位到点击位置
            const clickPos = { x: e.canvasX, y: e.canvasY };
            const success = this.cellEditor.startEdit(e.cell.row, e.cell.col, '', 'click', clickPos);
            if (success) {
                this.inputManager.updateState({ isEditing: true, mode: 'editing' });
            } else {
                console.log('编辑失败，可能受到编辑限制');
            }
            return true;
        } else {
            console.log('双击位置不在有效单元格范围内');
        }
        return false;
    }
    
    // 处理鼠标移动
    handleMouseMove(e) {
        if (e.cell.row >= 0 && e.cell.col >= 0) {
            this.canvas.style.cursor = 'cell';
        } else {
            this.canvas.style.cursor = 'default';
        }
        return false; // 不阻止事件传播
    }
    
    // 处理鼠标滚轮
    handleWheel(e) {
        const scrollSpeed = 30;
        
        // 垂直滚动
        if (Math.abs(e.originalEvent.deltaY) > Math.abs(e.originalEvent.deltaX)) {
            this.renderer.scrollY += e.originalEvent.deltaY > 0 ? scrollSpeed : -scrollSpeed;
        } else {
            // 水平滚动
            this.renderer.scrollX += e.originalEvent.deltaX > 0 ? scrollSpeed : -scrollSpeed;
        }
        
        // 限制滚动范围
        this.renderer.scrollX = Math.max(0, this.renderer.scrollX);
        this.renderer.scrollY = Math.max(0, this.renderer.scrollY);
        
        this.renderer.render();
        e.preventDefault();
        return true;
    }
    
    // 处理窗口大小改变
    handleResize(e) {
        if (this.renderer) {
            setTimeout(() => {
                this.renderer.setupHighDPI();
                this.renderer.render();
            }, 100);
        }
        return false;
    }
    
    handleKeyDown(e) {
        // 首先检查是否在编辑状态，如果是则让编辑器处理
        if (this.cellEditor.isEditing) {
            const handled = this.cellEditor.handleEditingKeyDown(e.originalEvent);
            if (handled) {
                e.preventDefault();
                return true;
            }
        }
        
        const selected = this.renderer.getSelectedCell();
        if (selected.row < 0 || selected.col < 0) return false;
        
        let newRow = selected.row;
        let newCol = selected.col;
        
        switch (e.key) {
            case 'ArrowUp':
                newRow = Math.max(0, selected.row - 1);
                e.preventDefault();
                break;
            case 'ArrowDown':
                newRow = Math.min(this.dataStructures.currentRowCount - 1, selected.row + 1);
                e.preventDefault();
                break;
            case 'ArrowLeft':
                newCol = Math.max(0, selected.col - 1);
                e.preventDefault();
                break;
            case 'ArrowRight':
                newCol = Math.min(this.dataStructures.cols - 1, selected.col + 1);
                e.preventDefault();
                break;
            case 'Enter':
                // Excel风格：Enter进入编辑模式，光标在末尾
                const enterSuccess = this.cellEditor.startEdit(selected.row, selected.col, '', 'append');
                if (enterSuccess) {
                    this.inputManager.updateState({ isEditing: true, mode: 'editing' });
                }
                e.preventDefault();
                return true;
            case 'F2':
                // Excel风格：F2进入编辑模式，光标在末尾
                const f2Success = this.cellEditor.startEdit(selected.row, selected.col, '', 'append');
                if (f2Success) {
                    this.inputManager.updateState({ isEditing: true, mode: 'editing' });
                }
                e.preventDefault();
                return true;
            case 'Tab':
                // Excel风格：Tab移动到右侧单元格
                e.preventDefault();
                if (e.shiftKey) {
                    newCol = Math.max(0, selected.col - 1);
                } else {
                    newCol = Math.min(this.dataStructures.cols - 1, selected.col + 1);
                }
                break;
            case 'Delete':
                // Excel风格：Delete清空单元格
                this.dataStructures.setCellValue(selected.row, selected.col, '');
                this.renderer.render();
                e.preventDefault();
                break;
            case 'Backspace':
                // Excel风格：Backspace清空单元格并进入编辑模式
                this.dataStructures.setCellValue(selected.row, selected.col, '');
                this.renderer.render();
                const backspaceSuccess = this.cellEditor.startEdit(selected.row, selected.col, '', 'append');
                if (backspaceSuccess) {
                    this.inputManager.updateState({ isEditing: true, mode: 'editing' });
                }
                e.preventDefault();
                return true;
            default:
                // Excel风格：直接输入字符替换单元格内容
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    // 开始编辑并设置初始值为输入的字符（全选替换）
                    const replaceSuccess = this.cellEditor.startEdit(selected.row, selected.col, e.key, 'replace');
                    if (replaceSuccess) {
                        this.inputManager.updateState({ isEditing: true, mode: 'editing' });
                    }
                    e.preventDefault();
                    return true;
                }
                break;
        }
        
        if (newRow !== selected.row || newCol !== selected.col) {
            this.renderer.setSelectedCell(newRow, newCol);
            this.onCellSelected(newRow, newCol);
            this.inputManager.updateState({ selectedCell: { row: newRow, col: newCol } });
            e.preventDefault();
            return true;
        }
        
        return false;
    }
    
    // 处理全局快捷键
    handleGlobalShortcuts(e) {
        // 如果正在编辑，只允许特定的全局快捷键
        if (this.cellEditor.isEditing) {
            if (!((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'z'))) {
                return false; // 让编辑器处理
            }
        }
        
        // Ctrl/Cmd + S: 保存数据
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            const data = this.exportData();
            console.log('导出的数据:', data);
            this.updateStatusBar('数据已导出到控制台');
            e.preventDefault();
            return true;
        }
        
        // Ctrl/Cmd + Z: 撤销（待实现）
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            this.updateStatusBar('撤销功能待实现');
            e.preventDefault();
            return true;
        }
        
        return false;
    }
    
    // 追加新行到时间序列表格末尾
    appendRow() {
        const newRowIndex = this.dataStructures.appendRow();
        this.renderer.render();
        this.updateStatusBar(`追加新行到表格末尾 (第 ${newRowIndex + 1} 行)`);
        
        // 自动选中新行的第一个单元格
        this.renderer.setSelectedCell(newRowIndex, 0);
        this.onCellSelected(newRowIndex, 0);
        
        return newRowIndex;
    }
    
    // 追加新列到表格末尾
    appendColumn() {
        const newColIndex = this.dataStructures.appendCol();
        this.renderer.render();
        this.updateStatusBar(`追加新列到表格末尾 (第 ${this.getColumnName(newColIndex)} 列)`);
        
        return newColIndex;
    }
    
    // 删除最后一行（只允许删除最新的时间记录）
    deleteLastRow() {
        if (this.dataStructures.currentRowCount <= 1) {
            this.updateStatusBar('无法删除：表格至少需要保留一行');
            return;
        }
        
        const lastRowIndex = this.dataStructures.currentRowCount - 1;
        this.dataStructures.deleteLastRow();
        this.renderer.setSelectedCell(-1, -1);
        this.renderer.render();
        this.updateStatusBar(`删除了最后一行 (原第 ${lastRowIndex + 1} 行)`);
    }
    
    // 删除最后一列
    deleteLastColumn() {
        if (this.dataStructures.cols <= 1) {
            this.updateStatusBar('无法删除：表格至少需要保留一列');
            return;
        }
        
        const lastColIndex = this.dataStructures.cols - 1;
        this.dataStructures.deleteLastCol();
        this.renderer.setSelectedCell(-1, -1);
        this.renderer.render();
        this.updateStatusBar(`删除了最后一列 (原第 ${this.getColumnName(lastColIndex)} 列)`);
    }
    
    getColumnName(col) {
        let name = '';
        while (col >= 0) {
            name = String.fromCharCode(65 + (col % 26)) + name;
            col = Math.floor(col / 26) - 1;
        }
        return name;
    }
    
    updateStatusBar(message) {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
        }
    }
    
    getMemoryUsage() {
        return this.dataStructures.getMemoryUsage();
    }
    
    exportData() {
        const data = [];
        for (let row = 0; row < this.dataStructures.currentRowCount; row++) {
            const rowData = [];
            for (let col = 0; col < this.dataStructures.cols; col++) {
                rowData.push(this.dataStructures.getCellValue(row, col));
            }
            data.push(rowData);
        }
        return data;
    }
}