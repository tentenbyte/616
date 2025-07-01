class CanvasTableRenderer {
    constructor(canvas, dataStructures) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = dataStructures;
        
        // 渲染配置
        this.config = {
            cellWidth: 100,
            cellHeight: 30,
            headerHeight: 35,
            borderColor: '#d0d0d0',
            gridColor: '#e8e8e8',
            headerBgColor: '#f5f5f5',
            headerTextColor: '#333',
            cellBgColor: '#fff',
            cellTextColor: '#333',
            selectedCellBgColor: '#e6f3ff',
            selectedCellBorderColor: '#007acc',
            font: '14px -apple-system, BlinkMacSystemFont, sans-serif',
            headerFont: '14px -apple-system, BlinkMacSystemFont, sans-serif'
        };
        
        // 视图状态
        this.scrollX = 0;
        this.scrollY = 0;
        this.selectedCell = { row: -1, col: -1 };
        
        // 绑定事件
        this.bindEvents();
        
        // 设置高DPI支持
        this.setupHighDPI();
    }
    
    setupHighDPI() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(dpr, dpr);
        this.actualWidth = rect.width;
        this.actualHeight = rect.height;
    }
    
    bindEvents() {
        // 事件处理现在由InputManager统一管理
        // 保留这些方法以便InputManager调用，但不再直接绑定事件监听器
    }
    
    handleClick(x, y) {
        const cell = this.getCellFromPosition(x, y);
        if (cell.row >= 0 && cell.col >= 0) {
            this.selectedCell = cell;
            this.render();
            this.onCellSelected && this.onCellSelected(cell.row, cell.col);
        }
    }
    
    handleMouseMove(x, y) {
        const cell = this.getCellFromPosition(x, y);
        if (cell.row >= 0 && cell.col >= 0) {
            this.canvas.style.cursor = 'cell';
        } else {
            this.canvas.style.cursor = 'default';
        }
    }
    
    handleWheel(e) {
        const scrollSpeed = 30;
        
        // 垂直滚动
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            this.scrollY += e.deltaY > 0 ? scrollSpeed : -scrollSpeed;
        } else {
            // 水平滚动
            this.scrollX += e.deltaX > 0 ? scrollSpeed : -scrollSpeed;
        }
        
        // 限制滚动边界
        this.scrollX = Math.max(0, Math.min(this.scrollX, 
            Math.max(0, this.data.cols * this.config.cellWidth - this.actualWidth)));
        this.scrollY = Math.max(0, Math.min(this.scrollY, 
            Math.max(0, this.data.currentRowCount * this.config.cellHeight - this.actualHeight + this.config.headerHeight)));
        
        this.render();
    }
    
    getCellFromPosition(x, y) {
        // 考虑滚动偏移
        const adjustedX = x + this.scrollX;
        const adjustedY = y + this.scrollY;
        
        // 检查是否在标题区域
        if (y < this.config.headerHeight - this.scrollY) {
            return { row: -1, col: -1 };
        }
        
        const row = Math.floor((adjustedY - this.config.headerHeight) / this.config.cellHeight);
        const col = Math.floor(adjustedX / this.config.cellWidth);
        
        // 边界检查
        if (row < 0 || col < 0 || row >= this.data.currentRowCount || col >= this.data.cols) {
            return { row: -1, col: -1 };
        }
        
        return { row, col };
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.actualWidth, this.actualHeight);
        
        // 设置字体
        this.ctx.font = this.config.font;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        
        // 计算可见区域
        const visibleArea = this.getVisibleArea();
        
        // 渲染表格内容
        this.renderGrid(visibleArea);
        this.renderHeaders(visibleArea);
        this.renderCells(visibleArea);
        this.renderSelection();
    }
    
    getVisibleArea() {
        const startCol = Math.max(0, Math.floor(this.scrollX / this.config.cellWidth));
        const endCol = Math.min(this.data.cols - 1, 
            Math.ceil((this.scrollX + this.actualWidth) / this.config.cellWidth));
        
        const startRow = Math.max(0, 
            Math.floor((this.scrollY - this.config.headerHeight) / this.config.cellHeight));
        const endRow = Math.min(this.data.currentRowCount - 1, 
            Math.ceil((this.scrollY + this.actualHeight - this.config.headerHeight) / this.config.cellHeight));
        
        return { startRow, endRow, startCol, endCol };
    }
    
    renderGrid(visibleArea) {
        this.ctx.strokeStyle = this.config.gridColor;
        this.ctx.lineWidth = 1;
        
        // 垂直线
        for (let col = visibleArea.startCol; col <= visibleArea.endCol + 1; col++) {
            const x = col * this.config.cellWidth - this.scrollX;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.actualHeight);
            this.ctx.stroke();
        }
        
        // 水平线（包括标题行）
        const headerY = this.config.headerHeight - this.scrollY;
        this.ctx.beginPath();
        this.ctx.moveTo(0, headerY);
        this.ctx.lineTo(this.actualWidth, headerY);
        this.ctx.stroke();
        
        for (let row = visibleArea.startRow; row <= visibleArea.endRow + 1; row++) {
            const y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.actualWidth, y);
            this.ctx.stroke();
        }
    }
    
    renderHeaders(visibleArea) {
        this.ctx.fillStyle = this.config.headerBgColor;
        this.ctx.fillRect(0, -this.scrollY, this.actualWidth, this.config.headerHeight);
        
        this.ctx.font = this.config.headerFont;
        this.ctx.fillStyle = this.config.headerTextColor;
        
        // 列标题
        for (let col = visibleArea.startCol; col <= visibleArea.endCol; col++) {
            const x = col * this.config.cellWidth - this.scrollX;
            const headerText = this.getColumnHeader(col);
            this.ctx.fillText(headerText, x + 8, this.config.headerHeight / 2 - this.scrollY);
        }
    }
    
    renderCells(visibleArea) {
        this.ctx.font = this.config.font;
        this.ctx.fillStyle = this.config.cellTextColor;
        
        for (let row = visibleArea.startRow; row <= visibleArea.endRow; row++) {
            for (let col = visibleArea.startCol; col <= visibleArea.endCol; col++) {
                const x = col * this.config.cellWidth - this.scrollX;
                const y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
                
                const cellValue = this.data.getCellValue(row, col);
                if (cellValue) {
                    this.ctx.fillText(cellValue, x + 8, y + this.config.cellHeight / 2);
                }
            }
        }
    }
    
    renderSelection() {
        if (this.selectedCell.row >= 0 && this.selectedCell.col >= 0) {
            const x = this.selectedCell.col * this.config.cellWidth - this.scrollX;
            const y = this.config.headerHeight + this.selectedCell.row * this.config.cellHeight - this.scrollY;
            
            // 选中背景
            this.ctx.fillStyle = this.config.selectedCellBgColor;
            this.ctx.fillRect(x, y, this.config.cellWidth, this.config.cellHeight);
            
            // 选中边框
            this.ctx.strokeStyle = this.config.selectedCellBorderColor;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, this.config.cellWidth, this.config.cellHeight);
            
            // 检查是否处于编辑状态
            const editingState = this.cellEditor ? this.cellEditor.getEditingState() : null;
            
            if (editingState && 
                editingState.cell.row === this.selectedCell.row && 
                editingState.cell.col === this.selectedCell.col) {
                // 编辑模式：渲染编辑中的文本和光标
                this.renderEditingText(x, y, editingState);
            } else {
                // 非编辑模式：渲染原始单元格文本
                const cellValue = this.data.getCellValue(this.selectedCell.row, this.selectedCell.col);
                if (cellValue) {
                    this.ctx.fillStyle = this.config.cellTextColor;
                    this.ctx.fillText(cellValue, x + 8, y + this.config.cellHeight / 2);
                }
            }
        }
    }
    
    // 渲染编辑状态的文本和光标
    renderEditingText(cellX, cellY, editingState) {
        const textX = cellX + 8;
        const textY = cellY + this.config.cellHeight / 2;
        
        // 渲染编辑中的文本
        this.ctx.fillStyle = this.config.cellTextColor;
        this.ctx.fillText(editingState.text, textX, textY);
        
        // 渲染光标
        if (editingState.cursorVisible) {
            // 计算光标位置
            const textBeforeCursor = editingState.text.substring(0, editingState.cursorPosition);
            const textWidth = this.ctx.measureText(textBeforeCursor).width;
            const cursorX = textX + textWidth;
            
            // 绘制光标
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(cursorX, cellY + 4);
            this.ctx.lineTo(cursorX, cellY + this.config.cellHeight - 4);
            this.ctx.stroke();
        }
    }
    
    // 仅重绘单个单元格（性能优化）
    renderSingleCell(row, col) {
        if (row < 0 || col < 0 || row >= this.data.currentRowCount || col >= this.data.cols) {
            return;
        }
        
        const x = col * this.config.cellWidth - this.scrollX;
        const y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
        
        // 清除单元格区域
        this.ctx.clearRect(x, y, this.config.cellWidth, this.config.cellHeight);
        
        // 重绘网格线
        this.ctx.strokeStyle = this.config.gridColor;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, this.config.cellWidth, this.config.cellHeight);
        
        // 检查是否是选中的单元格
        if (this.selectedCell.row === row && this.selectedCell.col === col) {
            // 选中背景
            this.ctx.fillStyle = this.config.selectedCellBgColor;
            this.ctx.fillRect(x, y, this.config.cellWidth, this.config.cellHeight);
            
            // 选中边框
            this.ctx.strokeStyle = this.config.selectedCellBorderColor;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, this.config.cellWidth, this.config.cellHeight);
            
            // 检查是否处于编辑状态
            const editingState = this.cellEditor ? this.cellEditor.getEditingState() : null;
            
            if (editingState && 
                editingState.cell.row === row && 
                editingState.cell.col === col) {
                // 编辑模式：渲染编辑中的文本和光标
                this.renderEditingText(x, y, editingState);
            } else {
                // 非编辑模式：渲染原始单元格文本
                const cellValue = this.data.getCellValue(row, col);
                if (cellValue) {
                    this.ctx.fillStyle = this.config.cellTextColor;
                    this.ctx.font = this.config.font;
                    this.ctx.fillText(cellValue, x + 8, y + this.config.cellHeight / 2);
                }
            }
        } else {
            // 普通单元格
            const cellValue = this.data.getCellValue(row, col);
            if (cellValue) {
                this.ctx.fillStyle = this.config.cellTextColor;
                this.ctx.font = this.config.font;
                this.ctx.fillText(cellValue, x + 8, y + this.config.cellHeight / 2);
            }
        }
    }
    
    getColumnHeader(col) {
        let header = '';
        let num = col;
        while (num >= 0) {
            header = String.fromCharCode(65 + (num % 26)) + header;
            num = Math.floor(num / 26) - 1;
        }
        return header;
    }
    
    setSelectedCell(row, col) {
        const oldRow = this.selectedCell.row;
        const oldCol = this.selectedCell.col;
        
        // 如果选择了相同的单元格，不需要重绘
        if (oldRow === row && oldCol === col) {
            return;
        }
        
        this.selectedCell = { row, col };
        
        // 优化：只重绘受影响的单元格
        // 重绘之前选中的单元格（如果有效）
        if (oldRow >= 0 && oldCol >= 0) {
            this.renderSingleCell(oldRow, oldCol);
        }
        
        // 重绘新选中的单元格（如果有效）
        if (row >= 0 && col >= 0) {
            this.renderSingleCell(row, col);
        }
    }
    
    scrollTo(x, y) {
        this.scrollX = Math.max(0, x);
        this.scrollY = Math.max(0, y);
        this.render();
    }
    
    getSelectedCell() {
        return this.selectedCell;
    }
}