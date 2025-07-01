class TableDataStructures {
    constructor(initialRows = 10, initialCols = 10) {
        this.rows = initialRows;
        this.cols = initialCols;
        
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
    
    // 设置单元格值
    setCellValue(row, col, value) {
        if (row >= this.rows || col >= this.cols || row < 0 || col < 0) {
            throw new Error(`Cell position out of bounds: (${row}, ${col})`);
        }
        
        const stringIndex = this.addString(value);
        const cellIndex = row * this.cols + col;
        this.cellDataView[cellIndex] = stringIndex;
    }
    
    // 获取单元格值
    getCellValue(row, col) {
        if (row >= this.rows || col >= this.cols || row < 0 || col < 0) {
            return '';
        }
        
        const cellIndex = row * this.cols + col;
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
        
        for (let row = 0; row < minRows; row++) {
            for (let col = 0; col < minCols; col++) {
                const oldIndex = row * this.cols + col;
                const newIndex = row * newCols + col;
                newView[newIndex] = this.cellDataView[oldIndex];
            }
        }
        
        this.cellDataBuffer = newBuffer;
        this.cellDataView = newView;
        this.rows = newRows;
        this.cols = newCols;
    }
    
    // 插入行
    insertRow(atRow) {
        if (atRow < 0 || atRow > this.rows) {
            throw new Error('Invalid row position');
        }
        
        this.resize(this.rows + 1, this.cols);
        
        // 向下移动行数据
        for (let row = this.rows - 1; row > atRow; row--) {
            for (let col = 0; col < this.cols; col++) {
                const sourceIndex = (row - 1) * this.cols + col;
                const targetIndex = row * this.cols + col;
                this.cellDataView[targetIndex] = this.cellDataView[sourceIndex];
            }
        }
        
        // 清空新插入的行
        for (let col = 0; col < this.cols; col++) {
            const newIndex = atRow * this.cols + col;
            this.cellDataView[newIndex] = 0; // 空字符串的索引
        }
    }
    
    // 插入列
    insertCol(atCol) {
        if (atCol < 0 || atCol > this.cols) {
            throw new Error('Invalid column position');
        }
        
        const oldCols = this.cols;
        this.resize(this.rows, this.cols + 1);
        
        // 从最后一行开始向上处理，避免覆盖数据
        for (let row = this.rows - 1; row >= 0; row--) {
            // 从右到左移动列数据
            for (let col = this.cols - 1; col > atCol; col--) {
                const sourceIndex = row * oldCols + (col - 1);
                const targetIndex = row * this.cols + col;
                this.cellDataView[targetIndex] = this.cellDataView[sourceIndex];
            }
            
            // 清空新插入的列
            const newIndex = row * this.cols + atCol;
            this.cellDataView[newIndex] = 0;
        }
    }
    
    // 删除行
    deleteRow(rowIndex) {
        if (rowIndex < 0 || rowIndex >= this.rows || this.rows <= 1) {
            throw new Error('Invalid row deletion');
        }
        
        // 向上移动行数据
        for (let row = rowIndex; row < this.rows - 1; row++) {
            for (let col = 0; col < this.cols; col++) {
                const sourceIndex = (row + 1) * this.cols + col;
                const targetIndex = row * this.cols + col;
                this.cellDataView[targetIndex] = this.cellDataView[sourceIndex];
            }
        }
        
        this.resize(this.rows - 1, this.cols);
    }
    
    // 删除列
    deleteCol(colIndex) {
        if (colIndex < 0 || colIndex >= this.cols || this.cols <= 1) {
            throw new Error('Invalid column deletion');
        }
        
        // 向左移动列数据
        for (let row = 0; row < this.rows; row++) {
            for (let col = colIndex; col < this.cols - 1; col++) {
                const sourceIndex = row * this.cols + (col + 1);
                const targetIndex = row * this.cols + col;
                this.cellDataView[targetIndex] = this.cellDataView[sourceIndex];
            }
        }
        
        this.resize(this.rows, this.cols - 1);
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