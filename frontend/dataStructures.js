class TableDataStructures {
    constructor(initialRows = 10, initialCols = 10) {
        this.rows = initialRows;          // 缓冲区容量（行数）
        this.cols = initialCols;          // 缓冲区容量（列数）
        this.currentRowCount = 0;         // 当前实际使用的行数（重要：时间序列计数器）
        
        // 使用 Uint32Array 存储单元格数据索引
        this.cellDataBuffer = new ArrayBuffer(initialRows * initialCols * 4);
        this.cellDataView = new Uint32Array(this.cellDataBuffer);
        
        // 字符串数组存储实际的单元格内容
        this.stringArray = [];
        
        // HashMap 存储字符串到索引的反向映射
        this.stringToIndexMap = new Map();
        
        // 下一个可用的字符串索引
        this.nextStringIndex = 0;
        
        // 初始化空字符串
        this.addString('');
    }
    
    // 添加字符串到数组并返回索引
    addString(str) {
        if (this.stringToIndexMap.has(str)) {
            return this.stringToIndexMap.get(str);
        }
        
        const index = this.nextStringIndex++;
        this.stringArray[index] = str;
        this.stringToIndexMap.set(str, index);
        return index;
    }
    
    // 根据索引获取字符串
    getString(index) {
        return this.stringArray[index] || '';
    }
    
    // 设置单元格值（时间序列表格只允许编辑最后一行）
    setCellValue(row, col, value) {
        if (row >= this.currentRowCount || col >= this.cols || row < 0 || col < 0) {
            throw new Error(`Cell position out of bounds: (${row}, ${col}), currentRowCount: ${this.currentRowCount}`);
        }
        
        // 只允许编辑最后一行（最新的时间记录）
        // 临时放宽限制进行测试
        // if (row !== this.currentRowCount - 1) {
        //     throw new Error(`Can only edit the last row (${this.currentRowCount - 1}), attempted to edit row ${row}`);
        // }
        
        const stringIndex = this.addString(value);
        const cellIndex = col * this.rows + row;
        this.cellDataView[cellIndex] = stringIndex;
    }
    
    // 获取单元格值
    getCellValue(row, col) {
        if (row >= this.currentRowCount || col >= this.cols || row < 0 || col < 0) {
            return '';
        }
        
        const cellIndex = col * this.rows + row;
        const stringIndex = this.cellDataView[cellIndex];
        return this.getString(stringIndex);
    }
    
    // 扩展表格大小
    resize(newRows, newCols) {
        if (newRows <= 0 || newCols <= 0) {
            throw new Error('Invalid table dimensions');
        }
        
        // 创建新的缓冲区
        const newBuffer = new ArrayBuffer(newRows * newCols * 4);
        const newView = new Uint32Array(newBuffer);
        
        // 复制现有数据
        const minRows = Math.min(this.rows, newRows);
        const minCols = Math.min(this.cols, newCols);
        
        for (let col = 0; col < minCols; col++) {
            for (let row = 0; row < minRows; row++) {
                const oldIndex = col * this.rows + row;
                const newIndex = col * newRows + row;
                newView[newIndex] = this.cellDataView[oldIndex];
            }
        }
        
        this.cellDataBuffer = newBuffer;
        this.cellDataView = newView;
        this.rows = newRows;
        this.cols = newCols;
    }
    
    // 追加新行到表格末尾
    appendRow() {
        // 检查是否需要扩展缓冲区
        if (this.currentRowCount >= this.rows) {
            this.resize(this.rows * 2, this.cols); // 双倍扩容
        }
        
        // 新行自动初始化为空字符串（索引0）
        const newRowIndex = this.currentRowCount;
        for (let col = 0; col < this.cols; col++) {
            const cellIndex = col * this.rows + newRowIndex;
            this.cellDataView[cellIndex] = 0;
        }
        
        this.currentRowCount++;
        return newRowIndex;
    }
    
    // 追加新列到表格末尾
    appendCol() {
        this.resize(this.rows, this.cols + 1);
        
        // 新列自动初始化为空字符串（索引0）
        const newColIndex = this.cols - 1;
        for (let row = 0; row < this.rows; row++) {
            const cellIndex = newColIndex * this.rows + row;
            this.cellDataView[cellIndex] = 0;
        }
        
        return newColIndex;
    }
    
    // 删除最后一行（时间序列表格只允许删除最新记录）
    deleteLastRow() {
        if (this.currentRowCount <= 1) {
            throw new Error('Cannot delete the only remaining row');
        }
        
        // 简单地减少 currentRowCount，不需要移动数据或缩减缓冲区
        this.currentRowCount--;
        
        return this.currentRowCount; // 返回新的实际行数
    }
    
    // 删除最后一列
    deleteLastCol() {
        if (this.cols <= 1) {
            throw new Error('Cannot delete the only remaining column');
        }
        
        // 直接缩减表格大小，最后一列数据会被丢弃
        this.resize(this.rows, this.cols - 1);
        
        return this.cols; // 返回新的列数
    }
    
    // 获取内存使用情况
    getMemoryUsage() {
        const bufferSize = this.cellDataBuffer.byteLength;
        const stringArraySize = this.stringArray.reduce((sum, str) => sum + (str ? str.length * 2 : 0), 0);
        const mapSize = this.stringToIndexMap.size * 50; // 估算
        
        return {
            bufferSize,
            stringArraySize,
            mapSize,
            totalSize: bufferSize + stringArraySize + mapSize
        };
    }
}