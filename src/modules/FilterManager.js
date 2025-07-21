/**
 * 筛选管理器 - ES5版本
 * 
 * 功能职责：
 * - 管理所有筛选条件和状态
 * - 提供高性能的筛选算法
 * - 实现筛选结果缓存机制
 * - 支持多种筛选类型（值筛选、文本搜索、数值范围）
 * - 提供筛选性能统计
 * 
 * 设计模式：策略模式 + 缓存模式
 * 兼容性：Firefox 52+ (ES5语法)
 */
(function(global) {
    'use strict';

    /**
     * FilterManager - 筛选管理器
     * @param {Object} config 配置对象
     * @param {Object} dependencies 依赖注入
     */
    function FilterManager(config, dependencies) {
        // 基本配置
        this.config = config;
        this.dependencies = dependencies || {};
        
        // 依赖注入
        this.eventManager = dependencies.eventManager || global.globalEventManager;
        this.tableCore = dependencies.tableCore;
        this.db = dependencies.db;
        
        // 筛选状态
        this.state = {
            // 每列的筛选条件 { columnIndex: { type: 'values', selectedItems: [...] } }
            columnFilters: {},
            // 全局搜索条件
            globalSearch: '',
            // 是否有活动筛选
            hasActiveFilters: false,
            // 筛选结果缓存
            filterCache: {},
            // 筛选历史
            filterHistory: []
        };
        
        // 性能统计
        this.performanceStats = {
            totalFilters: 0,
            averageFilterTime: 0,
            lastFilterTime: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalCacheQueries: 0
        };
        
        // 筛选策略映射
        this.filterStrategies = {
            'values': this.applyValuesFilter.bind(this),
            'text': this.applyTextFilter.bind(this),
            'number': this.applyNumberFilter.bind(this),
            'global': this.applyGlobalSearch.bind(this)
        };
        
        this.initialize();
    }

    // ========================================
    // 初始化
    // ========================================
    
    /**
     * 初始化筛选管理器
     */
    FilterManager.prototype.initialize = function() {
        this.bindEvents();
    };
    
    /**
     * 绑定事件
     */
    FilterManager.prototype.bindEvents = function() {
        var self = this;
        
        if (this.eventManager && global.EVENTS) {
            // 监听表格数据变化，清空缓存
            this.eventManager.on(global.EVENTS.TABLE_DATA_CHANGED, function() {
                self.clearCache();
            });
        }
    };

    // ========================================
    // 筛选条件管理
    // ========================================
    
    /**
     * 设置列筛选条件
     * @param {number} columnIndex 列索引
     * @param {Object} filterCondition 筛选条件
     */
    FilterManager.prototype.setColumnFilter = function(columnIndex, filterCondition) {
        if (filterCondition === null || filterCondition === undefined) {
            // 清除筛选
            delete this.state.columnFilters[columnIndex];
        } else {
            this.state.columnFilters[columnIndex] = filterCondition;
        }
        
        this.updateActiveFilterState();
        this.addToHistory('columnFilter', { columnIndex: columnIndex, condition: filterCondition });
        this.applyAllFilters();
    };
    
    /**
     * 获取列筛选条件
     * @param {number} columnIndex 列索引
     */
    FilterManager.prototype.getColumnFilter = function(columnIndex) {
        return this.state.columnFilters[columnIndex] || null;
    };
    
    /**
     * 设置全局搜索条件
     * @param {string} searchText 搜索文本
     */
    FilterManager.prototype.setGlobalSearch = function(searchText) {
        this.state.globalSearch = searchText || '';
        this.updateActiveFilterState();
        this.addToHistory('globalSearch', { text: searchText });
        this.applyAllFilters();
    };
    
    /**
     * 清除所有筛选条件
     */
    FilterManager.prototype.clearAllFilters = function() {
        this.state.columnFilters = {};
        this.state.globalSearch = '';
        this.updateActiveFilterState();
        this.addToHistory('clearAll', {});
        this.applyAllFilters();
    };
    
    /**
     * 清除指定列的筛选条件
     * @param {number} columnIndex 列索引
     */
    FilterManager.prototype.clearColumnFilter = function(columnIndex) {
        this.setColumnFilter(columnIndex, null);
    };

    // ========================================
    // 筛选执行
    // ========================================
    
    /**
     * 应用所有筛选条件
     */
    FilterManager.prototype.applyAllFilters = function() {
        if (!this.db) return;
        
        var startTime = Date.now();
        
        // 检查缓存
        var cacheKey = this.generateCacheKey();
        if (this.state.filterCache[cacheKey]) {
            this.performanceStats.cacheHits++;
            this.performanceStats.totalCacheQueries++;
            this.applyFilterResult(this.state.filterCache[cacheKey]);
            return;
        }
        
        this.performanceStats.cacheMisses++;
        this.performanceStats.totalCacheQueries++;
        
        // 如果没有任何筛选条件，恢复所有行
        if (!this.state.hasActiveFilters) {
            this.db.resetDisplayOrder();
            this.notifyFilterComplete();
            return;
        }
        
        // 获取所有行索引作为初始集合
        var validRowIndices = [];
        for (var i = 0; i < this.db.totalRows; i++) {
            validRowIndices.push(i);
        }
        
        // 使用数据库的筛选接口
        if (this.db.getFilteredRowIndices) {
            validRowIndices = this.db.getFilteredRowIndices(this.state.columnFilters);
        } else {
            // 依次应用每列的筛选条件（回退方法）
            for (var columnIndex in this.state.columnFilters) {
                if (this.state.columnFilters.hasOwnProperty(columnIndex)) {
                    var filterCondition = this.state.columnFilters[columnIndex];
                    var strategy = this.filterStrategies[filterCondition.type];
                    
                    if (strategy) {
                        validRowIndices = strategy(validRowIndices, parseInt(columnIndex), filterCondition);
                    }
                }
            }
        }
        
        // 应用全局搜索
        if (this.state.globalSearch) {
            validRowIndices = this.filterStrategies.global(validRowIndices, -1, { text: this.state.globalSearch });
        }
        
        // 缓存结果
        this.state.filterCache[cacheKey] = validRowIndices;
        
        // 应用筛选结果
        this.applyFilterResult(validRowIndices);
        
        // 更新性能统计
        var filterTime = Date.now() - startTime;
        this.updatePerformanceStats(filterTime);
        
        this.notifyFilterComplete();
    };
    
    /**
     * 应用筛选结果到数据库
     * @param {Array} validRowIndices 有效行索引数组
     */
    FilterManager.prototype.applyFilterResult = function(validRowIndices) {
        if (!this.db) return;
        
        this.db.visibleRows = validRowIndices.length;
        
        // 更新displayIndices
        for (var i = 0; i < validRowIndices.length; i++) {
            this.db.displayIndices[i] = validRowIndices[i];
        }
        
        // 清空剩余的displayIndices
        for (var j = validRowIndices.length; j < this.db.maxRows; j++) {
            this.db.displayIndices[j] = -1;
        }
    };

    // ========================================
    // 筛选策略实现
    // ========================================
    
    /**
     * 值筛选策略
     * @param {Array} rowIndices 行索引数组
     * @param {number} columnIndex 列索引
     * @param {Object} filterCondition 筛选条件
     */
    FilterManager.prototype.applyValuesFilter = function(rowIndices, columnIndex, filterCondition) {
        var selectedItems = filterCondition.selectedItems || [];
        var selectedSet = {};
        
        // 构建快速查找集合
        for (var i = 0; i < selectedItems.length; i++) {
            selectedSet[selectedItems[i]] = true;
        }
        
        var result = [];
        for (var j = 0; j < rowIndices.length; j++) {
            var rowIndex = rowIndices[j];
            var cellValue = this.db.getValue(rowIndex, columnIndex);
            var displayValue = cellValue === null || cellValue === undefined ? '' : String(cellValue);
            
            if (selectedSet[displayValue]) {
                result.push(rowIndex);
            }
        }
        
        return result;
    };
    
    /**
     * 文本搜索策略
     * @param {Array} rowIndices 行索引数组
     * @param {number} columnIndex 列索引
     * @param {Object} filterCondition 筛选条件
     */
    FilterManager.prototype.applyTextFilter = function(rowIndices, columnIndex, filterCondition) {
        var searchText = (filterCondition.text || '').toLowerCase();
        if (!searchText) return rowIndices;
        
        var result = [];
        for (var i = 0; i < rowIndices.length; i++) {
            var rowIndex = rowIndices[i];
            var cellValue = this.db.getValue(rowIndex, columnIndex);
            var displayValue = cellValue === null || cellValue === undefined ? '' : String(cellValue).toLowerCase();
            
            if (displayValue.indexOf(searchText) >= 0) {
                result.push(rowIndex);
            }
        }
        
        return result;
    };
    
    /**
     * 数值范围筛选策略
     * @param {Array} rowIndices 行索引数组
     * @param {number} columnIndex 列索引
     * @param {Object} filterCondition 筛选条件
     */
    FilterManager.prototype.applyNumberFilter = function(rowIndices, columnIndex, filterCondition) {
        var min = filterCondition.min;
        var max = filterCondition.max;
        
        var result = [];
        for (var i = 0; i < rowIndices.length; i++) {
            var rowIndex = rowIndices[i];
            var cellValue = this.db.getValue(rowIndex, columnIndex);
            var numValue = parseFloat(cellValue);
            
            if (!isNaN(numValue)) {
                var valid = true;
                if (min !== undefined && numValue < min) valid = false;
                if (max !== undefined && numValue > max) valid = false;
                
                if (valid) {
                    result.push(rowIndex);
                }
            }
        }
        
        return result;
    };
    
    /**
     * 全局搜索策略
     * @param {Array} rowIndices 行索引数组
     * @param {number} columnIndex 列索引（全局搜索时忽略）
     * @param {Object} filterCondition 筛选条件
     */
    FilterManager.prototype.applyGlobalSearch = function(rowIndices, columnIndex, filterCondition) {
        var searchText = (filterCondition.text || '').toLowerCase();
        if (!searchText) return rowIndices;
        
        var result = [];
        for (var i = 0; i < rowIndices.length; i++) {
            var rowIndex = rowIndices[i];
            var found = false;
            
            // 搜索所有列
            for (var col = 0; col < this.db.maxCols && !found; col++) {
                var cellValue = this.db.getValue(rowIndex, col);
                var displayValue = cellValue === null || cellValue === undefined ? '' : String(cellValue).toLowerCase();
                
                if (displayValue.indexOf(searchText) >= 0) {
                    found = true;
                }
            }
            
            if (found) {
                result.push(rowIndex);
            }
        }
        
        return result;
    };

    // ========================================
    // 筛选数据获取
    // ========================================
    
    /**
     * 获取列的唯一值
     * @param {number} columnIndex 列索引
     * @returns {Array} 唯一值数组
     */
    FilterManager.prototype.getColumnUniqueValues = function(columnIndex) {
        if (!this.db) return [];
        
        // 优先使用数据库的方法
        if (this.db.getColumnUniqueValues) {
            return this.db.getColumnUniqueValues(columnIndex);
        }
        
        // 回退实现
        var uniqueValues = {};
        var result = [];
        
        for (var i = 0; i < this.db.totalRows; i++) {
            var cellValue = this.db.getValue(i, columnIndex);
            var displayValue = cellValue === null || cellValue === undefined ? '' : String(cellValue);
            
            if (!uniqueValues[displayValue]) {
                uniqueValues[displayValue] = true;
                result.push(displayValue);
            }
        }
        
        // 排序唯一值
        result.sort(function(a, b) {
            // 数字排序
            var numA = parseFloat(a);
            var numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            // 字符串排序
            return a.localeCompare(b);
        });
        
        return result;
    };
    
    /**
     * 获取筛选统计信息
     */
    FilterManager.prototype.getFilterStats = function() {
        var totalRows = this.db ? this.db.totalRows : 0;
        var visibleRows = this.db ? this.db.visibleRows : 0;
        var filteredPercentage = totalRows > 0 ? Math.round((visibleRows / totalRows) * 100) : 100;
        
        return {
            totalRows: totalRows,
            visibleRows: visibleRows,
            filteredPercentage: filteredPercentage,
            hasActiveFilters: this.state.hasActiveFilters,
            activeFilterCount: Object.keys(this.state.columnFilters).length,
            performanceStats: this.performanceStats
        };
    };

    // ========================================
    // 缓存管理
    // ========================================
    
    /**
     * 生成缓存键
     */
    FilterManager.prototype.generateCacheKey = function() {
        var key = JSON.stringify({
            columnFilters: this.state.columnFilters,
            globalSearch: this.state.globalSearch
        });
        return key;
    };
    
    /**
     * 清空筛选缓存
     */
    FilterManager.prototype.clearCache = function() {
        this.state.filterCache = {};
        this.performanceStats.cacheHits = 0;
        this.performanceStats.cacheMisses = 0;
        this.performanceStats.totalCacheQueries = 0;
    };

    // ========================================
    // 工具方法
    // ========================================
    
    /**
     * 更新活动筛选状态
     */
    FilterManager.prototype.updateActiveFilterState = function() {
        var hasColumnFilters = Object.keys(this.state.columnFilters).length > 0;
        var hasGlobalSearch = this.state.globalSearch.length > 0;
        this.state.hasActiveFilters = hasColumnFilters || hasGlobalSearch;
    };
    
    /**
     * 添加到筛选历史
     * @param {string} type 操作类型
     * @param {Object} data 操作数据
     */
    FilterManager.prototype.addToHistory = function(type, data) {
        this.state.filterHistory.push({
            type: type,
            data: data,
            timestamp: Date.now()
        });
        
        // 限制历史记录数量
        if (this.state.filterHistory.length > 50) {
            this.state.filterHistory.shift();
        }
    };
    
    /**
     * 更新性能统计
     * @param {number} filterTime 筛选耗时（毫秒）
     */
    FilterManager.prototype.updatePerformanceStats = function(filterTime) {
        this.performanceStats.totalFilters++;
        this.performanceStats.lastFilterTime = filterTime;
        
        // 计算平均筛选时间
        var total = this.performanceStats.averageFilterTime * (this.performanceStats.totalFilters - 1) + filterTime;
        this.performanceStats.averageFilterTime = Math.round(total / this.performanceStats.totalFilters);
    };
    
    /**
     * 通知筛选完成
     */
    FilterManager.prototype.notifyFilterComplete = function() {
        if (this.eventManager && global.EVENTS) {
            this.eventManager.emit(global.EVENTS.FILTER_APPLIED, {
                filterStats: this.getFilterStats()
            });
        }
    };

    // ========================================
    // 销毁
    // ========================================
    
    /**
     * 销毁筛选管理器
     */
    FilterManager.prototype.destroy = function() {
        this.clearCache();
        this.state.columnFilters = {};
        this.state.globalSearch = '';
        this.state.filterHistory = [];
    };

    // 暴露到全局
    global.FilterManager = FilterManager;
    
})(window);