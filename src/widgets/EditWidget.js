/**
 * 编辑控件 - ES5版本
 * 完全借鉴feature3的优秀架构设计
 * 
 * 功能职责：
 * - 统一管理全局输入框
 * - 处理编辑状态和焦点管理
 * - 集成专用控件（数字键盘、日历、字符串选择器）
 * - 支持全局输入法（中文、日文、韩文等）
 * - 智能光标和定位管理
 * 
 * 设计模式：事件驱动，与TableWidget协调
 * 兼容性：Firefox 52+ (ES5语法)
 */
(function(global) {
    'use strict';

    /**
     * EditWidget - 全局编辑控件
     * @param {HTMLCanvasElement} canvas Canvas元素
     * @param {Object} config 配置对象
     * @param {Object} dependencies 依赖注入
     */
    function EditWidget(canvas, config, dependencies) {
        // 基本配置
        this.canvas = canvas;
        this.config = config;
        this.dependencies = dependencies || {};
        
        // 依赖注入
        this.eventManager = dependencies.eventManager || global.globalEventManager;
        this.tableCore = dependencies.tableCore;
        
        // 编辑状态
        this.state = {
            isEditing: false,
            currentCell: { row: -1, col: -1 },
            globalInput: null
        };
        
        // 专用控件引用
        this.helpers = {
            numberPad: null,
            calendar: null,
            stringSelector: null
        };
        
        // 初始化
        this.initialize();
    }

    // ========================================
    // 初始化
    // ========================================
    
    /**
     * 初始化编辑控件
     */
    EditWidget.prototype.initialize = function() {
        this.bindEvents();
        this.createInitialInput();
    };
    
    /**
     * 绑定事件
     */
    EditWidget.prototype.bindEvents = function() {
        var self = this;
        
        // 监听编辑请求事件
        if (this.eventManager && global.EVENTS) {
            this.eventManager.on(global.EVENTS.TABLE_EDIT_REQUESTED, function(data) {
                self.startEdit(data.row, data.col, data.selectAll);
            });
            
            this.eventManager.on(global.EVENTS.TABLE_CELL_SELECTED, function(data) {
                self.moveToCell(data.row, data.col);
            });
        }
    };

    // ========================================
    // 编辑状态管理
    // ========================================
    
    /**
     * 开始编辑
     */
    EditWidget.prototype.startEdit = function(row, col, selectAll) {
        this.state.isEditing = true;
        this.state.currentCell = { row: row, col: col };
        
        this.ensureGlobalInput();
        this.moveToCell(row, col);
        this.focusInput(selectAll);
        this.showHelperForColumn(col);
        
        // 通知TableWidget释放焦点
        if (this.tableCore && this.tableCore.tableWidget) {
            this.tableCore.tableWidget.releaseFocus();
        }
    };
    
    /**
     * 结束编辑
     */
    EditWidget.prototype.endEdit = function() {
        if (!this.state.isEditing) return;
        
        this.state.isEditing = false;
        this.hideAllHelpers();
        
        // 通知TableWidget重新获得焦点
        if (this.tableCore && this.tableCore.tableWidget) {
            this.tableCore.tableWidget.reclaimFocus();
        }
    };
    
    /**
     * 检查是否正在编辑
     */
    EditWidget.prototype.isEditing = function() {
        return this.state.isEditing;
    };
    
    /**
     * 获取当前编辑的单元格
     */
    EditWidget.prototype.getCurrentCell = function() {
        return {
            row: this.state.currentCell.row,
            col: this.state.currentCell.col
        };
    };

    // ========================================
    // 全局输入框管理
    // ========================================
    
    /**
     * 创建初始输入框
     */
    EditWidget.prototype.createInitialInput = function() {
        this.ensureGlobalInput();
        this.moveToCell(0, 0);
        this.focusInput(false);
    };
    
    /**
     * 确保全局输入框存在
     */
    EditWidget.prototype.ensureGlobalInput = function() {
        if (this.state.globalInput) return;
        
        // 移除已存在的输入框
        var existingInput = document.getElementById('edit-global-input');
        if (existingInput) {
            existingInput.parentNode.removeChild(existingInput);
        }
        
        // 创建新的全局输入框
        var globalInput = document.createElement('input');
        globalInput.type = 'text';
        globalInput.id = 'edit-global-input';
        globalInput.className = 'global-edit-input';
        
        document.body.appendChild(globalInput);
        this.state.globalInput = globalInput;
        
        this.setupInputInteraction(globalInput);
        this.setupCanvasClickHandler();
    };
    
    /**
     * 移动输入框到指定单元格
     */
    EditWidget.prototype.moveToCell = function(row, col) {
        if (!this.state.globalInput) return;
        
        try {
            var canvasRect = this.canvas.getBoundingClientRect();
            var tableConfig = this.config.getTableConfig();
            
            var x = canvasRect.left + tableConfig.rowHeaderWidth + col * tableConfig.cellWidth;
            var y = canvasRect.top + tableConfig.headerHeight + row * tableConfig.cellHeight - 2;
            
            this.state.globalInput.style.left = x + 'px';
            this.state.globalInput.style.top = y + 'px';
            
            // 更新输入框内容
            var cellValue = '';
            if (this.tableCore && this.tableCore.getCellValue) {
                cellValue = this.tableCore.getCellValue(row, col) || '';
            }
            this.state.globalInput.value = cellValue;
            
        } catch (error) {
            console.error('移动输入框失败:', error);
        }
    };
    
    /**
     * 设置输入框焦点
     */
    EditWidget.prototype.focusInput = function(selectAll) {
        if (!this.state.globalInput) return;
        
        var self = this;
        setTimeout(function() {
            self.state.globalInput.focus();
            
            if (selectAll) {
                self.state.globalInput.select();
            } else {
                var textLength = self.state.globalInput.value.length;
                self.state.globalInput.setSelectionRange(textLength, textLength);
            }
            
            // 默认隐藏光标
            self.state.globalInput.style.caretColor = 'transparent';
            self.state.globalInput.dataset.isFirstClick = 'true';
        }, 100);
    };

    // ========================================
    // 输入框交互设置 - 借鉴feature3的智能逻辑
    // ========================================
    
    /**
     * 设置输入框交互
     */
    EditWidget.prototype.setupInputInteraction = function(globalInput) {
        var self = this;
        
        function showCursor() {
            if (globalInput.dataset.isFirstClick === 'true') {
                globalInput.style.caretColor = '#2c3e50';
                globalInput.dataset.isFirstClick = 'false';
            }
        }
        
        // 键盘事件 - 借鉴feature3的双模式处理
        globalInput.addEventListener('keydown', function(e) {
            // 先处理我们的逻辑
            self.handleInputKeyDown(e);
            
            // 只在特定情况下显示光标
            if (!self.isDirectionKey(e.key)) {
                showCursor();
            }
        });
        
        // 输入事件
        globalInput.addEventListener('input', function(e) {
            showCursor();
            self.handleInputChange(e);
        });
        
        // 鼠标事件
        globalInput.addEventListener('mousedown', function(e) {
            setTimeout(function() {
                var cursorPos = globalInput.selectionStart;
                var textLength = globalInput.value.length;
                if (cursorPos !== textLength) {
                    showCursor();
                }
            }, 10);
        });
    };
    
    /**
     * 检查光标是否隐藏
     */
    EditWidget.prototype.isCursorHidden = function() {
        if (!this.state.globalInput) return false;
        return this.state.globalInput.style.caretColor === 'transparent';
    };
    
    /**
     * 检查是否是方向键
     */
    EditWidget.prototype.isDirectionKey = function(key) {
        return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(key) >= 0;
    };

    /**
     * 处理输入框键盘事件 - 完全借鉴feature3的优秀设计
     */
    EditWidget.prototype.handleInputKeyDown = function(e) {
        var row = this.state.currentCell.row;
        var col = this.state.currentCell.col;
        var cursorHidden = this.isCursorHidden();
        
        switch (e.key) {
            case 'Enter':
                this.saveCurrentValue();
                this.moveToNextCell('down');
                e.preventDefault();
                break;
            case 'Tab':
                this.saveCurrentValue();
                this.moveToNextCell(e.shiftKey ? 'left' : 'right');
                e.preventDefault();
                break;
            case 'Escape':
                this.cancelEdit();
                e.preventDefault();
                break;
            case 'ArrowUp':
                if (cursorHidden) {
                    // 光标隐藏：单元格导航
                    this.saveCurrentValue();
                    this.moveToNextCell('up');
                    e.preventDefault();
                } else {
                    // 光标显示：文本内移动，让浏览器处理
                }
                break;
            case 'ArrowDown':
                if (cursorHidden) {
                    this.saveCurrentValue();
                    this.moveToNextCell('down');
                    e.preventDefault();
                }
                break;
            case 'ArrowLeft':
                if (cursorHidden) {
                    this.saveCurrentValue();
                    this.moveToNextCell('left');
                    e.preventDefault();
                }
                break;
            case 'ArrowRight':
                if (cursorHidden) {
                    this.saveCurrentValue();
                    this.moveToNextCell('right');
                    e.preventDefault();
                }
                break;
        }
    };
    
    /**
     * 处理输入框内容变化
     */
    EditWidget.prototype.handleInputChange = function(e) {
        // 可以在这里添加实时验证逻辑
    };
    
    /**
     * 设置Canvas点击处理
     */
    EditWidget.prototype.setupCanvasClickHandler = function() {
        var self = this;
        
        this.canvas.addEventListener('click', function(e) {
            if (!self.state.globalInput) return;
            
            try {
                var canvasRect = self.canvas.getBoundingClientRect();
                var clickX = e.clientX - canvasRect.left;
                var clickY = e.clientY - canvasRect.top;
                
                var tableConfig = self.config.getTableConfig();
                
                if (clickX < tableConfig.rowHeaderWidth || clickY < tableConfig.headerHeight) {
                    return;
                }
                
                var col = Math.floor((clickX - tableConfig.rowHeaderWidth) / tableConfig.cellWidth);
                var row = Math.floor((clickY - tableConfig.headerHeight) / tableConfig.cellHeight);
                
                // 保存当前值
                if (self.state.isEditing) {
                    self.saveCurrentValue();
                }
                
                // 移动到新单元格
                self.moveToCell(row, col);
                self.state.currentCell = { row: row, col: col };
                self.focusInput(false);
                self.showHelperForColumn(col);
                
            } catch (error) {
                console.error('处理Canvas点击失败:', error);
            }
        });
    };

    // ========================================
    // 编辑操作
    // ========================================
    
    /**
     * 保存当前值
     */
    EditWidget.prototype.saveCurrentValue = function() {
        if (!this.state.globalInput || !this.tableCore) return;
        
        var value = this.state.globalInput.value;
        var row = this.state.currentCell.row;
        var col = this.state.currentCell.col;
        
        if (row >= 0 && col >= 0) {
            this.tableCore.setCellValue(row, col, value);
        }
    };
    
    /**
     * 取消编辑
     */
    EditWidget.prototype.cancelEdit = function() {
        if (!this.state.globalInput || !this.tableCore) return;
        
        var row = this.state.currentCell.row;
        var col = this.state.currentCell.col;
        
        // 恢复原值
        var originalValue = this.tableCore.getCellValue(row, col) || '';
        this.state.globalInput.value = originalValue;
        
        this.endEdit();
    };
    
    /**
     * 移动到下一个单元格
     */
    EditWidget.prototype.moveToNextCell = function(direction) {
        if (!this.tableCore) return;
        
        var row = this.state.currentCell.row;
        var col = this.state.currentCell.col;
        var maxRows = this.tableCore.db.maxRows;
        var maxCols = this.tableCore.db.maxCols;
        
        switch (direction) {
            case 'up':
                if (row > 0) row--;
                break;
            case 'down':
                if (row < maxRows - 1) row++;
                break;
            case 'left':
                if (col > 0) col--;
                break;
            case 'right':
                if (col < maxCols - 1) col++;
                break;
        }
        
        // 更新选择
        if (this.tableCore.selectCell) {
            this.tableCore.selectCell(row, col);
        }
        
        this.moveToCell(row, col);
        this.state.currentCell = { row: row, col: col };
        this.focusInput(false);
        this.showHelperForColumn(col);
    };

    // ========================================
    // 专用控件管理
    // ========================================
    
    /**
     * 显示列专用控件
     */
    EditWidget.prototype.showHelperForColumn = function(col) {
        this.hideAllHelpers();
        
        if (!this.state.globalInput) return;
        
        var inputRect = this.state.globalInput.getBoundingClientRect();
        var cellX = inputRect.left;
        var cellY = inputRect.top;
        
        if (col === 5 && global.NumberPadWidget) {
            this.showNumberPad(cellX, cellY);
        } else if (col === 6 && global.CalendarWidget) {
            this.showCalendar(cellX, cellY);
        } else if (col === 7 && global.StringSelectorWidget) {
            this.showStringSelector(cellX, cellY);
        }
    };
    
    /**
     * 隐藏所有辅助控件
     */
    EditWidget.prototype.hideAllHelpers = function() {
        try {
            if (this.helpers.numberPad) this.helpers.numberPad.hide();
            if (this.helpers.calendar) this.helpers.calendar.hide();
            if (this.helpers.stringSelector) this.helpers.stringSelector.hide();
        } catch (error) {
            console.error('隐藏辅助控件失败:', error);
        }
    };
    
    /**
     * 显示数字键盘
     */
    EditWidget.prototype.showNumberPad = function(cellX, cellY) {
        try {
            if (!this.helpers.numberPad) {
                var self = this;
                this.helpers.numberPad = new global.NumberPadWidget('table-container', function(value) {
                    self.handleHelperInput('number', value);
                });
            }
            this.helpers.numberPad.moveNumPad(cellX - 20, cellY + 10);
            this.helpers.numberPad.show();
        } catch (error) {
            console.error('显示数字键盘失败:', error);
        }
    };
    
    /**
     * 显示日历
     */
    EditWidget.prototype.showCalendar = function(cellX, cellY) {
        try {
            if (!this.helpers.calendar) {
                var self = this;
                this.helpers.calendar = new global.CalendarWidget('table-container', function(days) {
                    self.handleHelperInput('date', days);
                });
            }
            this.helpers.calendar.moveCalendar(cellX - 20, cellY + 10);
            this.helpers.calendar.show();
        } catch (error) {
            console.error('显示日历失败:', error);
        }
    };
    
    /**
     * 显示字符串选择器
     */
    EditWidget.prototype.showStringSelector = function(cellX, cellY) {
        try {
            if (!this.helpers.stringSelector) {
                var stringOptions = ['北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '武汉', '西安', '重庆'];
                var self = this;
                this.helpers.stringSelector = new global.StringSelectorWidget('table-container', stringOptions, function(selectedString) {
                    self.handleHelperInput('string', selectedString);
                });
            }
            this.helpers.stringSelector.moveStringSelector(cellX - 20, cellY + 10);
            this.helpers.stringSelector.show();
        } catch (error) {
            console.error('显示字符串选择器失败:', error);
        }
    };
    
    /**
     * 处理辅助控件输入
     */
    EditWidget.prototype.handleHelperInput = function(type, value) {
        if (!this.state.globalInput) return;
        
        var formattedValue = this.formatHelperValue(type, value, this.state.globalInput.value);
        this.state.globalInput.value = formattedValue;
        this.state.globalInput.style.caretColor = '#2c3e50';
        this.state.globalInput.dataset.isFirstClick = 'false';
        this.state.globalInput.focus();
        this.hideAllHelpers();
    };
    
    /**
     * 格式化辅助控件值
     */
    EditWidget.prototype.formatHelperValue = function(type, value, currentValue) {
        switch (type) {
            case 'number':
                if (value === 'C') return '';
                if (value === '←') return currentValue.slice(0, -1);
                return currentValue + value;
            case 'date':
                var baseDate = new Date(2023, 0, 1);
                var selectedDate = new Date(baseDate.getTime() + value * 86400000);
                var year = selectedDate.getFullYear();
                var month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                var day = String(selectedDate.getDate()).padStart(2, '0');
                return year + '-' + month + '-' + day;
            case 'string':
                return value;
            default:
                return String(value);
        }
    };

    // ========================================
    // 销毁
    // ========================================
    
    /**
     * 销毁控件
     */
    EditWidget.prototype.destroy = function() {
        // 隐藏所有辅助控件
        this.hideAllHelpers();
        
        // 移除全局输入框
        if (this.state.globalInput) {
            this.state.globalInput.parentNode.removeChild(this.state.globalInput);
            this.state.globalInput = null;
        }
        
        // 清理状态
        this.state.isEditing = false;
        this.state.currentCell = { row: -1, col: -1 };
        
        // 销毁辅助控件
        if (this.helpers.numberPad) this.helpers.numberPad.destroy();
        if (this.helpers.calendar) this.helpers.calendar.destroy();
        if (this.helpers.stringSelector) this.helpers.stringSelector.destroy();
    };

    // 暴露到全局
    global.EditWidget = EditWidget;
    
})(window);