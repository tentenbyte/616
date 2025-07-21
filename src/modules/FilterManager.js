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
        
        // 🎯 筛选历史栈系统
        this.filterStack = [];        // 筛选历史栈 - 每层是一个Uint32Array行索引
        this.filterOrder = [];        // 筛选列顺序 [col0, col1, col2, ...]
        this.filterConditions = {};   // 每列的筛选条件缓存 {col0: condition0, ...}
        
        this.initialize();
    }

    // ========================================
    // 初始化
    // ========================================
    
    /**
     * 初始化筛选管理器
     */
    FilterManager.prototype.initialize = function() {
        this.initializeFilterStack();
        this.bindEvents();
    };
    
    /**
     * 🎯 初始化筛选历史栈
     */
    FilterManager.prototype.initializeFilterStack = function() {
        if (!this.db) {
            return;
        }
        
        if (this.db.totalRows === 0) {
            this.filterStack = [];
            this.filterOrder = [];
            this.filterConditions = {};
            return;
        }
        
        // Level 0: 所有原始行索引
        var allRows = [];
        for (var i = 0; i < this.db.totalRows; i++) {
            allRows.push(i);
        }
        
        this.filterStack = [new Uint32Array(allRows)];
        this.filterOrder = [];
        this.filterConditions = {};
        
    };
    
    /**
     * 🔧 确保筛选栈已初始化（延迟初始化）
     */
    FilterManager.prototype.ensureFilterStackInitialized = function() {
        if (!this.db) return false;
        
        if (this.filterStack.length === 0 && this.db.totalRows > 0) {
            this.initializeFilterStack();
        }
        
        return this.filterStack.length > 0;
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
            // 🗑️ 清除筛选 - 使用栈系统
            delete this.state.columnFilters[columnIndex];
            this.removeFilterLevel(columnIndex);
        } else {
            // 🎯 设置筛选 - 使用栈系统
            this.state.columnFilters[columnIndex] = filterCondition;
            
            // 获取该列筛选前的有效行索引
            var effectiveRowIndices = this.getEffectiveRowsForColumn(columnIndex);
            
            // 应用筛选条件
            var strategy = this.filterStrategies[filterCondition.type];
            if (strategy) {
                var filteredRowIndices = strategy(effectiveRowIndices, columnIndex, filterCondition);
                
                // 更新筛选栈
                this.pushOrUpdateFilterLevel(columnIndex, filterCondition, filteredRowIndices);
            }
        }
        
        this.updateActiveFilterState();
        this.addToHistory('columnFilter', { columnIndex: columnIndex, condition: filterCondition });
        
        // 🎯 应用最新的筛选结果到视图
        this.applyLatestFilterResult();
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
    
    /**
     * 🎯 应用最新的筛选结果到视图
     */
    FilterManager.prototype.applyLatestFilterResult = function() {
        if (!this.db || this.filterStack.length === 0) return;
        
        // 获取栈顶的筛选结果
        var latestLevel = this.filterStack.length - 1;
        var latestRowIndices = Array.from(this.filterStack[latestLevel]);
        
        // 应用到数据库视图
        this.applyFilterResult(latestRowIndices);
        
        // 通知筛选完成
        this.notifyFilterComplete();
        
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
        
        // 🚀 构建uint32快速查找集合
        var selectedSet = {};
        for (var i = 0; i < selectedItems.length; i++) {
            selectedSet[selectedItems[i]] = true; // selectedItems现在是uint32数组
        }
        
        var result = [];
        var rawData = this.db.columns[columnIndex]; // 直接访问ArrayBuffer
        
        // 🔥 极速筛选：uint32直接比较，无解码开销
        for (var j = 0; j < rowIndices.length; j++) {
            var rowIndex = rowIndices[j];
            var encodedValue = rawData[rowIndex]; // uint32直接取值
            
            if (selectedSet[encodedValue]) { // uint32哈希查找
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
    // 🎯 筛选历史栈操作
    // ========================================
    
    /**
     * 🔍 查找列在筛选顺序中的级别
     * @param {number} columnIndex 列索引
     * @returns {number} 级别索引，-1表示未找到
     */
    FilterManager.prototype.findColumnLevel = function(columnIndex) {
        for (var i = 0; i < this.filterOrder.length; i++) {
            if (this.filterOrder[i] === columnIndex) {
                return i + 1; // +1因为Level 0是原始状态
            }
        }
        return -1; // 该列未参与筛选
    };
    
    /**
     * 🎯 获取指定级别之前的行索引（用于级联筛选）
     * @param {number} columnIndex 当前要设置筛选的列
     * @returns {Array} 有效的行索引数组
     */
    FilterManager.prototype.getEffectiveRowsForColumn = function(columnIndex) {
        // 🔧 确保筛选栈已初始化
        if (!this.ensureFilterStackInitialized()) {
            var allRows = [];
            for (var i = 0; i < this.db.totalRows; i++) {
                allRows.push(i);
            }
            return allRows;
        }
        
        var columnLevel = this.findColumnLevel(columnIndex);
        
        if (columnLevel === -1) {
            // 🆕 该列从未筛选过，使用当前最新的筛选结果
            var latestLevel = this.filterStack.length - 1;
            return Array.from(this.filterStack[latestLevel]);
        } else {
            // 🔄 该列已筛选过，回退到该列筛选前的状态
            var beforeLevel = columnLevel - 1;
            return Array.from(this.filterStack[beforeLevel]);
        }
    };
    
    /**
     * 📥 添加或更新筛选级别
     * @param {number} columnIndex 列索引
     * @param {Object} filterCondition 筛选条件
     * @param {Array} filteredRowIndices 筛选后的行索引
     */
    FilterManager.prototype.pushOrUpdateFilterLevel = function(columnIndex, filterCondition, filteredRowIndices) {
        var columnLevel = this.findColumnLevel(columnIndex);
        
        if (columnLevel === -1) {
            // 🆕 新筛选 - 压栈
            this.filterStack.push(new Uint32Array(filteredRowIndices));
            this.filterOrder.push(columnIndex);
            this.filterConditions[columnIndex] = filterCondition;
            
        } else {
            // 🔄 更新现有筛选 - 替换该级别及其后续级别
            this.filterStack.length = columnLevel + 1; // 截断栈
            this.filterOrder.length = columnLevel;
            
            // 重新压栈
            this.filterStack.push(new Uint32Array(filteredRowIndices));
            this.filterOrder.push(columnIndex);
            this.filterConditions[columnIndex] = filterCondition;
            
        }
    };
    
    /**
     * 🗑️ 移除指定列的筛选
     * @param {number} columnIndex 列索引
     */
    FilterManager.prototype.removeFilterLevel = function(columnIndex) {
        var columnLevel = this.findColumnLevel(columnIndex);
        
        if (columnLevel >= 0) {
            // 截断到该级别之前
            this.filterStack.length = columnLevel;
            this.filterOrder.length = columnLevel - 1;
            delete this.filterConditions[columnIndex];
            
        }
    };

    // ========================================
    // 筛选数据获取
    // ========================================
    
    /**
     * 获取列的唯一值（用于筛选面板）
     * 🚀 现在使用基数排序算法：O(n + k) 时间复杂度，去重+排序一次完成
     * 🎯 支持级联筛选：基于筛选历史栈动态计算
     * 
     * @param {number} columnIndex 列索引
     * @returns {Array} 排序后的唯一值数组
     */
    FilterManager.prototype.getColumnUniqueValues = function(columnIndex) {
        if (!this.db) return [];
        
        // 🎯 获取该列的有效行索引（基于筛选栈）
        var effectiveRowIndices = this.getEffectiveRowsForColumn(columnIndex);
        
        
        // 🚀 使用基于指定行的基数排序方法（高性能）
        if (this.db.getColumnUniqueValuesFromRows) {
            var result = this.db.getColumnUniqueValuesFromRows(columnIndex, effectiveRowIndices);
            return result;
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