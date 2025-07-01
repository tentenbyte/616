class TableApp {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas element with id '${canvasId}' not found`);
        }
        
        // 初始化数据结构
        this.dataStructures = new TableDataStructures(20, 10);
        
        // 初始化渲染器
        this.renderer = new CanvasTableRenderer(this.canvas, this.dataStructures);
        
        // 编辑状态
        this.isEditing = false;
        this.editInput = null;
        
        // 绑定事件
        this.bindEvents();
        
        // 初始化示例数据
        this.loadSampleData();
        
        // 首次渲染
        this.renderer.render();
    }
    
    bindEvents() {
        // 单元格选择事件
        this.renderer.onCellSelected = (row, col) => {
            this.onCellSelected(row, col);
        };
        
        // 双击编辑
        this.canvas.addEventListener('dblclick', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const cell = this.renderer.getCellFromPosition(x, y);
            if (cell.row >= 0 && cell.col >= 0) {
                this.startEdit(cell.row, cell.col);
            }
        });
        
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
        
        // 工具栏按钮
        this.bindToolbarEvents();
    }
    
    bindToolbarEvents() {
        const addRowBtn = document.getElementById('addRowBtn');
        const addColBtn = document.getElementById('addColBtn');
        const deleteRowBtn = document.getElementById('deleteRowBtn');
        const deleteColBtn = document.getElementById('deleteColBtn');
        
        if (addRowBtn) {
            addRowBtn.addEventListener('click', () => this.addRow());
        }
        
        if (addColBtn) {
            addColBtn.addEventListener('click', () => this.addColumn());
        }
        
        if (deleteRowBtn) {
            deleteRowBtn.addEventListener('click', () => this.deleteRow());
        }
        
        if (deleteColBtn) {
            deleteColBtn.addEventListener('click', () => this.deleteColumn());
        }
    }
    
    loadSampleData() {
        // 加载一些示例数据
        const sampleData = [
            ['姓名', '年龄', '城市', '职业'],
            ['张三', '25', '北京', '工程师'],
            ['李四', '30', '上海', '设计师'],
            ['王五', '28', '广州', '产品经理'],
            ['赵六', '32', '深圳', '开发者']
        ];
        
        for (let row = 0; row < sampleData.length; row++) {
            for (let col = 0; col < sampleData[row].length; col++) {
                this.dataStructures.setCellValue(row, col, sampleData[row][col]);
            }
        }
        
        this.updateStatusBar(`加载了 ${sampleData.length} 行 ${sampleData[0].length} 列的示例数据`);
    }
    
    onCellSelected(row, col) {
        const cellValue = this.dataStructures.getCellValue(row, col);
        this.updateStatusBar(`选中单元格 (${row + 1}, ${this.getColumnName(col)}): ${cellValue}`);
    }
    
    startEdit(row, col) {
        if (this.isEditing) {
            this.finishEdit();
        }
        
        this.isEditing = true;
        
        // 创建输入框
        this.editInput = document.createElement('input');
        this.editInput.type = 'text';
        this.editInput.value = this.dataStructures.getCellValue(row, col);
        this.editInput.className = 'edit-input';
        
        // 定位输入框
        const cellX = col * this.renderer.config.cellWidth - this.renderer.scrollX;
        const cellY = this.renderer.config.headerHeight + row * this.renderer.config.cellHeight - this.renderer.scrollY;
        
        this.editInput.style.position = 'absolute';
        this.editInput.style.left = `${cellX + this.canvas.offsetLeft + 2}px`;
        this.editInput.style.top = `${cellY + this.canvas.offsetTop + 2}px`;
        this.editInput.style.width = `${this.renderer.config.cellWidth - 4}px`;
        this.editInput.style.height = `${this.renderer.config.cellHeight - 4}px`;
        this.editInput.style.border = '2px solid #007acc';
        this.editInput.style.borderRadius = '2px';
        this.editInput.style.padding = '4px';
        this.editInput.style.fontSize = '14px';
        this.editInput.style.outline = 'none';
        this.editInput.style.zIndex = '1000';
        
        document.body.appendChild(this.editInput);
        this.editInput.focus();
        this.editInput.select();
        
        // 绑定编辑事件
        this.editInput.addEventListener('blur', () => this.finishEdit());
        this.editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.finishEdit();
            } else if (e.key === 'Escape') {
                this.cancelEdit();
            }
        });
        
        this.editingCell = { row, col };
    }
    
    finishEdit() {
        if (!this.isEditing || !this.editInput) return;
        
        const newValue = this.editInput.value;
        const { row, col } = this.editingCell;
        
        this.dataStructures.setCellValue(row, col, newValue);
        
        this.cleanupEdit();
        this.renderer.render();
        
        this.updateStatusBar(`更新单元格 (${row + 1}, ${this.getColumnName(col)}): ${newValue}`);
    }
    
    cancelEdit() {
        this.cleanupEdit();
    }
    
    cleanupEdit() {
        if (this.editInput) {
            document.body.removeChild(this.editInput);
            this.editInput = null;
        }
        this.isEditing = false;
        this.editingCell = null;
    }
    
    handleKeyDown(e) {
        if (this.isEditing) return;
        
        const selected = this.renderer.getSelectedCell();
        if (selected.row < 0 || selected.col < 0) return;
        
        let newRow = selected.row;
        let newCol = selected.col;
        
        switch (e.key) {
            case 'ArrowUp':
                newRow = Math.max(0, selected.row - 1);
                e.preventDefault();
                break;
            case 'ArrowDown':
                newRow = Math.min(this.dataStructures.rows - 1, selected.row + 1);
                e.preventDefault();
                break;
            case 'ArrowLeft':
                newCol = Math.max(0, selected.col - 1);
                e.preventDefault();
                break;
            case 'ArrowRight':
                newCol = Math.min(this.dataStructures.cols - 1, selected.col + 1);
                e.preventDefault();
                break;
            case 'Enter':
                this.startEdit(selected.row, selected.col);
                e.preventDefault();
                break;
            case 'Delete':
            case 'Backspace':
                this.dataStructures.setCellValue(selected.row, selected.col, '');
                this.renderer.render();
                e.preventDefault();
                break;
        }
        
        if (newRow !== selected.row || newCol !== selected.col) {
            this.renderer.setSelectedCell(newRow, newCol);
            this.onCellSelected(newRow, newCol);
        }
    }
    
    addRow() {
        const selected = this.renderer.getSelectedCell();
        const insertAt = selected.row >= 0 ? selected.row + 1 : this.dataStructures.rows;
        
        this.dataStructures.insertRow(insertAt);
        this.renderer.render();
        this.updateStatusBar(`在第 ${insertAt + 1} 行插入新行`);
    }
    
    addColumn() {
        const selected = this.renderer.getSelectedCell();
        const insertAt = selected.col >= 0 ? selected.col + 1 : this.dataStructures.cols;
        
        this.dataStructures.insertCol(insertAt);
        this.renderer.render();
        this.updateStatusBar(`在第 ${this.getColumnName(insertAt)} 列插入新列`);
    }
    
    deleteRow() {
        const selected = this.renderer.getSelectedCell();
        if (selected.row < 0 || this.dataStructures.rows <= 1) {
            this.updateStatusBar('无法删除行：没有选中行或只剩一行');
            return;
        }
        
        this.dataStructures.deleteRow(selected.row);
        this.renderer.setSelectedCell(-1, -1);
        this.renderer.render();
        this.updateStatusBar(`删除了第 ${selected.row + 1} 行`);
    }
    
    deleteColumn() {
        const selected = this.renderer.getSelectedCell();
        if (selected.col < 0 || this.dataStructures.cols <= 1) {
            this.updateStatusBar('无法删除列：没有选中列或只剩一列');
            return;
        }
        
        this.dataStructures.deleteCol(selected.col);
        this.renderer.setSelectedCell(-1, -1);
        this.renderer.render();
        this.updateStatusBar(`删除了第 ${this.getColumnName(selected.col)} 列`);
    }
    
    getColumnName(col) {
        let name = '';
        while (col >= 0) {
            name = String.fromCharCode(65 + (col % 26)) + name;
            col = Math.floor(col / 26) - 1;
        }
        return name;
    }
    
    updateStatusBar(message) {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
        }
    }
    
    getMemoryUsage() {
        return this.dataStructures.getMemoryUsage();
    }
    
    exportData() {
        const data = [];
        for (let row = 0; row < this.dataStructures.rows; row++) {
            const rowData = [];
            for (let col = 0; col < this.dataStructures.cols; col++) {
                rowData.push(this.dataStructures.getCellValue(row, col));
            }
            data.push(rowData);
        }
        return data;
    }
}