/**
 * 表格控件 - ES5版本
 * 
 * 功能职责：
 * - 专门管理Canvas表格的渲染和基础交互
 * - 处理Canvas事件（点击、双击、键盘）
 * - 管理焦点控制权（与EditWidget协调）
 * - 发出编辑请求事件
 * - 维护选择状态和渲染
 * 
 * 设计模式：事件驱动，与EditWidget通过事件协调
 * 兼容性：Firefox 52+ (ES5语法)
 */
(function(global) {
    'use strict';

    /**
     * TableWidget - Canvas表格控件
     * @param {HTMLCanvasElement} canvas Canvas元素
     * @param {Object} config 配置对象
     * @param {Object} dependencies 依赖注入
     */
    function TableWidget(canvas, config, dependencies) {
        // 基本配置
        this.canvas = canvas;
        this.config = config;
        this.dependencies = dependencies || {};
        
        // 依赖注入
        this.eventManager = dependencies.eventManager || global.globalEventManager;
        this.tableCore = dependencies.tableCore;
        
        // 渲染器
        this.renderer = new global.TableRenderer(canvas, config.getTableConfig(), {
            eventManager: this.eventManager,
            tableCore: this.tableCore
        });
        
        // 交互状态
        this.state = {
            isActive: true,           // 表格是否激活（可接收焦点）
            allowFocus: true,         // 是否允许接收焦点
            selectedCell: { row: -1, col: -1 }
        };
        
        // 初始化
        this.initialize();
    }

    // ========================================
    // 初始化
    // ========================================
    
    /**
     * 初始化表格控件
     */
    TableWidget.prototype.initialize = function() {
        this.setupCanvas();
        this.bindEvents();
        
    };
    
    /**
     * 设置Canvas
     */
    TableWidget.prototype.setupCanvas = function() {
        // 设置Canvas可以接收焦点
        this.canvas.tabIndex = 0;
        this.canvas.focus();
        
    };

    // ========================================
    // 焦点管理 - 核心功能
    // ========================================
    
    /**
     * 释放焦点控制权（给EditWidget）
     * 当EditWidget需要编辑时调用，暂时禁用Canvas焦点接收
     */
    TableWidget.prototype.releaseFocus = function() {
        this.state.allowFocus = false;
        this.canvas.tabIndex = -1;
    };
    
    /**
     * 重新获得焦点控制权
     * 当EditWidget编辑完成时调用，恢复Canvas焦点接收能力
     */
    TableWidget.prototype.reclaimFocus = function() {
        this.state.allowFocus = true;
        this.canvas.tabIndex = 0;
        this.canvas.focus();
    };
    
    /**
     * 检查是否拥有焦点控制权
     */
    TableWidget.prototype.hasFocusControl = function() {
        return this.state.allowFocus;
    };

    // ========================================
    // 事件处理
    // ========================================
    
    /**
     * 绑定事件
     */
    TableWidget.prototype.bindEvents = function() {
        var self = this;
        
        // Canvas点击事件 - 只在拥有焦点控制权时处理
        this.canvas.addEventListener('click', function(e) {
            if (self.state.allowFocus) {
                self.handleCanvasClick(e);
            }
        });
        
        // Canvas双击事件
        this.canvas.addEventListener('dblclick', function(e) {
            if (self.state.allowFocus) {
                self.handleCanvasDoubleClick(e);
            }
        });
        
        // Canvas键盘事件
        this.canvas.addEventListener('keydown', function(e) {
            if (self.state.allowFocus) {
                self.handleCanvasKeyDown(e);
            }
        });
        
    };
    
    /**
     * 处理Canvas点击
     */
    TableWidget.prototype.handleCanvasClick = function(e) {
        try {
            var cellPos = this.pixelToCell(e.offsetX, e.offsetY);
            if (!cellPos) return;
            
            // 选择单元格
            this.selectCell(cellPos.row, cellPos.col);
        } catch (error) {
            console.error('处理Canvas点击失败:', error);
        }
    };
    
    /**
     * 处理Canvas双击
     */
    TableWidget.prototype.handleCanvasDoubleClick = function(e) {
        try {
            var cellPos = this.pixelToCell(e.offsetX, e.offsetY);
            if (!cellPos) return;
            
            // 发出编辑请求事件
            this.eventManager.emit(global.EVENTS.TABLE_EDIT_REQUESTED, {
                row: cellPos.row,
                col: cellPos.col,
                selectAll: true
            });
        } catch (error) {
            console.error('处理Canvas双击失败:', error);
        }
    };
    
    /**
     * 处理键盘事件
     */
    TableWidget.prototype.handleCanvasKeyDown = function(e) {
        // 导航键处理
        var row = this.state.selectedCell.row;
        var col = this.state.selectedCell.col;
        
        switch (e.key) {
            case 'ArrowUp':
                if (row > 0) this.selectCell(row - 1, col);
                e.preventDefault();
                break;
            case 'ArrowDown':
                if (row < this.tableCore.db.maxRows - 1) this.selectCell(row + 1, col);
                e.preventDefault();
                break;
            case 'ArrowLeft':
                if (col > 0) this.selectCell(row, col - 1);
                e.preventDefault();
                break;
            case 'ArrowRight':
                if (col < this.tableCore.db.maxCols - 1) this.selectCell(row, col + 1);
                e.preventDefault();
                break;
            case 'F2':
            case 'Enter':
                // 发出编辑请求
                this.eventManager.emit(global.EVENTS.TABLE_EDIT_REQUESTED, {
                    row: row,
                    col: col,
                    selectAll: false
                });
                e.preventDefault();
                break;
            default:
                // 可输入字符，发出编辑请求
                if (this.isEditingKey(e)) {
                    this.eventManager.emit(global.EVENTS.TABLE_EDIT_REQUESTED, {
                        row: row,
                        col: col,
                        selectAll: false
                    });
                }
                break;
        }
    };

    // ========================================
    // 表格操作
    // ========================================
    
    /**
     * 选择单元格
     */
    TableWidget.prototype.selectCell = function(row, col) {
        this.state.selectedCell = { row: row, col: col };
        
        // 更新渲染
        this.render();
        
        // 发出选择事件
        this.eventManager.emit(global.EVENTS.TABLE_CELL_SELECTED, {
            row: row, 
            col: col, 
            reference: this.getCellReference(row, col)
        });
        
    };
    
    /**
     * 渲染表格
     */
    TableWidget.prototype.render = function() {
        if (this.renderer && this.tableCore && this.tableCore.db) {
            this.renderer.render(this.tableCore.db, this.state.selectedCell);
        }
    };

    // ========================================
    // 工具方法
    // ========================================
    
    /**
     * 像素坐标转单元格坐标
     */
    TableWidget.prototype.pixelToCell = function(x, y) {
        if (this.tableCore && this.tableCore.pixelToCell) {
            return this.tableCore.pixelToCell(x, y);
        }
        return null;
    };
    
    /**
     * 获取单元格引用
     */
    TableWidget.prototype.getCellReference = function(row, col) {
        var colChar = String.fromCharCode(65 + col);
        return colChar + (row + 1);
    };
    
    /**
     * 判断是否是编辑按键
     */
    TableWidget.prototype.isEditingKey = function(e) {
        if (e.ctrlKey || e.altKey || e.metaKey) return false;
        if (['Control', 'Alt', 'Meta', 'Shift', 'Tab', 'Escape'].indexOf(e.key) >= 0) return false;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].indexOf(e.key) >= 0) return false;
        
        return e.key.length === 1 || ['Backspace', 'Delete'].indexOf(e.key) >= 0;
    };

    // ========================================
    // 状态查询
    // ========================================
    
    /**
     * 获取当前选中的单元格
     */
    TableWidget.prototype.getSelectedCell = function() {
        return {
            row: this.state.selectedCell.row,
            col: this.state.selectedCell.col
        };
    };

    // ========================================
    // 销毁
    // ========================================
    
    /**
     * 销毁控件
     */
    TableWidget.prototype.destroy = function() {
    };

    // 暴露到全局
    global.TableWidget = TableWidget;
    
})(window);