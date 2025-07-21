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
        
        // 编辑控件 - 管理全局输入框和专用控件
        this.editWidget = new global.EditWidget(canvas, config, {
            eventManager: this.eventManager,
            tableCore: this
        });
        
        // 筛选系统 - 管理数据筛选和面板交互
        this.tableFilter = null;
        try {
            if (global.TableFilter) {
                this.tableFilter = new global.TableFilter(canvas, config, {
                    eventManager: this.eventManager,
                    tableCore: this,
                    renderer: this.renderer
                });
            }
        } catch (error) {
            console.warn('筛选系统初始化失败，将禁用筛选功能:', error);
        }
        
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
            this.editWidget.startEdit(row, col, selectAll);
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
     * 按列排序
     */
    SimpleTableCore.prototype.sortByColumn = function(col, ascending) {
        if (col < 0 || col >= this.db.maxCols) {
            console.warn('无效的列索引:', col);
            return;
        }
        
        // 执行排序
        var result = this.db.sortByColumn(col, ascending);
        
        // 触发事件
        this.eventManager.emit(global.EVENTS.TABLE_SORTED, {
            column: col,
            ascending: ascending,
            rowsAffected: result.rowsAffected,
            sortTime: result.sortTime
        });
        
        // 重新渲染
        this.render();
        
        // 更新状态信息
        var colChar = String.fromCharCode(65 + col);
        var direction = ascending ? '升序' : '降序';
        if (typeof updateStatus === 'function') {
            updateStatus('按' + colChar + '列' + direction + '排序完成', 'success');
        }
        
        return result;
    };

    /**
     * 重置排序
     */
    SimpleTableCore.prototype.resetSort = function() {
        this.db.resetDisplayOrder();
        
        this.eventManager.emit(global.EVENTS.TABLE_SORT_RESET, {
            timestamp: Date.now()
        });
        
        this.render();
        
        // 更新状态信息
        if (typeof updateStatus === 'function') {
            updateStatus('已恢复原始顺序', 'success');
        }
    };

    /**
     * 获取排序状态
     */
    SimpleTableCore.prototype.getSortStatus = function() {
        return this.db.getSortStatus();
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
     * 🔹 获取单元格值（视图层）
     * 用于表格渲染显示，会考虑排序等视图状态
     * @param {number} viewRow 视图中的行号
     * @param {number} col 列号
     */
    SimpleTableCore.prototype.getCellValue = function(viewRow, col) {
        // 使用getDisplayValue获取视图数据（支持排序）
        var value = this.db.getDisplayValue(viewRow, col);
        return value === null || value === undefined ? '' : value;
    };
    
    /**
     * 🔹 获取存储层单元格值（存储层）  
     * 用于数据编辑，直接访问存储数据
     * @param {number} actualRow 存储层的实际行号
     * @param {number} col 列号
     */
    SimpleTableCore.prototype.getStorageCellValue = function(actualRow, col) {
        var value = this.db.getValue(actualRow, col);
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
            return;
        }
        
        var self = this;
        
        this.dbManager.getTable(this.tableId).then(function(tableData) {
            if (tableData && tableData.data) {
                self.db.importData(tableData.data);
                self.state.isDirty = false;
                self.render();
                if (self.eventManager && global.EVENTS) {
                    self.eventManager.emit(global.EVENTS.DB_LOAD_SUCCESS, { tableId: self.tableId });
                }
            } else {
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
            
            // 触发表格渲染完成事件
            if (this.eventManager && global.EVENTS) {
                this.eventManager.emit(global.EVENTS.TABLE_RENDERED, {
                    timestamp: Date.now()
                });
            }
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
        
        if (this.tableFilter) {
            this.tableFilter.destroy();
        }
        
    };

    SimpleTableCore.prototype.startEditWithCachedRect = function(row, col, cachedRect) {
        this.state.selectedCell = { row: row, col: col };
        this.startEdit(true);
    };

    // 暴露到全局
    global.SimpleTableCore = SimpleTableCore;
    
})(window);