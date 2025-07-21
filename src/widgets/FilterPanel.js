/**
 * Canvas筛选面板控件 - ES5版本
 * 
 * 功能职责：
 * - 纯Canvas实现的筛选面板UI
 * - 支持多选值筛选、文本搜索
 * - 提供完整的键盘和鼠标交互
 * - 单例模式管理面板实例
 * - 高DPI显示支持
 * 
 * 设计模式：单例模式 + 观察者模式
 * 兼容性：Firefox 52+ (ES5语法)
 */
(function(global) {
    'use strict';

    // 全局单例实例
    var globalFilterPanelInstance = null;

    /**
     * FilterPanel - Canvas筛选面板控件
     * @param {HTMLCanvasElement} parentCanvas 父Canvas元素
     * @param {Object} config 配置对象
     * @param {Object} dependencies 依赖注入
     */
    function FilterPanel(parentCanvas, config, dependencies) {
        // 单例模式检查
        if (globalFilterPanelInstance) {
            return globalFilterPanelInstance;
        }
        globalFilterPanelInstance = this;
        
        // 基本配置
        this.parentCanvas = parentCanvas;
        this.config = config;
        this.dependencies = dependencies || {};
        
        // 依赖注入
        this.eventManager = dependencies.eventManager || global.globalEventManager;
        this.tableCore = dependencies.tableCore;
        this.filterManager = dependencies.filterManager;
        
        // Canvas元素
        this.canvas = null;
        this.ctx = null;
        
        // 面板状态
        this.state = {
            // 是否可见
            visible: false,
            // 当前筛选的列
            currentColumn: -1,
            // 面板位置
            x: 0,
            y: 0,
            // 面板尺寸
            width: 200,
            height: 300,
            // 搜索框内容
            searchText: '',
            // 搜索框焦点
            searchFocused: false,
            // 唯一值列表
            uniqueValues: [],
            // 选中的值
            selectedValues: {},
            // 滚动位置
            scrollTop: 0,
            // 悬停项目索引
            hoveredItemIndex: -1
        };
        
        // UI配置
        this.uiConfig = {
            // 面板样式
            backgroundColor: '#ffffff',
            borderColor: '#bdc3c7',
            borderWidth: 1,
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            
            // 搜索框样式
            searchHeight: 30,
            searchPadding: 8,
            searchBorderColor: '#3498db',
            searchBackgroundColor: '#ffffff',
            
            // 列表项样式
            itemHeight: 24,
            itemPadding: 8,
            itemHoverColor: '#e8f4f8',
            itemSelectedColor: '#d6eaf8',
            
            // 字体配置
            fontSize: 12,
            fontFamily: 'Cascadia Code, monospace',
            textColor: '#2c3e50',
            
            // 复选框样式
            checkboxSize: 14,
            checkboxMargin: 6
        };
        
        // 交互区域
        this.interactionAreas = {
            searchBox: null,
            itemList: null,
            items: []
        };
        
        this.initialize();
    }

    // ========================================
    // 单例模式接口
    // ========================================
    
    /**
     * 获取FilterPanel单例实例
     * @param {HTMLCanvasElement} parentCanvas 父Canvas元素
     * @param {Object} config 配置对象
     * @param {Object} dependencies 依赖注入
     */
    FilterPanel.getInstance = function(parentCanvas, config, dependencies) {
        if (!globalFilterPanelInstance) {
            new FilterPanel(parentCanvas, config, dependencies);
        }
        return globalFilterPanelInstance;
    };

    // ========================================
    // 初始化
    // ========================================
    
    /**
     * 初始化筛选面板
     */
    FilterPanel.prototype.initialize = function() {
        this.createCanvas();
        this.setupCanvasInteraction();
        this.bindEvents();
    };
    
    /**
     * 创建Canvas元素
     */
    FilterPanel.prototype.createCanvas = function() {
        // 移除已存在的筛选面板Canvas
        var existingCanvas = document.getElementById('filter-panel-canvas');
        if (existingCanvas) {
            existingCanvas.parentNode.removeChild(existingCanvas);
        }
        
        // 创建新的Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'filter-panel-canvas';
        this.canvas.style.position = 'absolute';
        this.canvas.style.zIndex = '3000';
        this.canvas.style.display = 'none';
        this.canvas.style.boxShadow = this.uiConfig.boxShadow;
        this.canvas.style.borderRadius = this.uiConfig.borderRadius + 'px';
        this.canvas.style.cursor = 'default';
        
        // 高DPI支持
        var devicePixelRatio = window.devicePixelRatio || 1;
        this.canvas.width = this.state.width * devicePixelRatio;
        this.canvas.height = this.state.height * devicePixelRatio;
        this.canvas.style.width = this.state.width + 'px';
        this.canvas.style.height = this.state.height + 'px';
        
        // 获取渲染上下文
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(devicePixelRatio, devicePixelRatio);
        
        // 添加到文档
        document.body.appendChild(this.canvas);
    };
    
    /**
     * 设置Canvas交互
     */
    FilterPanel.prototype.setupCanvasInteraction = function() {
        var self = this;
        
        // 鼠标事件
        this.canvas.addEventListener('click', function(e) {
            self.handleCanvasClick(e);
        });
        
        this.canvas.addEventListener('mousemove', function(e) {
            self.handleCanvasMouseMove(e);
        });
        
        this.canvas.addEventListener('wheel', function(e) {
            self.handleCanvasWheel(e);
        });
        
        // 键盘事件（当面板有焦点时）
        this.canvas.addEventListener('keydown', function(e) {
            self.handleCanvasKeyDown(e);
        });
        
        // 防止右键菜单
        this.canvas.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });
    };
    
    /**
     * 绑定事件
     */
    FilterPanel.prototype.bindEvents = function() {
        var self = this;
        
        // 监听全局点击事件，用于关闭面板
        document.addEventListener('click', function(e) {
            self.handleDocumentClick(e);
        });
        
        // 监听键盘事件
        document.addEventListener('keydown', function(e) {
            self.handleDocumentKeyDown(e);
        });
    };

    // ========================================
    // 面板显示和隐藏
    // ========================================
    
    /**
     * 显示筛选面板
     * @param {number} columnIndex 列索引
     * @param {number} x X坐标
     * @param {number} y Y坐标
     */
    FilterPanel.prototype.show = function(columnIndex, x, y) {
        this.state.currentColumn = columnIndex;
        this.state.x = x;
        this.state.y = y;
        this.state.visible = true;
        this.state.scrollTop = 0;
        this.state.searchText = '';
        this.state.hoveredItemIndex = -1;
        
        // 加载列数据
        this.loadColumnData(columnIndex);
        
        // 更新面板位置
        this.updatePanelPosition();
        
        // 显示Canvas
        this.canvas.style.display = 'block';
        this.canvas.style.left = x + 'px';
        this.canvas.style.top = y + 'px';
        
        // 设置焦点
        this.canvas.focus();
        this.canvas.tabIndex = 0;
        
        // 渲染面板
        this.render();
        
        // 触发事件
        this.notifyPanelShown(columnIndex);
    };
    
    /**
     * 隐藏筛选面板
     */
    FilterPanel.prototype.hide = function() {
        if (!this.state.visible) return;
        
        this.state.visible = false;
        this.canvas.style.display = 'none';
        
        // 触发事件
        this.notifyPanelHidden();
    };

    // ========================================
    // 数据加载
    // ========================================
    
    /**
     * 加载列数据
     * @param {number} columnIndex 列索引
     */
    FilterPanel.prototype.loadColumnData = function(columnIndex) {
        if (!this.filterManager) return;
        
        try {
            // 获取列的唯一值
            this.state.uniqueValues = this.filterManager.getColumnUniqueValues(columnIndex);
            
            // 获取当前筛选条件
            var currentFilter = this.filterManager.getColumnFilter(columnIndex);
            
            // 初始化选中状态
            this.state.selectedValues = {};
            
            if (currentFilter && currentFilter.type === 'values' && currentFilter.selectedItems) {
                // 恢复之前的选择
                for (var i = 0; i < currentFilter.selectedItems.length; i++) {
                    this.state.selectedValues[currentFilter.selectedItems[i]] = true;
                }
            } else {
                // 默认全选
                for (var j = 0; j < this.state.uniqueValues.length; j++) {
                    this.state.selectedValues[this.state.uniqueValues[j]] = true;
                }
            }
            
        } catch (error) {
            console.error('加载列数据失败:', error);
            this.state.uniqueValues = [];
            this.state.selectedValues = {};
        }
    };

    // ========================================
    // 渲染
    // ========================================
    
    /**
     * 渲染筛选面板
     */
    FilterPanel.prototype.render = function() {
        if (!this.ctx || !this.state.visible) return;
        
        try {
            // 清除画布
            this.ctx.clearRect(0, 0, this.state.width, this.state.height);
            
            // 绘制背景和边框
            this.drawBackground();
            
            // 绘制搜索框
            this.drawSearchBox();
            
            // 🎨 移除分隔线，保持简洁设计
            
            // 绘制全选/全不选按钮
            this.drawSelectAllButtons();
            
            // 绘制项目列表
            this.drawItemList();
            
            // 绘制滚动条（如果需要）
            this.drawScrollbar();
            
        } catch (error) {
            console.error('渲染筛选面板失败:', error);
        }
    };
    
    /**
     * 绘制背景和边框
     */
    FilterPanel.prototype.drawBackground = function() {
        this.ctx.fillStyle = this.uiConfig.backgroundColor;
        this.ctx.fillRect(0, 0, this.state.width, this.state.height);
        
        this.ctx.strokeStyle = this.uiConfig.borderColor;
        this.ctx.lineWidth = this.uiConfig.borderWidth;
        this.ctx.strokeRect(0, 0, this.state.width, this.state.height);
    };
    
    /**
     * 绘制搜索框
     */
    FilterPanel.prototype.drawSearchBox = function() {
        var searchY = 8;
        var searchWidth = this.state.width - 16;
        var searchHeight = this.uiConfig.searchHeight;
        
        // 搜索框背景
        this.ctx.fillStyle = this.uiConfig.searchBackgroundColor;
        this.ctx.fillRect(8, searchY, searchWidth, searchHeight);
        
        // 搜索框边框
        this.ctx.strokeStyle = this.state.searchFocused ? this.uiConfig.searchBorderColor : this.uiConfig.borderColor;
        this.ctx.lineWidth = this.state.searchFocused ? 2 : 1;
        this.ctx.strokeRect(8, searchY, searchWidth, searchHeight);
        
        // 搜索框文本
        this.ctx.fillStyle = this.uiConfig.textColor;
        this.ctx.font = this.uiConfig.fontSize + 'px ' + this.uiConfig.fontFamily;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        
        var displayText = this.state.searchText || '搜索...';
        var textColor = this.state.searchText ? this.uiConfig.textColor : '#95a5a6';
        this.ctx.fillStyle = textColor;
        this.ctx.fillText(displayText, 16, searchY + searchHeight / 2);
        
        // 记录搜索框区域
        this.interactionAreas.searchBox = {
            x: 8,
            y: searchY,
            width: searchWidth,
            height: searchHeight
        };
    };
    
    
    /**
     * 绘制全选/全不选按钮
     */
    FilterPanel.prototype.drawSelectAllButtons = function() {
        var buttonY = this.uiConfig.searchHeight + 18;  // 搜索框和按钮之间10px间距
        var buttonHeight = 22;  // 高度+2px
        var buttonWidth = 42;   // 宽度+2px
        
        // 全选按钮
        this.ctx.fillStyle = '#3498db';
        this.ctx.fillRect(8, buttonY, buttonWidth, buttonHeight);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px ' + this.uiConfig.fontFamily;  // 字体+1px
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('全选', 8 + buttonWidth / 2, buttonY + buttonHeight / 2);
        
        // 全不选按钮
        this.ctx.fillStyle = '#95a5a6';
        this.ctx.fillRect(58, buttonY, buttonWidth, buttonHeight);  // 调整位置适应新宽度
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText('清空', 58 + buttonWidth / 2, buttonY + buttonHeight / 2);
        
        // 确定按钮
        this.ctx.fillStyle = '#27ae60';
        this.ctx.fillRect(this.state.width - 50, buttonY, buttonWidth, buttonHeight);  // 调整位置适应新宽度
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText('确定', this.state.width - 50 + buttonWidth / 2, buttonY + buttonHeight / 2);
    };
    
    /**
     * 绘制项目列表
     */
    FilterPanel.prototype.drawItemList = function() {
        var listStartY = this.uiConfig.searchHeight + 48;  // 搜索框+10px+按钮(22px)+5px间距
        var listHeight = this.state.height - listStartY - 8;
        var visibleItems = this.getFilteredUniqueValues();
        
        this.interactionAreas.items = [];
        
        // 计算可见项目范围
        var startIndex = Math.floor(this.state.scrollTop / this.uiConfig.itemHeight);
        var endIndex = Math.min(visibleItems.length, startIndex + Math.ceil(listHeight / this.uiConfig.itemHeight) + 1);
        
        for (var i = startIndex; i < endIndex; i++) {
            var item = visibleItems[i];
            var itemY = listStartY + (i * this.uiConfig.itemHeight) - this.state.scrollTop;
            
            // 检查项目是否在可见区域内
            if (itemY + this.uiConfig.itemHeight < listStartY || itemY > listStartY + listHeight) {
                continue;
            }
            
            // 绘制项目背景
            if (i === this.state.hoveredItemIndex) {
                this.ctx.fillStyle = this.uiConfig.itemHoverColor;
                this.ctx.fillRect(8, itemY, this.state.width - 16, this.uiConfig.itemHeight);
            }
            
            // 绘制复选框
            var checkboxX = 16;
            var checkboxY = itemY + (this.uiConfig.itemHeight - this.uiConfig.checkboxSize) / 2;
            
            this.ctx.strokeStyle = this.uiConfig.borderColor;
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(checkboxX, checkboxY, this.uiConfig.checkboxSize, this.uiConfig.checkboxSize);
            
            // 绘制选中标记
            if (this.state.selectedValues[item]) {
                this.ctx.fillStyle = '#3498db';
                this.ctx.fillRect(checkboxX + 2, checkboxY + 2, this.uiConfig.checkboxSize - 4, this.uiConfig.checkboxSize - 4);
            } else {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(checkboxX + 1, checkboxY + 1, this.uiConfig.checkboxSize - 2, this.uiConfig.checkboxSize - 2);
            }
            
            // 绘制项目文本
            var textX = checkboxX + this.uiConfig.checkboxSize + this.uiConfig.checkboxMargin;
            var textY = itemY + this.uiConfig.itemHeight / 2;
            
            this.ctx.fillStyle = this.uiConfig.textColor;
            this.ctx.font = this.uiConfig.fontSize + 'px ' + this.uiConfig.fontFamily;
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            
            // 文本截断
            var maxTextWidth = this.state.width - textX - 8;
            var displayText = this.truncateText(item, maxTextWidth);
            this.ctx.fillText(displayText, textX, textY);
            
            // 记录交互区域
            this.interactionAreas.items.push({
                index: i,
                value: item,
                x: 8,
                y: itemY,
                width: this.state.width - 16,
                height: this.uiConfig.itemHeight
            });
        }
        
        // 记录列表区域
        this.interactionAreas.itemList = {
            x: 8,
            y: listStartY,
            width: this.state.width - 16,
            height: listHeight
        };
    };
    
    /**
     * 绘制滚动条
     */
    FilterPanel.prototype.drawScrollbar = function() {
        var visibleItems = this.getFilteredUniqueValues();
        var listStartY = this.uiConfig.searchHeight + 48;  // 搜索框+10px+按钮(22px)+5px间距
        var listHeight = this.state.height - listStartY - 8;
        var totalContentHeight = visibleItems.length * this.uiConfig.itemHeight;
        
        if (totalContentHeight <= listHeight) return; // 不需要滚动条
        
        var scrollbarWidth = 6;
        var scrollbarX = this.state.width - scrollbarWidth - 2;
        var scrollbarHeight = listHeight;
        
        // 滚动条轨道
        this.ctx.fillStyle = '#ecf0f1';
        this.ctx.fillRect(scrollbarX, listStartY, scrollbarWidth, scrollbarHeight);
        
        // 滚动条滑块
        var thumbHeight = Math.max(20, (listHeight / totalContentHeight) * scrollbarHeight);
        var thumbY = listStartY + (this.state.scrollTop / totalContentHeight) * scrollbarHeight;
        
        this.ctx.fillStyle = '#bdc3c7';
        this.ctx.fillRect(scrollbarX, thumbY, scrollbarWidth, thumbHeight);
    };

    // ========================================
    // 交互处理
    // ========================================
    
    /**
     * 处理Canvas点击事件
     * @param {MouseEvent} e 鼠标事件
     */
    FilterPanel.prototype.handleCanvasClick = function(e) {
        if (!this.state.visible) return;
        
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        
        // 检查搜索框点击
        if (this.isPointInArea(x, y, this.interactionAreas.searchBox)) {
            this.handleSearchBoxClick();
            return;
        }
        
        // 检查按钮点击
        if (this.isPointInButtonArea(x, y, 8, this.uiConfig.searchHeight + 18, 42, 22)) {
            this.selectAll();
            return;
        }
        
        if (this.isPointInButtonArea(x, y, 58, this.uiConfig.searchHeight + 18, 42, 22)) {
            this.selectNone();
            return;
        }
        
        if (this.isPointInButtonArea(x, y, this.state.width - 50, this.uiConfig.searchHeight + 18, 42, 22)) {
            this.applyFilter();
            return;
        }
        
        // 检查项目点击
        for (var i = 0; i < this.interactionAreas.items.length; i++) {
            var item = this.interactionAreas.items[i];
            if (this.isPointInArea(x, y, item)) {
                this.toggleItemSelection(item.value);
                break;
            }
        }
    };
    
    /**
     * 处理Canvas鼠标移动事件
     * @param {MouseEvent} e 鼠标事件
     */
    FilterPanel.prototype.handleCanvasMouseMove = function(e) {
        if (!this.state.visible) return;
        
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        
        var newHoveredIndex = -1;
        
        // 检查项目悬停
        for (var i = 0; i < this.interactionAreas.items.length; i++) {
            var item = this.interactionAreas.items[i];
            if (this.isPointInArea(x, y, item)) {
                newHoveredIndex = item.index;
                break;
            }
        }
        
        if (newHoveredIndex !== this.state.hoveredItemIndex) {
            this.state.hoveredItemIndex = newHoveredIndex;
            this.render();
        }
        
        // 更新鼠标样式
        var isOverButton = this.isPointInButtonArea(x, y, 8, this.uiConfig.searchHeight + 18, 42, 22) ||
                          this.isPointInButtonArea(x, y, 58, this.uiConfig.searchHeight + 18, 42, 22) ||
                          this.isPointInButtonArea(x, y, this.state.width - 50, this.uiConfig.searchHeight + 18, 42, 22);
        
        this.canvas.style.cursor = (newHoveredIndex >= 0 || isOverButton) ? 'pointer' : 'default';
    };
    
    /**
     * 处理Canvas滚轮事件
     * @param {WheelEvent} e 滚轮事件
     */
    FilterPanel.prototype.handleCanvasWheel = function(e) {
        if (!this.state.visible) return;
        
        e.preventDefault();
        
        var visibleItems = this.getFilteredUniqueValues();
        var listStartY = this.uiConfig.searchHeight + 48;  // 搜索框+10px+按钮(22px)+5px间距
        var listHeight = this.state.height - listStartY - 8;
        var totalContentHeight = visibleItems.length * this.uiConfig.itemHeight;
        var maxScrollTop = Math.max(0, totalContentHeight - listHeight);
        
        var delta = e.deltaY > 0 ? 30 : -30;
        this.state.scrollTop = Math.max(0, Math.min(maxScrollTop, this.state.scrollTop + delta));
        
        this.render();
    };
    
    /**
     * 处理Canvas键盘事件
     * @param {KeyboardEvent} e 键盘事件
     */
    FilterPanel.prototype.handleCanvasKeyDown = function(e) {
        if (!this.state.visible) return;
        
        switch (e.key) {
            case 'Escape':
                this.hide();
                e.preventDefault();
                break;
            case 'Enter':
                this.applyFilter();
                e.preventDefault();
                break;
        }
    };
    
    /**
     * 处理文档点击事件（用于关闭面板）
     * @param {MouseEvent} e 鼠标事件
     */
    FilterPanel.prototype.handleDocumentClick = function(e) {
        if (!this.state.visible) return;
        
        // 检查点击是否在面板内
        if (e.target === this.canvas) return;
        
        // 检查点击是否在父Canvas内（筛选箭头）
        if (e.target === this.parentCanvas) {
            var rect = this.parentCanvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            
            // 如果点击的是表头区域，不关闭面板
            var tableConfig = this.config.getTableConfig();
            if (y >= 0 && y <= tableConfig.headerHeight) {
                return;
            }
        }
        
        // 关闭面板
        this.hide();
    };

    // ========================================
    // 筛选操作
    // ========================================
    
    /**
     * 全选
     */
    FilterPanel.prototype.selectAll = function() {
        var visibleItems = this.getFilteredUniqueValues();
        for (var i = 0; i < visibleItems.length; i++) {
            this.state.selectedValues[visibleItems[i]] = true;
        }
        this.render();
    };
    
    /**
     * 全不选
     */
    FilterPanel.prototype.selectNone = function() {
        var visibleItems = this.getFilteredUniqueValues();
        for (var i = 0; i < visibleItems.length; i++) {
            this.state.selectedValues[visibleItems[i]] = false;
        }
        this.render();
    };
    
    /**
     * 切换项目选择状态
     * @param {string} value 值
     */
    FilterPanel.prototype.toggleItemSelection = function(value) {
        this.state.selectedValues[value] = !this.state.selectedValues[value];
        this.render();
    };
    
    /**
     * 应用筛选
     */
    FilterPanel.prototype.applyFilter = function() {
        if (!this.filterManager) return;
        
        // 收集选中的值
        var selectedItems = [];
        for (var value in this.state.selectedValues) {
            if (this.state.selectedValues[value]) {
                selectedItems.push(value);
            }
        }
        
        // 创建筛选条件
        var filterCondition = {
            type: 'values',
            selectedItems: selectedItems
        };
        
        // 应用筛选
        this.filterManager.setColumnFilter(this.state.currentColumn, filterCondition);
        
        // 隐藏面板
        this.hide();
    };

    // ========================================
    // 工具方法
    // ========================================
    
    /**
     * 获取筛选后的唯一值
     */
    FilterPanel.prototype.getFilteredUniqueValues = function() {
        if (!this.state.searchText) {
            return this.state.uniqueValues;
        }
        
        var searchText = this.state.searchText.toLowerCase();
        var filtered = [];
        
        for (var i = 0; i < this.state.uniqueValues.length; i++) {
            var value = this.state.uniqueValues[i];
            if (String(value).toLowerCase().indexOf(searchText) >= 0) {
                filtered.push(value);
            }
        }
        
        return filtered;
    };
    
    /**
     * 检查点是否在区域内
     * @param {number} x X坐标
     * @param {number} y Y坐标
     * @param {Object} area 区域对象
     */
    FilterPanel.prototype.isPointInArea = function(x, y, area) {
        if (!area) return false;
        return x >= area.x && x <= area.x + area.width &&
               y >= area.y && y <= area.y + area.height;
    };
    
    /**
     * 检查点是否在按钮区域内
     */
    FilterPanel.prototype.isPointInButtonArea = function(x, y, btnX, btnY, btnWidth, btnHeight) {
        return x >= btnX && x <= btnX + btnWidth && y >= btnY && y <= btnY + btnHeight;
    };
    
    /**
     * 文本截断
     * @param {string} text 原文本
     * @param {number} maxWidth 最大宽度
     */
    FilterPanel.prototype.truncateText = function(text, maxWidth) {
        this.ctx.font = this.uiConfig.fontSize + 'px ' + this.uiConfig.fontFamily;
        
        if (this.ctx.measureText(text).width <= maxWidth) {
            return text;
        }
        
        var truncated = text;
        while (this.ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
        }
        
        return truncated + '...';
    };
    
    /**
     * 更新面板位置
     */
    FilterPanel.prototype.updatePanelPosition = function() {
        // 检查边界并调整位置
        var maxX = window.innerWidth - this.state.width - 10;
        var maxY = window.innerHeight - this.state.height - 10;
        
        this.state.x = Math.max(10, Math.min(this.state.x, maxX));
        this.state.y = Math.max(10, Math.min(this.state.y, maxY));
    };
    
    /**
     * 处理搜索框点击
     */
    FilterPanel.prototype.handleSearchBoxClick = function() {
        this.state.searchFocused = true;
        this.render();
        
        // 简单的搜索输入模拟（实际应该使用更复杂的输入处理）
        var self = this;
        setTimeout(function() {
            var searchText = prompt('请输入搜索关键词:', self.state.searchText);
            if (searchText !== null) {
                self.state.searchText = searchText;
                self.state.scrollTop = 0;
                self.render();
            }
            self.state.searchFocused = false;
        }, 100);
    };

    // ========================================
    // 事件通知
    // ========================================
    
    /**
     * 通知面板显示
     */
    FilterPanel.prototype.notifyPanelShown = function(columnIndex) {
        if (this.eventManager && global.EVENTS) {
            this.eventManager.emit(global.EVENTS.FILTER_PANEL_SHOWN, {
                columnIndex: columnIndex
            });
        }
    };
    
    /**
     * 通知面板隐藏
     */
    FilterPanel.prototype.notifyPanelHidden = function() {
        if (this.eventManager && global.EVENTS) {
            this.eventManager.emit(global.EVENTS.FILTER_PANEL_CLOSED, {});
        }
    };

    // ========================================
    // 销毁
    // ========================================
    
    /**
     * 销毁筛选面板
     */
    FilterPanel.prototype.destroy = function() {
        // 隐藏面板
        this.hide();
        
        // 移除Canvas元素
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        // 清理状态
        this.state.visible = false;
        this.state.currentColumn = -1;
        this.state.uniqueValues = [];
        this.state.selectedValues = {};
        
        // 清空全局实例
        globalFilterPanelInstance = null;
    };

    // 暴露到全局
    global.FilterPanel = FilterPanel;
    
})(window);