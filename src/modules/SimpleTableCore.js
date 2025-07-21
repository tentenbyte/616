/**
 * 简化的表格核心模块 - ES5版本
 * 使用极简列存数据库 + 全局输入法支持
 * Firefox 52兼容
 */
(function(global) {
    'use strict';

    // ========================================
    // 构造函数
    // ========================================
    
    function SimpleTableCore(canvas, config) {
        // 基本参数
        this.canvas = canvas;
        this.config = config;
        this.eventManager = global.globalEventManager;
        
        // 创建极简列存数据库
        var tableSize = config.getTableSize();
        this.db = new global.SimpleColumnarDB(tableSize.rows, tableSize.cols);
        
        // 状态管理
        this.state = {
            selectedCell: { row: -1, col: -1 },
            isDirty: false,
            isInitialized: false
        };
        
        // 表格控件 - 管理Canvas交互和渲染
        this.tableWidget = new global.TableWidget(canvas, config, {
            eventManager: this.eventManager,
            tableCore: this
        });
        
        this.renderer = this.tableWidget.renderer;
        this.editWidget = null;
        
        // 历史记录
        this.history = {
            undoStack: [],
            redoStack: [],
            maxSize: 100
        };
        
        // IndexedDB持久化
        this.tableId = 'default_table';
        this.debouncedSave = global.Helpers.debounce(this.saveToIndexedDB.bind(this), 2000);
        
        try {
            this.dbManager = new global.DatabaseManager(config.getDatabaseConfig(), this.eventManager);
            if (this.dbManager && typeof this.dbManager.initialize === 'function') {
                this.dbManager.initialize().catch(function(error) {
                    console.warn('DatabaseManager初始化失败，将使用内存模式:', error);
                });
            }
        } catch (error) {
            console.warn('DatabaseManager创建失败，将使用内存模式:', error);
            this.dbManager = null;
        }
        
    }

    // ========================================
    // 编辑操作
    // ========================================
    SimpleTableCore.prototype.startEdit = function(selectAll) {
        var row = this.state.selectedCell.row;
        var col = this.state.selectedCell.col;
        
        if (row >= 0 && col >= 0 && this.editWidget) {
            this.editWidget.startEdit(row, col, null, selectAll);
        }
    };

    SimpleTableCore.prototype.endEdit = function() {
        if (this.editWidget) {
            this.editWidget.endEdit();
        }
    };

    // ========================================
    // 单元格操作
    // ========================================
    
    /**
     * 选择单元格
     */
    SimpleTableCore.prototype.selectCell = function(row, col) {
        this.updateSelection(row, col);
    };

    /**
     * 更新选择状态
     */
    SimpleTableCore.prototype.updateSelection = function(row, col) {
        // 更新选择状态
        this.state.selectedCell = { row: row, col: col };
        
        if (this.tableWidget && this.tableWidget.selectCell) {
            this.tableWidget.selectCell(row, col);
        }
        
    };

    /**
     * 设置单元格值
     */
    SimpleTableCore.prototype.setCellValue = function(row, col, value) {
        var oldValue = this.db.getValue(row, col) || '';
        
        if (oldValue !== value) {
            // 添加到历史记录
            this.addToHistory({
                type: 'cellChange',
                row: row,
                col: col,
                oldValue: oldValue,
                newValue: value
            });
            
            // 更新数据
            this.db.setValue(row, col, value);
            this.state.isDirty = true;
            
            // 触发保存和事件
            this.debouncedSave();
            this.eventManager.emit(global.EVENTS.TABLE_DATA_CHANGED, {
                row: row, col: col, value: value
            });
        }
    };

    /**
     * 清空单元格
     */
    SimpleTableCore.prototype.clearCell = function() {
        if (this.state.selectedCell.row >= 0 && this.state.selectedCell.col >= 0) {
            this.setCellValue(this.state.selectedCell.row, this.state.selectedCell.col, '');
            this.render();
        }
    };

    // ========================================
    // 事件处理
    // ========================================
    
    /**
     * 绑定Canvas事件
     */
    SimpleTableCore.prototype.bindCanvasEvents = function() {
    };

    // ========================================
    // 工具方法
    // ========================================
    
    /**
     * 像素坐标转换为单元格坐标
     */
    SimpleTableCore.prototype.pixelToCell = function(x, y) {
        var tableConfig = this.config.getTableConfig();
        
        if (x < tableConfig.rowHeaderWidth || y < tableConfig.headerHeight) {
            return null;
        }
        
        var col = Math.floor((x - tableConfig.rowHeaderWidth) / tableConfig.cellWidth);
        var row = Math.floor((y - tableConfig.headerHeight) / tableConfig.cellHeight);
        
        if (row >= 0 && row < this.db.maxRows && col >= 0 && col < this.db.maxCols) {
            return { row: row, col: col };
        }
        
        return null;
    };

    /**
     * 获取单元格值
     */
    SimpleTableCore.prototype.getCellValue = function(row, col) {
        var value = this.db.getValue(row, col);
        return value === null || value === undefined ? '' : value;
    };

    /**
     * 获取单元格引用（如A1, B2等）
     */
    SimpleTableCore.prototype.getCellReference = function(row, col) {
        var colChar = String.fromCharCode(65 + col); // A, B, C...
        return colChar + (row + 1);
    };

    /**
     * 检查指定单元格是否正在编辑
     */
    SimpleTableCore.prototype.isCellEditing = function(row, col) {
        if (!this.editWidget) return false;
        
        var isEditing = this.editWidget.isEditing();
        if (!isEditing) return false;
        
        var currentCell = this.editWidget.getCurrentCell();
        return currentCell.row === row && currentCell.col === col;
    };


    // ========================================
    // 历史记录管理
    // ========================================
    
    /**
     * 添加到历史记录
     */
    SimpleTableCore.prototype.addToHistory = function(action) {
        this.history.undoStack.push(action);
        if (this.history.undoStack.length > this.history.maxSize) {
            this.history.undoStack.shift();
        }
        this.history.redoStack = []; // 清空重做栈
    };

    /**
     * 撤销操作
     */
    SimpleTableCore.prototype.undo = function() {
        if (this.history.undoStack.length === 0) return;
        
        var action = this.history.undoStack.pop();
        this.history.redoStack.push(action);
        
        if (action.type === 'cellChange') {
            this.db.setValue(action.row, action.col, action.oldValue);
            this.state.isDirty = true;
            this.render();
        }
    };

    /**
     * 重做操作
     */
    SimpleTableCore.prototype.redo = function() {
        if (this.history.redoStack.length === 0) return;
        
        var action = this.history.redoStack.pop();
        this.history.undoStack.push(action);
        
        if (action.type === 'cellChange') {
            this.db.setValue(action.row, action.col, action.newValue);
            this.state.isDirty = true;
            this.render();
        }
    };

    // ========================================
    // 数据持久化
    // ========================================
    
    /**
     * 保存到IndexedDB
     */
    SimpleTableCore.prototype.saveToIndexedDB = function() {
        if (!this.state.isDirty || !this.dbManager) return;
        
        var self = this;
        console.log('开始保存表格数据到IndexedDB...');
        
        // 构建要保存的数据
        var tableData = {
            id: this.tableId,
            name: 'Default Table',
            created: new Date().toISOString(),
            data: this.db.exportData()
        };
        
        // 保存数据
        this.dbManager.saveTable(tableData).then(function() {
            self.state.isDirty = false;
            console.log('表格数据保存成功');
            if (self.eventManager && global.EVENTS) {
                self.eventManager.emit(global.EVENTS.DB_SAVE_SUCCESS, { tableId: self.tableId });
            }
        }).catch(function(error) {
            console.error('保存失败:', error);
        });
    };

    /**
     * 从IndexedDB加载
     */
    SimpleTableCore.prototype.loadFromIndexedDB = function() {
        if (!this.dbManager) {
            console.log('DatabaseManager未初始化，使用默认数据');
            return;
        }
        
        var self = this;
        console.log('开始从IndexedDB加载表格数据...');
        
        this.dbManager.getTable(this.tableId).then(function(tableData) {
            if (tableData && tableData.data) {
                self.db.importData(tableData.data);
                self.state.isDirty = false;
                self.render();
                console.log('表格数据加载成功');
                if (self.eventManager && global.EVENTS) {
                    self.eventManager.emit(global.EVENTS.DB_LOAD_SUCCESS, { tableId: self.tableId });
                }
            } else {
                console.log('没有找到保存的数据，将使用默认数据');
            }
        }).catch(function(error) {
            console.error('加载失败，将使用默认数据:', error);
        });
    };

    // ========================================
    // 渲染控制
    // ========================================
    
    /**
     * 渲染表格
     */
    SimpleTableCore.prototype.render = function() {
        if (this.tableWidget && this.db) {
            this.tableWidget.render();
        }
    };

    /**
     * 初始化表格
     */
    SimpleTableCore.prototype.initialize = function() {
        if (this.state.isInitialized) {
            return Promise.resolve();
        }
        
        // 绑定Canvas事件
        this.bindCanvasEvents();
        
        this.selectCell(0, 0);
        this.loadFromIndexedDB();
        this.render();
        this.state.isInitialized = true;
        
        if (this.eventManager && global.EVENTS) {
            this.eventManager.emit(global.EVENTS.APP_INITIALIZED, {
                tableCore: this
            });
        }
        
        return Promise.resolve();
    };

    /**
     * 销毁表格
     */
    SimpleTableCore.prototype.destroy = function() {
        if (this.editWidget) {
            this.editWidget.destroy();
        }
        
    };

    SimpleTableCore.prototype.startEditWithCachedRect = function(row, col, cachedRect) {
        this.state.selectedCell = { row: row, col: col };
        this.startEdit(true);
    };

    // 暴露到全局
    global.SimpleTableCore = SimpleTableCore;
    
})(window);