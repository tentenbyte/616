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
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.handleClick(x, y);
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.handleMouseMove(x, y);
        });
        
        window.addEventListener('resize', () => {
            this.setupHighDPI();
            this.render();
        });
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
    
    getCellFromPosition(x, y) {
        // 考虑滚动偏移
        const adjustedX = x + this.scrollX;
        const adjustedY = y + this.scrollY;
        
        // 检查是否在标题区域
        if (adjustedY < this.config.headerHeight) {
            return { row: -1, col: -1 };
        }
        
        const row = Math.floor((adjustedY - this.config.headerHeight) / this.config.cellHeight);
        const col = Math.floor(adjustedX / this.config.cellWidth);
        
        if (row >= this.data.rows || col >= this.data.cols) {
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
        const endRow = Math.min(this.data.rows - 1, 
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
            
            // 重新渲染单元格文本
            const cellValue = this.data.getCellValue(this.selectedCell.row, this.selectedCell.col);
            if (cellValue) {
                this.ctx.fillStyle = this.config.cellTextColor;
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
        this.selectedCell = { row, col };
        this.render();
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