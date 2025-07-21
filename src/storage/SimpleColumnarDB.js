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
        console.log('🏗️ SimpleColumnarDB构造函数:', {maxRows: maxRows, maxCols: maxCols});
        
        // 核心：每列是真正独立的ArrayBuffer + Uint32Array
        this.buffers = [];
        this.columns = [];
        
        console.log('📊 开始创建' + maxCols + '个列...');
        for (var i = 0; i < maxCols; i++) {
            try {
                // 强制每列使用独立的ArrayBuffer
                this.buffers[i] = new ArrayBuffer(maxRows * 4);
                this.columns[i] = new Uint32Array(this.buffers[i]);
                if (i < 3) { // 只记录前3列
                    console.log('  列' + i + '创建成功, 长度:', this.columns[i].length);
                }
            } catch (error) {
                console.error('❌ 创建列' + i + '失败:', error);
                throw error;
            }
        }
        console.log('✅ 所有列创建完成');
        
        // 每列独立的字符串池
        this.stringPools = [];
        this.stringMaps = [];
        this.nextStringIds = [];
        
        console.log('🗃️ 开始创建字符串池...');
        for (var i = 0; i < maxCols; i++) {
            try {
                this.stringPools[i] = [''];  // 索引0保留给null
                this.stringMaps[i] = {'': 0};
                this.nextStringIds[i] = 1;
                if (i < 3) { // 只记录前3列
                    console.log('  列' + i + '字符串池创建成功');
                }
            } catch (error) {
                console.error('❌ 创建列' + i + '字符串池失败:', error);
                throw error;
            }
        }
        console.log('✅ 所有字符串池创建完成');
        
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
        
        // 🗂️ 存储层与视图层分离架构
        // 存储层：完整的列式数据（永不改变原始顺序）
        this.totalRows = 0;        // 存储层的总行数
        this.currentRows = 0;      // 向后兼容字段
        
        // 视图层：控制显示的行序列（这是唯一的真相源）
        // displayIndices[i] = actualRowIndex 表示视图第i行对应存储层的actualRowIndex行
        this.visibleRows = 0;      // 视图层的可见行数
        
        // 排序状态跟踪
        this.lastSortColumn = undefined;
        this.lastSortAscending = undefined;
        
        // 🔧 向后兼容：保留旧的缓存数组（避免引用错误）
        this.cacheValid = [];
        this.cachedCounts = {};
        this.sortIndexValid = [];
        
        for (var i = 0; i < maxCols; i++) {
            this.cacheValid[i] = false;
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
        
        // 检查是否为日期格式 (YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss)
        var str = String(value).trim();
        var dateMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/);
        if (dateMatch) {
            var originalYear = parseInt(dateMatch[1], 10);
            var year = originalYear - 2020; // 从2020年开始
            var month = parseInt(dateMatch[2], 10);
            var day = parseInt(dateMatch[3], 10);
            var hour = dateMatch[4] ? parseInt(dateMatch[4], 10) : 0;
            var minute = dateMatch[5] ? parseInt(dateMatch[5], 10) : 0;
            var second = dateMatch[6] ? parseInt(dateMatch[6], 10) : 0;
            
            // 检查范围合法性
            if (year >= 0 && year < 64 && month >= 1 && month <= 12 && 
                day >= 1 && day <= 31 && hour >= 0 && hour < 24 && 
                minute >= 0 && minute < 60 && second >= 0 && second < 60) {
                
                // 紧凑编码：年6位 + 月4位 + 日5位 + 时6位 + 分6位 + 秒6位
                var encoded = (year << 26) | (month << 22) | (day << 17) | (hour << 11) | (minute << 5) | second;
                var finalEncoded = encoded | 0x80000000; // 最高位标记为日期
                
                // 📊 详细日期编码调试
                console.log('📅 日期编码:', str);
                console.log('   解析: ' + originalYear + '年 ' + month + '月 ' + day + '日 ' + hour + ':' + minute + ':' + second);
                console.log('   相对年: ' + year + ' (从2020年起)');
                console.log('   位移计算:');
                console.log('     年(' + year + ') << 26 = 0x' + (year << 26).toString(16));
                console.log('     月(' + month + ') << 22 = 0x' + (month << 22).toString(16));
                console.log('     日(' + day + ') << 17 = 0x' + (day << 17).toString(16));
                console.log('     时(' + hour + ') << 11 = 0x' + (hour << 11).toString(16));
                console.log('     分(' + minute + ') << 5 = 0x' + (minute << 5).toString(16));
                console.log('     秒(' + second + ') = 0x' + second.toString(16));
                console.log('   最终编码: 0x' + finalEncoded.toString(16) + ' (' + finalEncoded + ')');
                console.log('   无标记位: 0x' + encoded.toString(16) + ' (' + encoded + ')');
                console.log('');
                
                return finalEncoded;
            }
        }
        
        // 尝试解析为数字（包括小数）
        var numValue = Number(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
            // 整数直接存储
            if (Number.isInteger(numValue) && numValue >= 0 && numValue < 1000000000) {
                return numValue;
            }
            // 小数乘以100存储（保留2位小数精度）
            if (numValue >= 0 && numValue < 10000000) {
                return Math.round(numValue * 100) | 0x40000000; // 次高位标记为小数
            }
        }
        
        // 字符串使用该列的字符串池
        if (!this.stringMaps || !this.stringPools || !this.nextStringIds) {
            throw new Error('字符串池未初始化');
        }
        if (!this.stringMaps[col] || !this.stringPools[col] || this.nextStringIds[col] === undefined) {
            throw new Error('列' + col + '的字符串池未初始化');
        }
        
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
        if (encoded === 0) return '';  // 返回空字符串
        
        // 检查是否是日期（最高位标记）
        if (encoded & 0x80000000) {
            var dateData = encoded & 0x7FFFFFFF; // 去掉标记位
            var year = ((dateData >> 26) & 0x3F) + 2020;  // 6位年份
            var month = (dateData >> 22) & 0x0F;          // 4位月份
            var day = (dateData >> 17) & 0x1F;            // 5位日期
            var hour = (dateData >> 11) & 0x3F;           // 6位小时
            var minute = (dateData >> 5) & 0x3F;          // 6位分钟
            var second = dateData & 0x3F;                 // 6位秒数（与编码格式保持一致）
            
            // 格式化为日期字符串
            var dateStr = year + '-' + 
                         String(month).padStart(2, '0') + '-' + 
                         String(day).padStart(2, '0');
            
            if (hour > 0 || minute > 0 || second > 0) {
                dateStr += ' ' + String(hour).padStart(2, '0') + ':' + 
                          String(minute).padStart(2, '0') + ':' + 
                          String(second).padStart(2, '0');
            }
            
            return dateStr;
        }
        
        // 检查是否是小数（次高位标记）
        if (encoded & 0x40000000) {
            var decimalData = encoded & 0x3FFFFFFF; // 去掉标记位
            return decimalData / 100; // 小数解码
        }
        
        if (encoded < this.nextStringIds[col]) {
            // 从字符串池获取值
            var stringValue = this.stringPools[col][encoded];
            
            // 如果字符串池中的值是数字，返回数字类型
            var numValue = Number(stringValue);
            if (!isNaN(numValue) && String(numValue) === stringValue.trim()) {
                return numValue; // 返回数字类型
            }
            
            return stringValue; // 返回字符串类型
        }
        
        return encoded; // 直接编码的整数
    };

    /**
     * 设置单元格值
     */
    /**
     * 🔹 存储层操作：设置单元格值
     * @param {number} actualRow 存储层的实际行号
     * @param {number} col 列号
     * @param {*} value 要设置的值
     */
    SimpleColumnarDB.prototype.setValue = function(actualRow, col, value) {
        // 🔧 详细的参数和状态检查
        console.log('🔍 setValue调用:', {
            actualRow: actualRow, 
            col: col, 
            value: value,
            maxRows: this.maxRows,
            maxCols: this.maxCols,
            columnsExists: !!this.columns,
            columnsLength: this.columns ? this.columns.length : 'undefined'
        });
        
        // 🔧 分步检查columns[col]
        if (this.columns && col < this.columns.length) {
            console.log('  columns[' + col + ']存在:', !!this.columns[col]);
            if (this.columns[col]) {
                console.log('  columns[' + col + ']长度:', this.columns[col].length);
            }
        }
        
        if (actualRow >= this.maxRows || col >= this.maxCols) {
            throw new Error('索引超出范围: row=' + actualRow + ', col=' + col + ', maxRows=' + this.maxRows + ', maxCols=' + this.maxCols);
        }
        
        // 🔧 安全检查：确保columns数组和目标列存在
        if (!this.columns) {
            throw new Error('columns数组未初始化');
        }
        if (!this.columns[col]) {
            throw new Error('columns[' + col + ']未初始化, columns.length=' + this.columns.length);
        }
        
        try {
            // 编码值
            var encodedValue = this.encode(value, col);
            console.log('  编码结果:', encodedValue);
            
            // 直接操作存储层
            this.columns[col][actualRow] = encodedValue;
            console.log('  存储成功');
            
            // 更新存储层统计
            this.totalRows = Math.max(this.totalRows, actualRow + 1);
            this.currentRows = this.totalRows; // 向后兼容
            
            // 如果是新行，自动添加到视图中（保持原始顺序）
            if (actualRow >= this.visibleRows) {
                // 扩展视图以包含新行
                for (var i = this.visibleRows; i <= actualRow; i++) {
                    this.displayIndices[i] = i; // 新行按原始顺序添加
                }
                this.visibleRows = actualRow + 1;
            }
        } catch (error) {
            console.error('❌ setValue内部错误:', error);
            throw error;
        }
    };
    
    /**
     * 🔹 视图层操作：通过视图行号设置单元格值 
     * 兼容旧接口，自动转换视图行号到实际行号
     * @param {number} viewRow 视图中的行号
     * @param {number} col 列号  
     * @param {*} value 要设置的值
     */
    SimpleColumnarDB.prototype.setValueByViewRow = function(viewRow, col, value) {
        if (viewRow >= this.visibleRows) {
            throw new Error('视图行索引超出范围');
        }
        
        var actualRow = this.displayIndices[viewRow]; // 转换为实际行号
        this.setValue(actualRow, col, value);
    };

    /**
     * 🔹 存储层操作：获取单元格值 
     * @param {number} actualRow 存储层的实际行号
     * @param {number} col 列号
     */
    SimpleColumnarDB.prototype.getValue = function(actualRow, col) {
        if (actualRow >= this.maxRows || col >= this.maxCols) {
            return null;
        }
        
        return this.decode(this.columns[col][actualRow], col);
    };
    
    /**
     * 🔹 视图层操作：通过视图行号获取单元格值
     * 兼容旧接口，自动转换视图行号到实际行号
     * @param {number} viewRow 视图中的行号  
     * @param {number} col 列号
     */
    SimpleColumnarDB.prototype.getValueByViewRow = function(viewRow, col) {
        if (viewRow >= this.visibleRows) {
            return null;
        }
        
        var actualRow = this.displayIndices[viewRow]; // 转换为实际行号
        return this.getValue(actualRow, col);
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
     * 🚀 真正的32位基数排序 - 同步排序值和行索引
     * O(n)时间复杂度，4轮8位基数排序
     * @param {number} col 要排序的列
     * @return {Array} 排序后的行索引数组
     */
    SimpleColumnarDB.prototype.generateSortedIndices = function(col) {
        var length = this.totalRows;
        if (length <= 1) return [0];
        
        var startTime = performance.now();
        
        // 🔸 创建两个同步数组：值数组和行索引数组
        var values = new Uint32Array(length);
        var indices = new Uint32Array(length);
        var tempValues = new Uint32Array(length);
        var tempIndices = new Uint32Array(length);
        
        var column = this.columns[col];
        
        // 初始化：复制列数据和行索引
        for (var i = 0; i < length; i++) {
            values[i] = column[i];
            indices[i] = i;
        }
        
        // 🔥 4轮基数排序，每轮处理8位（共32位）
        for (var shift = 0; shift < 32; shift += 8) {
            var count = new Array(256);
            count.fill(0);
            
            // 第1步：计数当前8位数字的分布
            for (var i = 0; i < length; i++) {
                var digit = (values[i] >> shift) & 0xFF;
                count[digit]++;
            }
            
            // 第2步：计算累积位置（前缀和）
            for (var i = 1; i < 256; i++) {
                count[i] += count[i - 1];
            }
            
            // 第3步：稳定分配，从后往前保持稳定性
            for (var i = length - 1; i >= 0; i--) {
                var digit = (values[i] >> shift) & 0xFF;
                var pos = --count[digit];
                tempValues[pos] = values[i];
                tempIndices[pos] = indices[i];  // 同步移动行索引
            }
            
            // 第4步：交换数组指针
            var swapValues = values;
            values = tempValues;
            tempValues = swapValues;
            
            var swapIndices = indices;
            indices = tempIndices;
            tempIndices = swapIndices;
        }
        
        // 转换为普通数组返回
        var sortedRowIndices = new Array(length);
        for (var i = 0; i < length; i++) {
            sortedRowIndices[i] = indices[i];
        }
        
        var endTime = performance.now();
        var sortTime = endTime - startTime;
        var rowsPerMs = (length / sortTime).toFixed(0);
        
        console.log('🚀 列' + col + ' 基数排序完成 (O(n))');
        console.log('   数据量:', length + '行');
        console.log('   耗时:', sortTime.toFixed(2) + 'ms'); 
        console.log('   性能:', rowsPerMs + '行/ms');
        console.log('   前5个排序结果:', sortedRowIndices.slice(0, 5));
        
        return sortedRowIndices;
    };

    /**
     * 检查列是否是字符串类型
     */
    SimpleColumnarDB.prototype.isColumnStringType = function(col) {
        if (this.currentRows === 0) return false;
        
        // 检查前几行数据，如果存在字符串池索引，则认为是字符串列
        for (var i = 0; i < Math.min(10, this.currentRows); i++) {
            var encoded = this.columns[col][i];
            if (encoded > 0 && encoded < this.nextStringIds[col]) {
                // 存在字符串池索引，是字符串列
                return true;
            }
        }
        return false;
    };

    /**
     * 检查列是否是数值类型
     */
    SimpleColumnarDB.prototype.isColumnNumericType = function(col) {
        if (this.currentRows === 0) return false;
        
        var numericCount = 0;
        var nonEmptyCount = 0;
        
        // 检查前10行数据，看数字比例
        for (var i = 0; i < Math.min(10, this.currentRows); i++) {
            var encoded = this.columns[col][i];
            if (encoded === 0) continue; // 跳过空值
            
            nonEmptyCount++;
            
            // 检查是否是直接编码的数字（大于字符串池最大ID）
            if (encoded >= this.nextStringIds[col]) {
                numericCount++;
            } else {
                // 检查字符串池中的值是否为数字
                var decodedValue = this.decode(encoded, col);
                var strValue = String(decodedValue).trim();
                if (strValue !== '' && !isNaN(Number(strValue))) {
                    numericCount++;
                }
            }
        }
        
        // 如果80%以上是数字，认为是数值列
        return nonEmptyCount > 0 && (numericCount / nonEmptyCount) >= 0.8;
    };

    /**
     * 🚀 超高性能数值排序 - 混合数字处理
     */
    SimpleColumnarDB.prototype.fastNumericSortWithIndices = function(col) {
        var length = this.currentRows;
        if (length <= 1) return { indices: [0], values: [this.columns[col][0]] };
        
        // 创建 (数值, 行索引) 对进行排序
        var sortPairs = [];
        var column = this.columns[col];
        
        for (var i = 0; i < length; i++) {
            var encoded = column[i];
            var numericValue;
            
            if (encoded >= this.nextStringIds[col]) {
                // 直接编码的数字
                numericValue = encoded;
            } else {
                // 字符串池中的值，尝试解析为数字
                var decoded = this.decode(encoded, col);
                var parsed = Number(decoded);
                numericValue = isNaN(parsed) ? Infinity : parsed; // 非数字排在最后
            }
            
            sortPairs.push({
                value: numericValue,
                originalIndex: i,
                encodedValue: encoded
            });
        }
        
        // 按数值排序
        sortPairs.sort(function(a, b) {
            return a.value - b.value;
        });
        
        // 提取排序后的索引和编码值
        var sortedIndices = new Array(length);
        var sortedValues = new Array(length);
        
        for (var i = 0; i < length; i++) {
            sortedIndices[i] = sortPairs[i].originalIndex;
            sortedValues[i] = sortPairs[i].encodedValue;
        }
        
        return { indices: sortedIndices, values: sortedValues };
    };

    /**
     * 🚀 高性能字符串排序 - ArrayBuffer + 字符串池优化
     */
    SimpleColumnarDB.prototype.fastStringSortWithIndices = function(col) {
        var length = this.currentRows;
        if (length <= 1) return { indices: [0], values: [this.columns[col][0]] };
        
        // 步骤1: 建立字符串池的排序映射
        var stringPool = this.stringPools[col];
        var stringPoolSize = this.nextStringIds[col];
        
        // 创建字符串值到排序位置的映射
        var sortedStringIndices = [];
        for (var i = 0; i < stringPoolSize; i++) {
            sortedStringIndices.push({
                originalIndex: i,
                value: stringPool[i],
                sortKey: String(stringPool[i]).toLowerCase() // 用于排序的键
            });
        }
        
        // 对字符串池排序
        sortedStringIndices.sort(function(a, b) {
            return a.sortKey.localeCompare(b.sortKey);
        });
        
        // 建立原始索引到排序位置的映射
        var indexMapping = new Array(stringPoolSize);
        for (var i = 0; i < sortedStringIndices.length; i++) {
            indexMapping[sortedStringIndices[i].originalIndex] = i;
        }
        
        // 步骤2: 创建(排序后的编码值, 行索引)对，直接在ArrayBuffer上操作
        var sortPairs = new Array(length);
        var column = this.columns[col]; // 直接访问Uint32Array
        
        for (var i = 0; i < length; i++) {
            var originalEncodedValue = column[i];
            var mappedValue = indexMapping[originalEncodedValue] || 0;
            // 将映射后的值和行索引打包到一个uint32中
            sortPairs[i] = (mappedValue << 12) | i; // 高20位存映射值，低12位存行索引
        }
        
        // 步骤3: 对打包后的数组进行基数排序
        var temp = new Uint32Array(length);
        var count = new Array(256);
        
        // 4轮基数排序
        for (var shift = 0; shift < 32; shift += 8) {
            count.fill(0);
            
            // 计数
            for (var i = 0; i < length; i++) {
                var digit = (sortPairs[i] >> shift) & 0xFF;
                count[digit]++;
            }
            
            // 累积
            for (var i = 1; i < 256; i++) {
                count[i] += count[i - 1];
            }
            
            // 分配
            for (var i = length - 1; i >= 0; i--) {
                var digit = (sortPairs[i] >> shift) & 0xFF;
                temp[--count[digit]] = sortPairs[i];
            }
            
            // 交换
            var swap = sortPairs;
            sortPairs = temp;
            temp = swap;
        }
        
        // 步骤4: 提取排序结果
        var sortedIndices = new Array(length);
        var sortedValues = new Array(length);
        
        for (var i = 0; i < length; i++) {
            var packed = sortPairs[i];
            var rowIndex = packed & 0xFFF; // 低12位是行索引
            sortedIndices[i] = rowIndex;
            sortedValues[i] = column[rowIndex]; // 原始编码值
        }
        
        return { indices: sortedIndices, values: sortedValues };
    };


    /**
     * 通用排序（混合数据类型）
     */
    SimpleColumnarDB.prototype.generalSortWithIndices = function(col) {
        var length = this.currentRows;
        if (length <= 1) return { indices: [0], values: [this.columns[col][0]] };
        
        // 创建 (解码后的值, 行索引) 对
        var sortPairs = [];
        for (var i = 0; i < length; i++) {
            var decodedValue = this.decode(this.columns[col][i], col);
            sortPairs.push({
                value: decodedValue,
                originalIndex: i,
                encodedValue: this.columns[col][i]
            });
        }
        
        // 智能排序：数字 < 字符串
        sortPairs.sort(function(a, b) {
            var valueA = a.value;
            var valueB = b.value;
            var numA = Number(valueA);
            var numB = Number(valueB);
            var isNumA = !isNaN(numA);
            var isNumB = !isNaN(numB);
            
            if (isNumA && isNumB) {
                return numA - numB; // 都是数字，按数值排序
            } else if (isNumA && !isNumB) {
                return -1; // 数字排在字符串前面
            } else if (!isNumA && isNumB) {
                return 1; // 字符串排在数字后面
            } else {
                // 都是字符串，按字母排序
                return String(valueA).toLowerCase().localeCompare(String(valueB).toLowerCase());
            }
        });
        
        // 提取排序后的索引和编码值
        var sortedIndices = new Array(length);
        var sortedValues = new Array(length);
        
        for (var i = 0; i < length; i++) {
            sortedIndices[i] = sortPairs[i].originalIndex;
            sortedValues[i] = sortPairs[i].encodedValue;
        }
        
        return { indices: sortedIndices, values: sortedValues };
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
     * 🎯 按列排序 - 核心视图操作
     * 直接修改 displayIndices 数组，实现虚拟表格排序
     * @param {number} col 要排序的列
     * @param {boolean} ascending 是否升序
     */
    SimpleColumnarDB.prototype.sortByColumn = function(col, ascending) {
        if (ascending === undefined) ascending = true;
        
        var startTime = performance.now();
        console.log('🎯 开始按列' + col + '排序 (方向: ' + (ascending ? '升序' : '降序') + ')...');
        console.log('   存储层数据:', this.totalRows + '行');
        console.log('   当前视图:', this.visibleRows + '行');
        
        // 🚀 生成基于存储层的排序索引
        var sortedRowIndices = this.generateSortedIndices(col);
        
        if (ascending) {
            // 升序：直接使用排序索引
            for (var i = 0; i < this.totalRows; i++) {
                this.displayIndices[i] = sortedRowIndices[i];
            }
        } else {
            // 降序：反向使用排序索引
            for (var i = 0; i < this.totalRows; i++) {
                this.displayIndices[i] = sortedRowIndices[this.totalRows - 1 - i];
            }
        }
        
        // 🔸 视图显示全部存储数据（排序后通常要看全部结果）
        this.visibleRows = this.totalRows;
        
        // 记录排序状态
        this.lastSortColumn = col;
        this.lastSortAscending = ascending;
        
        // 特别调试第一列
        if (col === 0) {
            console.log('🔴 设置第一列排序状态:');
            console.log('   this.lastSortColumn:', this.lastSortColumn, typeof this.lastSortColumn);
            console.log('   this.lastSortAscending:', this.lastSortAscending, typeof this.lastSortAscending);
        }
        
        var endTime = performance.now();
        console.log('列' + col + '排序完成，耗时:', (endTime - startTime).toFixed(2), 'ms');
        
        return {
            column: col,
            ascending: ascending,
            rowsAffected: this.currentRows,
            sortTime: endTime - startTime
        };
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
     * 🔄 重置视图为原始顺序
     * 将 displayIndices 重置为 [0, 1, 2, 3, ...] 自然序列
     */
    SimpleColumnarDB.prototype.resetDisplayOrder = function() {
        console.log('🔄 重置视图为原始顺序...');
        console.log('   存储层数据:', this.totalRows + '行');
        
        // 重置为自然顺序：0, 1, 2, 3, ...
        for (var i = 0; i < this.totalRows; i++) {
            this.displayIndices[i] = i;
        }
        this.visibleRows = this.totalRows;
        
        // 清除排序状态
        this.lastSortColumn = undefined;
        this.lastSortAscending = undefined;
        
        console.log('✅ 视图已重置为原始顺序');
    };

    /**
     * 获取筛选后的行索引数组
     * 为FilterManager提供的通用筛选接口
     * @param {Object} filterConditions 筛选条件对象
     * @returns {Array} 符合条件的行索引数组
     */
    SimpleColumnarDB.prototype.getFilteredRowIndices = function(filterConditions) {
        if (!filterConditions || Object.keys(filterConditions).length === 0) {
            // 无筛选条件时返回所有行
            var allRows = [];
            for (var i = 0; i < this.totalRows; i++) {
                allRows.push(i);
            }
            return allRows;
        }
        
        var result = [];
        
        // 初始化为所有行
        for (var i = 0; i < this.totalRows; i++) {
            result.push(i);
        }
        
        // 依次应用每个筛选条件（取交集）
        for (var columnIndex in filterConditions) {
            if (filterConditions.hasOwnProperty(columnIndex)) {
                var filterCondition = filterConditions[columnIndex];
                result = this.applyColumnFilter(result, parseInt(columnIndex), filterCondition);
            }
        }
        
        return result;
    };

    /**
     * 对行索引数组应用列筛选条件
     * @param {Array} rowIndices 待筛选的行索引数组
     * @param {number} columnIndex 列索引
     * @param {Object} filterCondition 筛选条件
     * @returns {Array} 筛选后的行索引数组
     */
    SimpleColumnarDB.prototype.applyColumnFilter = function(rowIndices, columnIndex, filterCondition) {
        if (!filterCondition || columnIndex >= this.maxCols) {
            return rowIndices;
        }
        
        var result = [];
        
        switch (filterCondition.type) {
            case 'values':
                // 多选值筛选
                result = this.filterRowsByValues(rowIndices, columnIndex, filterCondition.selectedItems);
                break;
            case 'text':
                // 文本搜索筛选
                result = this.filterRowsByText(rowIndices, columnIndex, filterCondition.text);
                break;
            case 'number':
                // 数值范围筛选
                result = this.filterRowsByNumberRange(rowIndices, columnIndex, filterCondition.min, filterCondition.max);
                break;
            default:
                result = rowIndices;
        }
        
        return result;
    };

    /**
     * 按值筛选行
     */
    SimpleColumnarDB.prototype.filterRowsByValues = function(rowIndices, columnIndex, selectedValues) {
        if (!selectedValues || selectedValues.length === 0) {
            return rowIndices;
        }
        
        var result = [];
        var selectedSet = {};
        
        // 构建快速查找集合
        for (var i = 0; i < selectedValues.length; i++) {
            selectedSet[selectedValues[i]] = true;
        }
        
        // 筛选行
        for (var i = 0; i < rowIndices.length; i++) {
            var rowIndex = rowIndices[i];
            var cellValue = this.getValue(rowIndex, columnIndex);
            var displayValue = cellValue === null || cellValue === undefined ? '' : String(cellValue);
            
            if (selectedSet[displayValue]) {
                result.push(rowIndex);
            }
        }
        
        return result;
    };

    /**
     * 按文本搜索筛选行
     */
    SimpleColumnarDB.prototype.filterRowsByText = function(rowIndices, columnIndex, searchText) {
        if (!searchText) {
            return rowIndices;
        }
        
        var result = [];
        var lowerSearchText = searchText.toLowerCase();
        
        for (var i = 0; i < rowIndices.length; i++) {
            var rowIndex = rowIndices[i];
            var cellValue = this.getValue(rowIndex, columnIndex);
            var displayValue = cellValue === null || cellValue === undefined ? '' : String(cellValue).toLowerCase();
            
            if (displayValue.indexOf(lowerSearchText) >= 0) {
                result.push(rowIndex);
            }
        }
        
        return result;
    };

    /**
     * 按数值范围筛选行
     */
    SimpleColumnarDB.prototype.filterRowsByNumberRange = function(rowIndices, columnIndex, min, max) {
        var result = [];
        
        for (var i = 0; i < rowIndices.length; i++) {
            var rowIndex = rowIndices[i];
            var cellValue = this.getValue(rowIndex, columnIndex);
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
     * 获取列的唯一值（为筛选面板提供数据）
     * @param {number} columnIndex 列索引
     * @returns {Array} 唯一值数组（已排序）
     */
    SimpleColumnarDB.prototype.getColumnUniqueValues = function(columnIndex) {
        if (columnIndex >= this.maxCols) {
            return [];
        }
        
        var uniqueValues = {};
        var result = [];
        
        for (var i = 0; i < this.totalRows; i++) {
            var cellValue = this.getValue(i, columnIndex);
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
     * 获取当前排序状态
     */
    SimpleColumnarDB.prototype.getSortStatus = function() {
        var isSorted = (this.lastSortColumn !== undefined && this.lastSortColumn !== null && this.lastSortColumn >= 0);
        
        return {
            column: this.lastSortColumn !== undefined ? this.lastSortColumn : -1,
            ascending: this.lastSortAscending !== undefined ? this.lastSortAscending : true,
            isSorted: isSorted
        };
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
     * 🧹 清空所有数据
     */
    SimpleColumnarDB.prototype.clear = function() {
        console.log('🧹 清空数据库...');
        
        // 清空所有列数据
        for (var col = 0; col < this.maxCols; col++) {
            if (this.columns[col]) {
                this.columns[col].fill(0);
            }
        }
        
        // 重置字符串池
        for (var col = 0; col < this.maxCols; col++) {
            if (this.stringPools[col] && this.stringMaps[col]) {
                this.stringPools[col] = [''];  // 重置为只有空字符串
                this.stringMaps[col] = {'': 0};
                this.nextStringIds[col] = 1;
            }
        }
        
        // 重置计数器
        this.totalRows = 0;
        this.currentRows = 0;
        this.visibleRows = 0;
        
        // 重置视图为原始顺序
        for (var i = 0; i < this.maxRows; i++) {
            this.displayIndices[i] = i;
        }
        
        // 清除排序状态
        this.lastSortColumn = undefined;
        this.lastSortAscending = undefined;
        
        console.log('✅ 数据库已清空');
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