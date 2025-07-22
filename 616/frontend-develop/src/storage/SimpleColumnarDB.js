/**
 * 极简列存数据库 - ES5版本
 * 核心理念：每列就是一个独立的Uint32Array
 * Firefox 52兼容
 */
(function(global) {
    'use strict';

    /**
     * 极简列存数据库
     * @param {number} maxRows 最大行数
     * @param {number} maxCols 最大列数
     */
    function SimpleColumnarDB(maxRows, maxCols) {
        // 核心：每列是真正独立的ArrayBuffer + Uint32Array
        this.buffers = [];
        this.columns = [];
        
        for (var i = 0; i < maxCols; i++) {
            // 强制每列使用独立的ArrayBuffer
            this.buffers[i] = new ArrayBuffer(maxRows * 4);
            this.columns[i] = new Uint32Array(this.buffers[i]);
        }
        
        // 每列独立的字符串池
        this.stringPools = [];
        this.stringMaps = [];
        this.nextStringIds = [];
        
        for (var i = 0; i < maxCols; i++) {
            this.stringPools[i] = [''];  // 索引0保留给null
            this.stringMaps[i] = {'': 0};
            this.nextStringIds[i] = 1;
        }
        
        // 基本信息
        this.maxRows = maxRows;
        this.maxCols = maxCols;
        this.currentRows = 0;
        this.currentCols = maxCols;
        
        // 全局显示索引数组 - 控制表格显示顺序
        this.displayIndices = new Uint32Array(maxRows);
        this.visibleRows = 0;  // 当前可见行数
        
        // 初始化显示索引为正常顺序
        for (var i = 0; i < maxRows; i++) {
            this.displayIndices[i] = i;
        }
        
        // 列名映射（可选）
        this.columnNames = [];
        for (var i = 0; i < maxCols; i++) {
            this.columnNames[i] = this.generateColumnName(i);
        }
        
        // 缓存的计数排序结果
        this.cachedCounts = {};
        this.cacheValid = {};
        
        // 每列的排序索引
        this.sortedIndices = [];
        this.sortedValues = [];
        this.sortIndexValid = [];
        
        for (var i = 0; i < maxCols; i++) {
            this.sortedIndices[i] = [];  // 排序后的行索引数组
            this.sortedValues[i] = [];   // 排序后的值数组
            this.sortIndexValid[i] = false;
        }
    }

    /**
     * 生成列名 (A, B, C, ..., AA, AB, ...)
     */
    SimpleColumnarDB.prototype.generateColumnName = function(colIndex) {
        var result = '';
        var index = colIndex;
        
        do {
            result = String.fromCharCode(65 + (index % 26)) + result;
            index = Math.floor(index / 26) - 1;
        } while (index >= 0);
        
        return result;
    };

    /**
     * 编码：所有值统一编码为uint32
     * @param {*} value 要编码的值
     * @param {number} col 列索引
     */
    SimpleColumnarDB.prototype.encode = function(value, col) {
        if (value === null || value === undefined || value === '') {
            return 0;
        }
        
        // 数字直接存储（正整数）
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
            return value;
        }
        
        // 字符串使用该列的字符串池
        var str = String(value);
        var stringMap = this.stringMaps[col];
        var stringPool = this.stringPools[col];
        
        if (stringMap[str] === undefined) {
            stringMap[str] = this.nextStringIds[col];
            stringPool[this.nextStringIds[col]] = str;
            this.nextStringIds[col]++;
        }
        return stringMap[str];
    };

    /**
     * 解码：uint32解码回原始值
     * @param {number} encoded 编码值
     * @param {number} col 列索引
     */
    SimpleColumnarDB.prototype.decode = function(encoded, col) {
        if (encoded === 0) return '';  // 🔧 修复：返回空字符串而不是null，便于渲染器处理
        if (encoded < this.nextStringIds[col]) {
            return this.stringPools[col][encoded];
        }
        return encoded;
    };

    /**
     * 设置单元格值
     */
    SimpleColumnarDB.prototype.setValue = function(row, col, value) {
        if (row >= this.maxRows || col >= this.maxCols) {
            throw new Error('索引超出范围');
        }
        
        this.columns[col][row] = this.encode(value, col);
        this.currentRows = Math.max(this.currentRows, row + 1);
        this.visibleRows = this.currentRows;  // 更新可见行数
        
        // 清除该列的所有缓存和索引
        this.cacheValid[col] = false;
        this.sortIndexValid[col] = false;
        
        // 清除倒排索引
        if (this.invertedIndexValid && this.invertedIndexValid[col]) {
            this.invertedIndexValid[col] = false;
        }
    };

    /**
     * 获取单元格值
     */
    SimpleColumnarDB.prototype.getValue = function(row, col) {
        if (row >= this.maxRows || col >= this.maxCols) {
            return null;
        }
        
        return this.decode(this.columns[col][row], col);
    };

    /**
     * 根据显示索引获取单元格值 - 用于表格渲染
     */
    SimpleColumnarDB.prototype.getDisplayValue = function(displayRow, col) {
        if (displayRow >= this.visibleRows || col >= this.maxCols) {
            return null;
        }
        
        var actualRow = this.displayIndices[displayRow];
        return this.decode(this.columns[col][actualRow], col);
    };

    /**
     * 获取显示行对应的实际行索引
     */
    SimpleColumnarDB.prototype.getActualRowIndex = function(displayRow) {
        if (displayRow >= this.visibleRows) {
            return -1;
        }
        return this.displayIndices[displayRow];
    };

    /**
     * 获取原始编码值（最高性能）
     */
    SimpleColumnarDB.prototype.getRawValue = function(row, col) {
        return this.columns[col][row];
    };

    /**
     * 核心算法：计数排序
     */
    SimpleColumnarDB.prototype.getColumnCounts = function(col) {
        if (this.cacheValid[col] && this.cachedCounts[col]) {
            return this.cachedCounts[col];
        }
        
        var counts = {};
        var column = this.columns[col];
        
        for (var i = 0; i < this.currentRows; i++) {
            var value = column[i];
            counts[value] = (counts[value] || 0) + 1;
        }
        
        // 缓存结果
        this.cachedCounts[col] = counts;
        this.cacheValid[col] = true;
        
        return counts;
    };

    /**
     * 高性能基数排序 - 专为uint32优化
     */
    SimpleColumnarDB.prototype.radixSort = function(arr, length) {
        if (length <= 1) return;
        
        var temp = new Uint32Array(length);
        var count = new Array(256);
        
        // 4轮排序，每轮处理8位
        for (var shift = 0; shift < 32; shift += 8) {
            // 重置计数数组
            count.fill(0);
            
            // 计数当前8位的分布
            for (var i = 0; i < length; i++) {
                var digit = (arr[i] >> shift) & 0xFF;
                count[digit]++;
            }
            
            // 计算累积位置
            for (var i = 1; i < 256; i++) {
                count[i] += count[i - 1];
            }
            
            // 从后往前分配，保持稳定性
            for (var i = length - 1; i >= 0; i--) {
                var digit = (arr[i] >> shift) & 0xFF;
                temp[--count[digit]] = arr[i];
            }
            
            // 交换数组
            var swap = arr;
            arr = temp;
            temp = swap;
        }
    };

    /**
     * 基数排序 + 行索引跟踪
     */
    SimpleColumnarDB.prototype.radixSortWithIndices = function(col) {
        var length = this.currentRows;
        if (length <= 1) return { indices: [0], values: [this.columns[col][0]] };
        
        // 创建 (值, 行索引) 对，打包到单个uint32中
        // 高20位存值，低12位存行索引（支持4096行）
        var packed = new Uint32Array(length);
        var column = this.columns[col];
        
        for (var i = 0; i < length; i++) {
            // 假设行索引 < 4096，值 < 1048576
            packed[i] = (column[i] << 12) | i;
        }
        
        // 基数排序
        this.radixSort(packed, length);
        
        // 提取排序后的索引和值
        var sortedIndices = new Array(length);
        var sortedValues = new Array(length);
        
        for (var i = 0; i < length; i++) {
            sortedIndices[i] = packed[i] & 0xFFF;  // 低12位
            sortedValues[i] = packed[i] >> 12;     // 高20位
        }
        
        return { indices: sortedIndices, values: sortedValues };
    };

    /**
     * 构建列的排序索引 - 使用基数排序优化
     */
    SimpleColumnarDB.prototype.buildSortedIndex = function(col) {
        if (this.sortIndexValid[col]) {
            return;
        }
        
        var startTime = performance.now();
        
        // 使用高性能基数排序
        var result = this.radixSortWithIndices(col);
        
        this.sortedIndices[col] = result.indices;
        this.sortedValues[col] = result.values;
        this.sortIndexValid[col] = true;
        
        var endTime = performance.now();
        console.log('列' + col + '基数排序完成，耗时:', (endTime - startTime).toFixed(2), 'ms');
    };

    /**
     * 构建倒排索引 - 用于高速筛选
     */
    SimpleColumnarDB.prototype.buildInvertedIndex = function(col) {
        if (!this.invertedIndexes) {
            this.invertedIndexes = [];
            this.invertedIndexValid = [];
        }
        
        if (this.invertedIndexValid[col]) {
            return this.invertedIndexes[col];
        }
        
        var startTime = performance.now();
        var index = new Map();
        var column = this.columns[col];
        
        // 构建 value -> [row1, row2, ...] 映射
        for (var i = 0; i < this.currentRows; i++) {
            var value = column[i];
            if (!index.has(value)) {
                index.set(value, []);
            }
            index.get(value).push(i);
        }
        
        this.invertedIndexes[col] = index;
        this.invertedIndexValid[col] = true;
        
        var endTime = performance.now();
        console.log('列' + col + '倒排索引构建完成，耗时:', (endTime - startTime).toFixed(2), 'ms');
        
        return index;
    };

    /**
     * 高性能单值筛选
     */
    SimpleColumnarDB.prototype.fastFilterSingle = function(col, value) {
        var encoded = this.encode(value, col);
        var invertedIndex = this.buildInvertedIndex(col);
        
        var rows = invertedIndex.get(encoded);
        return rows ? rows.slice() : []; // 返回副本
    };

    /**
     * 高性能多值筛选
     */
    SimpleColumnarDB.prototype.fastFilterMultiple = function(col, values) {
        if (values.length === 0) return [];
        if (values.length === 1) return this.fastFilterSingle(col, values[0]);
        
        var startTime = performance.now();
        var invertedIndex = this.buildInvertedIndex(col);
        var result = [];
        
        // 收集所有匹配的行
        for (var i = 0; i < values.length; i++) {
            var encoded = this.encode(values[i], col);
            var rows = invertedIndex.get(encoded);
            if (rows) {
                result = result.concat(rows);
            }
        }
        
        // 去重并排序
        if (result.length > 0) {
            result = this.uniqueAndSort(result);
        }
        
        var endTime = performance.now();
        console.log('列' + col + '多值筛选完成，耗时:', (endTime - startTime).toFixed(2), 'ms，结果:', result.length, '行');
        
        return result;
    };

    /**
     * 数组去重并排序
     */
    SimpleColumnarDB.prototype.uniqueAndSort = function(arr) {
        if (arr.length <= 1) return arr;
        
        // 使用Set去重
        var unique = [...new Set(arr)];
        
        // 根据大小选择排序算法
        if (unique.length < 1000) {
            unique.sort(function(a, b) { return a - b; });
        } else {
            // 大数组使用基数排序
            var uint32Array = new Uint32Array(unique);
            this.radixSort(uint32Array, unique.length);
            unique = Array.from(uint32Array);
        }
        
        return unique;
    };

    /**
     * 基数排序获取唯一值 - 下拉菜单专用
     */
    SimpleColumnarDB.prototype.getUniqueValuesSorted = function(col) {
        if (this.currentRows === 0) return [];
        
        var startTime = performance.now();
        
        // 1. 复制列数据
        var sorted = new Uint32Array(this.currentRows);
        var column = this.columns[col];
        for (var i = 0; i < this.currentRows; i++) {
            sorted[i] = column[i];
        }
        
        // 2. 基数排序
        this.radixSort(sorted, this.currentRows);
        
        // 3. 线性去重
        var unique = [];
        if (this.currentRows > 0) {
            unique.push(this.decode(sorted[0], col));
            for (var i = 1; i < this.currentRows; i++) {
                if (sorted[i] !== sorted[i - 1]) {
                    unique.push(this.decode(sorted[i], col));
                }
            }
        }
        
        var endTime = performance.now();
        console.log('列' + col + '获取唯一值完成，耗时:', (endTime - startTime).toFixed(2), 'ms，唯一值:', unique.length, '个');
        
        return unique;
    };

    /**
     * 查找某个值的所有行索引 - 兼容旧接口
     */
    SimpleColumnarDB.prototype.findRows = function(col, value) {
        return this.fastFilterSingle(col, value);
    };

    /**
     * 二分查找：找到第一个 >= target 的位置
     */
    SimpleColumnarDB.prototype.binarySearchLowerBound = function(sortedValues, target) {
        var left = 0;
        var right = sortedValues.length;
        
        while (left < right) {
            var mid = Math.floor((left + right) / 2);
            if (sortedValues[mid] < target) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        
        return left;
    };
    
    /**
     * 二分查找：找到第一个 > target 的位置
     */
    SimpleColumnarDB.prototype.binarySearchUpperBound = function(sortedValues, target) {
        var left = 0;
        var right = sortedValues.length;
        
        while (left < right) {
            var mid = Math.floor((left + right) / 2);
            if (sortedValues[mid] <= target) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        
        return left;
    };

    /**
     * 范围查询 - 使用排序索引优化 O(log n)
     */
    SimpleColumnarDB.prototype.rangeQuery = function(col, min, max) {
        var minEncoded = this.encode(min, col);
        var maxEncoded = this.encode(max, col);
        
        // 构建排序索引
        this.buildSortedIndex(col);
        
        var sortedValues = this.sortedValues[col];
        var sortedIndices = this.sortedIndices[col];
        
        // 使用二分查找找到范围边界
        var leftBound = this.binarySearchLowerBound(sortedValues, minEncoded);
        var rightBound = this.binarySearchUpperBound(sortedValues, maxEncoded);
        
        var results = [];
        for (var i = leftBound; i < rightBound; i++) {
            results.push(sortedIndices[i]);
        }
        
        return results;
    };

    /**
     * 按列排序 - 修改显示索引数组
     */
    SimpleColumnarDB.prototype.sortByColumn = function(col, ascending) {
        if (ascending === undefined) ascending = true;
        
        // 构建排序索引
        this.buildSortedIndex(col);
        
        var sortedIndices = this.sortedIndices[col];
        
        if (ascending) {
            // 升序：直接使用排序索引
            for (var i = 0; i < this.currentRows; i++) {
                this.displayIndices[i] = sortedIndices[i];
            }
        } else {
            // 降序：反向使用排序索引
            for (var i = 0; i < this.currentRows; i++) {
                this.displayIndices[i] = sortedIndices[this.currentRows - 1 - i];
            }
        }
        
        this.visibleRows = this.currentRows;
    };

    /**
     * 按多个值筛选 - 修改显示索引数组
     */
    SimpleColumnarDB.prototype.filterByValues = function(col, selectedValues) {
        var filteredIndices = [];
        
        // 对每个选中值，找到包含该值的行
        for (var i = 0; i < selectedValues.length; i++) {
            var encoded = this.encode(selectedValues[i], col);
            
            // 在当前所有行中查找
            for (var row = 0; row < this.currentRows; row++) {
                if (this.columns[col][row] === encoded) {
                    filteredIndices.push(row);
                }
            }
        }
        
        // 更新显示索引数组
        for (var i = 0; i < filteredIndices.length; i++) {
            this.displayIndices[i] = filteredIndices[i];
        }
        
        this.visibleRows = filteredIndices.length;
    };

    /**
     * 重置显示索引为默认顺序
     */
    SimpleColumnarDB.prototype.resetDisplayOrder = function() {
        for (var i = 0; i < this.currentRows; i++) {
            this.displayIndices[i] = i;
        }
        this.visibleRows = this.currentRows;
    };

    /**
     * 获取列的唯一值（基于计数排序）
     */
    SimpleColumnarDB.prototype.getUniqueValues = function(col) {
        var counts = this.getColumnCounts(col);
        var uniqueValues = [];
        
        for (var encoded in counts) {
            uniqueValues.push(this.decode(Number(encoded), col));
        }
        
        return uniqueValues.sort();
    };

    /**
     * 获取列的统计信息
     */
    SimpleColumnarDB.prototype.getColumnStats = function(col) {
        var counts = this.getColumnCounts(col);
        var uniqueCount = Object.keys(counts).length;
        var nonNullCount = this.currentRows - (counts[0] || 0);
        
        return {
            totalRows: this.currentRows,
            uniqueValues: uniqueCount,
            nonNullValues: nonNullCount,
            compressionRatio: Math.round((1 - uniqueCount / this.currentRows) * 100),
            topValues: this.getTopValues(col, 5)
        };
    };

    /**
     * 获取出现频率最高的值
     */
    SimpleColumnarDB.prototype.getTopValues = function(col, limit) {
        var counts = this.getColumnCounts(col);
        var values = [];
        
        for (var encoded in counts) {
            values.push({
                value: this.decode(Number(encoded), col),
                count: counts[encoded]
            });
        }
        
        values.sort(function(a, b) {
            return b.count - a.count;
        });
        
        return values.slice(0, limit || 10);
    };

    /**
     * 批量设置列数据
     */
    SimpleColumnarDB.prototype.setColumnData = function(col, values) {
        if (col >= this.maxCols) {
            throw new Error('列索引超出范围');
        }
        
        var column = this.columns[col];
        var maxRows = Math.min(values.length, this.maxRows);
        
        for (var i = 0; i < maxRows; i++) {
            column[i] = this.encode(values[i], col);
        }
        
        this.currentRows = Math.max(this.currentRows, maxRows);
        this.cacheValid[col] = false;
        this.sortIndexValid[col] = false;
    };

    /**
     * 批量获取列数据
     */
    SimpleColumnarDB.prototype.getColumnData = function(col) {
        if (col >= this.maxCols) {
            return [];
        }
        
        var column = this.columns[col];
        var result = [];
        
        for (var i = 0; i < this.currentRows; i++) {
            result.push(this.decode(column[i], col));
        }
        
        return result;
    };

    /**
     * 获取原始列数据（编码后的，最高性能）
     */
    SimpleColumnarDB.prototype.getRawColumnData = function(col) {
        if (col >= this.maxCols) {
            return new Uint32Array(0);
        }
        
        return this.columns[col].slice(0, this.currentRows);
    };

    /**
     * 添加新行
     */
    SimpleColumnarDB.prototype.addRow = function(rowData) {
        if (this.currentRows >= this.maxRows) {
            throw new Error('超出最大行数');
        }
        
        var newRowIndex = this.currentRows;
        rowData = rowData || [];
        
        for (var col = 0; col < Math.min(rowData.length, this.maxCols); col++) {
            if (rowData[col] !== undefined) {
                this.setValue(newRowIndex, col, rowData[col]);
            }
        }
        
        return newRowIndex;
    };

    /**
     * 删除行
     */
    SimpleColumnarDB.prototype.deleteRow = function(rowIndex) {
        if (rowIndex < 0 || rowIndex >= this.currentRows) {
            return false;
        }
        
        // 将后面的行向前移动
        for (var col = 0; col < this.maxCols; col++) {
            var column = this.columns[col];
            for (var row = rowIndex; row < this.currentRows - 1; row++) {
                column[row] = column[row + 1];
            }
            // 清除最后一行
            column[this.currentRows - 1] = 0;
            
            // 清除缓存
            this.cacheValid[col] = false;
            this.sortIndexValid[col] = false;
        }
        
        this.currentRows--;
        return true;
    };

    /**
     * 获取数据库统计信息
     */
    SimpleColumnarDB.prototype.getStats = function() {
        var totalMemory = 0;
        var totalUniqueValues = 0;
        var totalStringPoolSize = 0;
        
        for (var col = 0; col < this.maxCols; col++) {
            totalMemory += this.maxRows * 4; // 每个uint32 4字节
            var counts = this.getColumnCounts(col);
            totalUniqueValues += Object.keys(counts).length;
            totalStringPoolSize += this.stringPools[col].length;
        }
        
        // 所有列的字符串池内存
        var stringPoolMemory = 0;
        for (var col = 0; col < this.maxCols; col++) {
            stringPoolMemory += this.stringPools[col].reduce(function(total, str) {
                return total + str.length * 2; // UTF-16
            }, 0);
        }
        
        return {
            maxRows: this.maxRows,
            maxCols: this.maxCols,
            currentRows: this.currentRows,
            totalMemory: Math.round((totalMemory + stringPoolMemory) / 1024), // KB
            stringPoolSize: totalStringPoolSize,
            totalUniqueValues: totalUniqueValues,
            compressionRatio: Math.round((1 - totalUniqueValues / (this.currentRows * this.maxCols)) * 100)
        };
    };

    /**
     * 清空所有数据
     */
    SimpleColumnarDB.prototype.clear = function() {
        for (var col = 0; col < this.maxCols; col++) {
            this.columns[col].fill(0);
            this.cacheValid[col] = false;
            this.sortIndexValid[col] = false;
        }
        
        this.currentRows = 0;
        this.cachedCounts = {};
    };

    /**
     * 导出数据为JSON
     */
    SimpleColumnarDB.prototype.exportData = function() {
        var data = [];
        
        for (var row = 0; row < this.currentRows; row++) {
            var rowData = [];
            for (var col = 0; col < this.maxCols; col++) {
                rowData.push(this.getValue(row, col));
            }
            data.push(rowData);
        }
        
        return {
            data: data,
            columnNames: this.columnNames,
            stats: this.getStats()
        };
    };

    /**
     * 从JSON导入数据
     */
    SimpleColumnarDB.prototype.importData = function(exportedData) {
        this.clear();
        
        if (!exportedData.data || !Array.isArray(exportedData.data)) {
            throw new Error('无效的数据格式');
        }
        
        for (var row = 0; row < exportedData.data.length && row < this.maxRows; row++) {
            var rowData = exportedData.data[row];
            if (Array.isArray(rowData)) {
                for (var col = 0; col < rowData.length && col < this.maxCols; col++) {
                    this.setValue(row, col, rowData[col]);
                }
            }
        }
        
        return true;
    };

    /**
     * 高级API：组合查询 - 筛选 + 排序
     */
    SimpleColumnarDB.prototype.query = function(options) {
        var startTime = performance.now();
        var result = null;
        
        // 1. 执行筛选
        if (options.filter) {
            var col = options.filter.column;
            var values = options.filter.values;
            
            if (values && values.length > 0) {
                result = this.fastFilterMultiple(col, values);
            }
        }
        
        // 2. 执行排序
        if (options.sort && result && result.length > 1) {
            var sortCol = options.sort.column;
            var direction = options.sort.direction || 'asc';
            
            // 构建排序索引
            this.buildSortedIndex(sortCol);
            
            // 从排序索引中提取匹配的行
            var sortedIndices = this.sortedIndices[sortCol];
            var filteredSet = new Set(result);
            var sortedResult = [];
            
            for (var i = 0; i < sortedIndices.length; i++) {
                var rowIndex = sortedIndices[i];
                if (filteredSet.has(rowIndex)) {
                    sortedResult.push(rowIndex);
                }
            }
            
            // 处理降序
            if (direction === 'desc') {
                sortedResult.reverse();
            }
            
            result = sortedResult;
        } else if (options.sort && !result) {
            // 纯排序，无筛选
            var sortCol = options.sort.column;
            var direction = options.sort.direction || 'asc';
            
            this.buildSortedIndex(sortCol);
            result = this.sortedIndices[sortCol].slice();
            
            if (direction === 'desc') {
                result.reverse();
            }
        }
        
        // 3. 如果没有任何条件，返回所有行
        if (!result) {
            result = [];
            for (var i = 0; i < this.currentRows; i++) {
                result.push(i);
            }
        }
        
        var endTime = performance.now();
        console.log('组合查询完成，耗时:', (endTime - startTime).toFixed(2), 'ms，结果:', result.length, '行');
        
        return result;
    };

    /**
     * 高级API：批量数据追加
     */
    SimpleColumnarDB.prototype.batchAppend = function(rows) {
        if (!rows || rows.length === 0) return;
        
        var startTime = performance.now();
        console.log('开始批量追加', rows.length, '行数据...');
        
        // 暂停索引更新
        var needsRebuild = [];
        
        for (var i = 0; i < rows.length; i++) {
            var rowData = rows[i];
            var newRowIndex = this.currentRows + i;
            
            for (var col = 0; col < Math.min(rowData.length, this.maxCols); col++) {
                if (rowData[col] !== undefined) {
                    // 直接设置值，跳过索引更新
                    this.columns[col][newRowIndex] = this.encode(rowData[col], col);
                    needsRebuild[col] = true;
                }
            }
        }
        
        // 更新行数
        this.currentRows += rows.length;
        this.visibleRows = this.currentRows;
        
        // 批量清除索引
        for (var col = 0; col < this.maxCols; col++) {
            if (needsRebuild[col]) {
                this.cacheValid[col] = false;
                this.sortIndexValid[col] = false;
                if (this.invertedIndexValid && this.invertedIndexValid[col]) {
                    this.invertedIndexValid[col] = false;
                }
            }
        }
        
        var endTime = performance.now();
        console.log('批量追加完成，耗时:', (endTime - startTime).toFixed(2), 'ms');
    };

    /**
     * 高级API：获取列的下拉选项（去重排序）
     */
    SimpleColumnarDB.prototype.getColumnDropdownOptions = function(col) {
        return this.getUniqueValuesSorted(col);
    };

    /**
     * 高级API：预热所有索引
     */
    SimpleColumnarDB.prototype.preloadIndexes = function() {
        var startTime = performance.now();
        console.log('开始预热所有索引...');
        
        for (var col = 0; col < this.maxCols; col++) {
            if (this.currentRows > 0) {
                this.buildSortedIndex(col);
                this.buildInvertedIndex(col);
            }
        }
        
        var endTime = performance.now();
        console.log('索引预热完成，耗时:', (endTime - startTime).toFixed(2), 'ms');
    };

    /**
     * 高级API：获取性能统计
     */
    SimpleColumnarDB.prototype.getPerformanceStats = function() {
        var baseStats = this.getStats();
        
        var indexStats = {
            sortedIndexCount: 0,
            invertedIndexCount: 0,
            totalIndexMemory: 0
        };
        
        for (var col = 0; col < this.maxCols; col++) {
            if (this.sortIndexValid && this.sortIndexValid[col]) {
                indexStats.sortedIndexCount++;
                indexStats.totalIndexMemory += this.sortedIndices[col].length * 4; // 4字节per索引
            }
            
            if (this.invertedIndexValid && this.invertedIndexValid[col]) {
                indexStats.invertedIndexCount++;
                // 估算倒排索引内存
                var index = this.invertedIndexes[col];
                if (index) {
                    indexStats.totalIndexMemory += index.size * 20; // 估算Map开销
                }
            }
        }
        
        return Object.assign(baseStats, {
            indexes: indexStats,
            indexMemoryKB: Math.round(indexStats.totalIndexMemory / 1024)
        });
    };

    // 暴露到全局
    global.SimpleColumnarDB = SimpleColumnarDB;
    
})(window);