/**
 * 表格筛选交互协调器 - ES5版本
 * 
 * 功能职责：
 * - 处理筛选相关的Canvas交互事件
 * - 协调FilterManager和FilterPanel的通信
 * - 管理筛选面板的显示和隐藏
 * - 处理筛选箭头的点击检测
 * - 提供筛选状态的可视化反馈
 * 
 * 设计模式：协调者模式 + 观察者模式
 * 兼容性：Firefox 52+ (ES5语法)
 */
(function(global) {
    'use strict';

    /**
     * TableFilter - 表格筛选交互协调器
     * @param {HTMLCanvasElement} canvas Canvas元素
     * @param {Object} config 配置对象
     * @param {Object} dependencies 依赖注入
     */
    function TableFilter(canvas, config, dependencies) {
        // 基本配置
        this.canvas = canvas;
        this.config = config;
        this.dependencies = dependencies || {};
        
        // 依赖注入
        this.eventManager = dependencies.eventManager || global.globalEventManager;
        this.tableCore = dependencies.tableCore;
        this.renderer = dependencies.renderer;
        
        // 筛选组件引用
        this.filterManager = null;
        this.filterPanel = null;
        
        // 交互状态
        this.state = {
            // 当前显示筛选面板的列
            activePanelColumn: -1,
            // 筛选箭头悬停状态
            hoveredFilterArrow: -1,
            // 筛选面板是否可见
            isPanelVisible: false,
            // 筛选箭头区域缓存
            filterArrowRects: []
        };
        
        // 交互配置
        this.interactionConfig = {
            // 筛选箭头尺寸
            arrowWidth: 12,
            arrowHeight: 8,
            // 筛选箭头边距
            arrowMarginRight: 8,
            // 点击容忍度
            clickTolerance: 2
        };
        
        this.initialize();
    }

    // ========================================
    // 初始化
    // ========================================
    
    /**
     * 初始化表格筛选系统
     */
    TableFilter.prototype.initialize = function() {
        this.createFilterManager();
        this.bindEvents();
        this.setupCanvasInteraction();
    };
    
    /**
     * 创建筛选管理器
     */
    TableFilter.prototype.createFilterManager = function() {
        try {
            this.filterManager = new global.FilterManager(this.config, {
                eventManager: this.eventManager,
                tableCore: this.tableCore,
                db: this.tableCore.db
            });
        } catch (error) {
            console.error('创建FilterManager失败:', error);
        }
    };
    
    /**
     * 绑定事件
     */
    TableFilter.prototype.bindEvents = function() {
        var self = this;
        
        if (this.eventManager && global.EVENTS) {
            // 监听筛选应用事件
            this.eventManager.on(global.EVENTS.FILTER_APPLIED, function(data) {
                self.handleFilterApplied(data);
            });
            
            // 监听筛选面板事件
            this.eventManager.on(global.EVENTS.FILTER_PANEL_CLOSED, function() {
                self.handlePanelClosed();
            });
            
            // 监听表格渲染完成事件
            this.eventManager.on(global.EVENTS.TABLE_RENDERED, function() {
                self.updateFilterArrowRects();
            });
        }
    };
    
    /**
     * 设置Canvas交互
     */
    TableFilter.prototype.setupCanvasInteraction = function() {
        var self = this;
        
        // 点击事件处理
        this.canvas.addEventListener('click', function(e) {
            self.handleCanvasClick(e);
        });
        
        // 鼠标移动事件处理
        this.canvas.addEventListener('mousemove', function(e) {
            self.handleCanvasMouseMove(e);
        });
        
        // 鼠标离开事件处理
        this.canvas.addEventListener('mouseleave', function(e) {
            self.handleCanvasMouseLeave(e);
        });
    };

    // ========================================
    // Canvas交互处理
    // ========================================
    
    /**
     * 处理Canvas点击事件
     * @param {MouseEvent} e 鼠标事件
     */
    TableFilter.prototype.handleCanvasClick = function(e) {
        if (!this.canvas) return;
        
        var rect = this.canvas.getBoundingClientRect();
        var clickX = e.clientX - rect.left;
        var clickY = e.clientY - rect.top;
        
        // 检查是否点击了筛选箭头
        var clickedColumn = this.getFilterArrowColumnAt(clickX, clickY);
        
        if (clickedColumn >= 0) {
            e.preventDefault();
            e.stopPropagation();
            this.showFilterPanel(clickedColumn);
        } else {
            // 点击其他区域，隐藏筛选面板
            this.hideFilterPanel();
        }
    };
    
    /**
     * 处理Canvas鼠标移动事件
     * @param {MouseEvent} e 鼠标事件
     */
    TableFilter.prototype.handleCanvasMouseMove = function(e) {
        if (!this.canvas) return;
        
        var rect = this.canvas.getBoundingClientRect();
        var mouseX = e.clientX - rect.left;
        var mouseY = e.clientY - rect.top;
        
        // 检查鼠标是否悬停在筛选箭头上
        var hoveredColumn = this.getFilterArrowColumnAt(mouseX, mouseY);
        
        if (hoveredColumn !== this.state.hoveredFilterArrow) {
            this.state.hoveredFilterArrow = hoveredColumn;
            
            // 更新鼠标样式
            this.canvas.style.cursor = hoveredColumn >= 0 ? 'pointer' : 'default';
            
            // 触发重绘（如果需要悬停效果）
            if (this.renderer && this.renderer.render) {
                this.renderer.render();
            }
        }
    };
    
    /**
     * 处理Canvas鼠标离开事件
     * @param {MouseEvent} e 鼠标事件
     */
    TableFilter.prototype.handleCanvasMouseLeave = function(e) {
        if (this.state.hoveredFilterArrow >= 0) {
            this.state.hoveredFilterArrow = -1;
            this.canvas.style.cursor = 'default';
            
            if (this.renderer && this.renderer.render) {
                this.renderer.render();
            }
        }
    };

    // ========================================
    // 筛选箭头检测
    // ========================================
    
    /**
     * 获取指定坐标处的筛选箭头列索引
     * @param {number} x X坐标
     * @param {number} y Y坐标
     * @returns {number} 列索引，-1表示未找到
     */
    TableFilter.prototype.getFilterArrowColumnAt = function(x, y) {
        var tableConfig = this.config.getTableConfig();
        
        // 检查是否在表头区域
        if (y < 0 || y > tableConfig.headerHeight) {
            return -1;
        }
        
        // 检查是否在表格数据区域
        if (x < tableConfig.rowHeaderWidth) {
            return -1;
        }
        
        // 计算列索引
        var dataAreaX = x - tableConfig.rowHeaderWidth;
        var columnIndex = Math.floor(dataAreaX / tableConfig.cellWidth);
        
        if (columnIndex < 0 || columnIndex >= this.tableCore.db.maxCols) {
            return -1;
        }
        
        // 🎯 新增：只响应列头右侧1/4区域的点击
        var colStartX = tableConfig.rowHeaderWidth + (columnIndex * tableConfig.cellWidth);
        var relativeX = x - colStartX;
        var quarterWidth = tableConfig.cellWidth / 4;
        var threeQuarterWidth = tableConfig.cellWidth * 3 / 4;
        
        // 只有点击在右侧1/4区域内才继续检查筛选箭头
        if (relativeX < threeQuarterWidth || relativeX > tableConfig.cellWidth) {
            return -1; // 不在右侧1/4区域
        }
        
        // 计算筛选箭头的精确位置
        var arrowRect = this.getFilterArrowRect(columnIndex);
        
        if (x >= arrowRect.left && x <= arrowRect.right &&
            y >= arrowRect.top && y <= arrowRect.bottom) {
            return columnIndex;
        }
        
        return -1;
    };
    
    /**
     * 获取筛选箭头的矩形区域
     * @param {number} columnIndex 列索引
     * @returns {Object} 矩形区域 {left, top, right, bottom}
     */
    TableFilter.prototype.getFilterArrowRect = function(columnIndex) {
        var tableConfig = this.config.getTableConfig();
        
        var columnLeft = tableConfig.rowHeaderWidth + columnIndex * tableConfig.cellWidth;
        
        // 🎯 新的筛选箭头区域：右侧1/4区域
        var quarterWidth = tableConfig.cellWidth / 4;
        var arrowLeft = columnLeft + tableConfig.cellWidth * 3 / 4;  // 右1/4区域起始位置
        var arrowRight = columnLeft + tableConfig.cellWidth;        // 列的右边界
        var arrowTop = 5;  // 稍微缩小点击区域
        var arrowBottom = tableConfig.headerHeight - 5;
        
        return {
            left: arrowLeft,
            top: arrowTop,
            right: arrowRight,
            bottom: arrowBottom
        };
    };
    
    /**
     * 更新筛选箭头区域缓存
     */
    TableFilter.prototype.updateFilterArrowRects = function() {
        this.state.filterArrowRects = [];
        
        for (var col = 0; col < this.tableCore.db.maxCols; col++) {
            this.state.filterArrowRects[col] = this.getFilterArrowRect(col);
        }
    };

    // ========================================
    // 筛选面板管理
    // ========================================
    
    /**
     * 显示筛选面板
     * @param {number} columnIndex 列索引
     */
    TableFilter.prototype.showFilterPanel = function(columnIndex) {
        // 先隐藏现有面板
        this.hideFilterPanel();
        
        try {
            // 创建或获取筛选面板实例
            if (!this.filterPanel && global.FilterPanel) {
                this.filterPanel = global.FilterPanel.getInstance(this.canvas, this.config, {
                    eventManager: this.eventManager,
                    tableCore: this.tableCore,
                    filterManager: this.filterManager
                });
            }
            
            if (this.filterPanel) {
                // 计算面板位置
                var panelPosition = this.calculatePanelPosition(columnIndex);
                
                // 显示面板
                this.filterPanel.show(columnIndex, panelPosition.x, panelPosition.y);
                
                this.state.activePanelColumn = columnIndex;
                this.state.isPanelVisible = true;
            }
            
        } catch (error) {
            console.error('显示筛选面板失败:', error);
        }
    };
    
    /**
     * 隐藏筛选面板
     */
    TableFilter.prototype.hideFilterPanel = function() {
        if (this.filterPanel && this.state.isPanelVisible) {
            this.filterPanel.hide();
            this.state.activePanelColumn = -1;
            this.state.isPanelVisible = false;
        }
    };
    
    /**
     * 计算筛选面板位置 - 精确对齐到列
     * @param {number} columnIndex 列索引
     * @returns {Object} 位置信息 {x, y}
     */
    TableFilter.prototype.calculatePanelPosition = function(columnIndex) {
        var canvasRect = this.canvas.getBoundingClientRect();
        var tableConfig = this.config.getTableConfig();
        
        // 🎯 精确计算列的位置
        // Canvas最左边线 = 该列表格的最左边线
        var columnLeftX = canvasRect.left + tableConfig.rowHeaderWidth + (columnIndex * tableConfig.cellWidth);
        
        // Canvas最顶部 = 该列表头的最下边线
        var headerBottomY = canvasRect.top + tableConfig.headerHeight;
        
        // 🎯 完美对齐：无任何偏移
        var panelX = columnLeftX;  // 左边线完全对齐
        var panelY = headerBottomY; // 顶部完全贴合表头底部
        
        // 预估面板尺寸
        var panelWidth = 200;
        var panelHeight = 300;
        
        // 智能边界检查和调整
        // 检查右边界 - 如果超出屏幕，向左调整
        if (panelX + panelWidth > window.innerWidth) {
            panelX = window.innerWidth - panelWidth - 10;
        }
        
        // 检查左边界 - 确保不超出屏幕左侧
        if (panelX < 10) {
            panelX = 10;
        }
        
        // 检查下边界 - 如果超出屏幕，显示在表头上方
        if (panelY + panelHeight > window.innerHeight) {
            panelY = canvasRect.top - panelHeight;
        }
        
        // 检查上边界 - 确保不超出屏幕顶部
        if (panelY < 10) {
            panelY = 10;
        }
        
        return { x: panelX, y: panelY };
    };

    // ========================================
    // 事件处理
    // ========================================
    
    /**
     * 处理筛选应用事件
     * @param {Object} data 事件数据
     */
    TableFilter.prototype.handleFilterApplied = function(data) {
        // 触发表格重新渲染
        if (this.tableCore && this.tableCore.render) {
            this.tableCore.render();
        }
        
        // 更新状态信息
        this.updateStatusInfo(data.filterStats);
        
        // 通知其他组件
        if (this.eventManager && global.EVENTS) {
            this.eventManager.emit(global.EVENTS.TABLE_FILTERED, {
                filterStats: data.filterStats
            });
        }
    };
    
    /**
     * 处理筛选面板关闭事件
     */
    TableFilter.prototype.handlePanelClosed = function() {
        this.state.activePanelColumn = -1;
        this.state.isPanelVisible = false;
    };

    // ========================================
    // 筛选操作接口
    // ========================================
    
    /**
     * 应用列筛选
     * @param {number} columnIndex 列索引
     * @param {Object} filterCondition 筛选条件
     */
    TableFilter.prototype.applyColumnFilter = function(columnIndex, filterCondition) {
        if (this.filterManager) {
            this.filterManager.setColumnFilter(columnIndex, filterCondition);
        }
    };
    
    /**
     * 清除列筛选
     * @param {number} columnIndex 列索引
     */
    TableFilter.prototype.clearColumnFilter = function(columnIndex) {
        if (this.filterManager) {
            this.filterManager.clearColumnFilter(columnIndex);
        }
    };
    
    /**
     * 清除所有筛选
     */
    TableFilter.prototype.clearAllFilters = function() {
        if (this.filterManager) {
            this.filterManager.clearAllFilters();
        }
    };
    
    /**
     * 设置全局搜索
     * @param {string} searchText 搜索文本
     */
    TableFilter.prototype.setGlobalSearch = function(searchText) {
        if (this.filterManager) {
            this.filterManager.setGlobalSearch(searchText);
        }
    };

    // ========================================
    // 状态获取
    // ========================================
    
    /**
     * 获取列筛选条件
     * @param {number} columnIndex 列索引
     */
    TableFilter.prototype.getColumnFilter = function(columnIndex) {
        return this.filterManager ? this.filterManager.getColumnFilter(columnIndex) : null;
    };
    
    /**
     * 获取筛选统计信息
     */
    TableFilter.prototype.getFilterStats = function() {
        return this.filterManager ? this.filterManager.getFilterStats() : null;
    };
    
    /**
     * 检查列是否有筛选条件
     * @param {number} columnIndex 列索引
     */
    TableFilter.prototype.hasColumnFilter = function(columnIndex) {
        var filter = this.getColumnFilter(columnIndex);
        return filter !== null && filter !== undefined;
    };
    
    /**
     * 获取当前悬停的筛选箭头列
     */
    TableFilter.prototype.getHoveredFilterArrow = function() {
        return this.state.hoveredFilterArrow;
    };

    // ========================================
    // 工具方法
    // ========================================
    
    /**
     * 更新状态信息显示
     * @param {Object} filterStats 筛选统计信息
     */
    TableFilter.prototype.updateStatusInfo = function(filterStats) {
        try {
            var statusText = document.getElementById('status-text');
            if (statusText && filterStats) {
                var message;
                if (filterStats.hasActiveFilters) {
                    message = '行数: ' + filterStats.visibleRows + '/' + filterStats.totalRows + 
                             ' (已筛选 ' + filterStats.filteredPercentage + '%)';
                } else {
                    message = '行数: ' + filterStats.totalRows + ' (无筛选)';
                }
                statusText.textContent = message;
                statusText.style.color = filterStats.hasActiveFilters ? '#3498db' : '#ecf0f1';
            }
        } catch (error) {
            console.error('更新状态信息失败:', error);
        }
    };

    // ========================================
    // 销毁
    // ========================================
    
    /**
     * 销毁筛选系统
     */
    TableFilter.prototype.destroy = function() {
        // 隐藏筛选面板
        this.hideFilterPanel();
        
        // 销毁筛选管理器
        if (this.filterManager) {
            this.filterManager.destroy();
            this.filterManager = null;
        }
        
        // 清理状态
        this.state.activePanelColumn = -1;
        this.state.hoveredFilterArrow = -1;
        this.state.isPanelVisible = false;
        this.state.filterArrowRects = [];
        
        // 重置鼠标样式
        if (this.canvas) {
            this.canvas.style.cursor = 'default';
        }
    };

    // 暴露到全局
    global.TableFilter = TableFilter;
    
})(window);