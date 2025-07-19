// 库存管理表格渲染器
const InventoryRenderer = {
    canvas: null,
    ctx: null,
    selectedCell: { row: -1, col: -1 },
    scrollX: 0,
    scrollY: 0,
    columnWidths: [], // 动态列宽数组
    
    // 初始化渲染器
    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas元素 '${canvasId}' 未找到`);
        }
        
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            throw new Error('无法获取Canvas 2D上下文');
        }
        
        this.setupCanvas();
        this.setupEventListeners();
        this.calculateColumnWidths();
    },
    
    // 设置Canvas尺寸和高DPI支持
    setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(dpr, dpr);
        this.ctx.imageSmoothingEnabled = true;
    },
    
    // 设置事件监听器
    setupEventListeners() {
        // 鼠标点击
        this.canvas.addEventListener('click', (e) => {
            const cell = this.getCellFromPosition(e.offsetX, e.offsetY);
            if (cell.row >= 0 && cell.col >= 0) {
                // 如果点击的是表头
                if (cell.row === 0) {
                    const rect = this.canvas.getBoundingClientRect();
                    const cellX = this.getColumnPosition(cell.col) - this.scrollX;
                    const cellWidth = this.columnWidths[cell.col] || InventoryConfig.canvas.cellWidth;
                    
                    // 判断点击位置：右侧20px为筛选区域，其他为排序区域
                    if (e.offsetX > cellX + cellWidth - 20) {
                        // 点击筛选下拉箭头
                        this.showFilterDropdown(cell.col, e.offsetX, e.offsetY);
                    } else {
                        // 点击排序
                        this.handleHeaderClick(cell.col);
                    }
                } else {
                    this.setSelectedCell(cell.row, cell.col);
                }
                this.render();
            }
        });
        
        
        // 鼠标滚轮
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const speed = InventoryConfig.interaction.scroll.speed;
            
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                this.scrollY += e.deltaY > 0 ? speed : -speed;
            } else {
                this.scrollX += e.deltaX > 0 ? speed : -speed;
            }
            
            this.scrollX = Math.max(0, this.scrollX);
            this.scrollY = Math.max(0, this.scrollY);
            
            this.render();
        });
        
        // 窗口大小改变
        window.addEventListener('resize', () => {
            setTimeout(() => {
                this.setupCanvas();
                this.calculateColumnWidths();
                this.render();
            }, 100);
        });
    },
    
    // 渲染表格
    render() {
        if (!this.ctx) return;
        
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
        
        const data = InventoryData.getCurrentData();
        if (!data || data.length === 0) return;
        
        const rowCount = data.length;
        const colCount = data[0].length;
        
        // 计算可见区域
        const visibleArea = this.getVisibleArea(rect.width, rect.height, rowCount, colCount);
        
        // 绘制可见单元格
        for (let row = visibleArea.startRow; row <= visibleArea.endRow; row++) {
            for (let col = visibleArea.startCol; col <= visibleArea.endCol; col++) {
                this.drawCell(row, col, data[row][col]);
            }
        }
        
        // 绘制选中框
        if (this.selectedCell.row >= 0 && this.selectedCell.col >= 0) {
            this.drawSelectedCell();
        }
    },
    
    // 绘制单个单元格
    drawCell(row, col, value) {
        const x = this.getColumnPosition(col) - this.scrollX;
        const y = row * InventoryConfig.canvas.cellHeight - this.scrollY;
        const width = this.columnWidths[col] || InventoryConfig.canvas.cellWidth;
        const height = InventoryConfig.canvas.cellHeight;
        
        // 判断是否为表头
        const isHeader = row === 0;
        
        // 设置背景色
        if (isHeader) {
            this.ctx.fillStyle = InventoryConfig.styles.header.backgroundColor;
        } else {
            this.ctx.fillStyle = row % 2 === 0 ? 
                InventoryConfig.styles.cell.backgroundColor : 
                InventoryConfig.styles.cell.alternateBackgroundColor;
        }
        
        this.ctx.fillRect(x, y, width, height);
        
        // 绘制边框
        this.ctx.strokeStyle = isHeader ? 
            InventoryConfig.styles.header.borderColor : 
            InventoryConfig.styles.border.color;
        this.ctx.lineWidth = InventoryConfig.styles.border.width;
        this.ctx.strokeRect(x, y, width, height);
        
        // 绘制文本
        this.drawCellText(x, y, width, height, value, isHeader, col);
    },
    
    // 绘制单元格文本
    drawCellText(x, y, width, height, text, isHeader, col) {
        if (!text && text !== 0) return;
        
        const fontSize = isHeader ? 
            InventoryConfig.styles.font.headerSize : 
            InventoryConfig.styles.font.size;
        
        this.ctx.font = `${isHeader ? 'bold' : 'normal'} ${fontSize}px ${InventoryConfig.styles.font.family}`;
        this.ctx.fillStyle = isHeader ? 
            InventoryConfig.styles.header.textColor : 
            InventoryConfig.styles.cell.textColor;
        
        // 根据列类型设置文本对齐
        const columnType = this.getColumnType(col);
        if (isHeader) {
            // 表头始终居中显示，使用黑色字体
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = InventoryConfig.styles.header.textColor;
        } else {
            // 所有数据列都居中显示，使用黑色字体
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = InventoryConfig.styles.cell.textColor;
        }
        
        this.ctx.textBaseline = 'middle';
        
        // 处理特殊状态的颜色
        if (this.isStatusColumn(col) && !isHeader) {
            const statusColor = InventoryConfig.styles.status.colors[text];
            if (statusColor) {
                this.ctx.fillStyle = statusColor;
            }
        }
        
        // 文本位置 - 所有文本都居中
        const textX = x + width / 2;
        const textY = y + height / 2;
        
        // 文本裁剪
        let maxWidth = width - 20;
        let displayText = String(text);
        
        // 为表头添加排序指示符 (筛选符号将单独绘制)
        if (isHeader) {
            const sortIndicator = this.getSortIndicator(text);
            if (sortIndicator) {
                displayText += ' ' + sortIndicator;
                maxWidth -= 20;
            }
            // 为筛选按钮预留空间
            maxWidth -= 25;
        }
        
        // 格式化数字和货币
        if (!isHeader) {
            if (columnType === 'currency') {
                const num = parseFloat(text);
                if (!isNaN(num)) {
                    displayText = `¥${num.toFixed(2)}`;
                }
            } else if (columnType === 'number') {
                const num = parseFloat(text);
                if (!isNaN(num)) {
                    displayText = num.toString();
                }
            }
        }
        
        // 文本省略
        if (this.ctx.measureText(displayText).width > maxWidth) {
            while (displayText.length > 0 && this.ctx.measureText(displayText + '...').width > maxWidth) {
                displayText = displayText.slice(0, -1);
            }
            displayText += '...';
        }
        
        this.ctx.fillText(displayText, textX, textY);
        
        // 为表头绘制筛选按钮到右下角
        if (isHeader) {
            this.ctx.fillStyle = '#666';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillText('▼', x + width - 6, y + height - 5);
        }
    },
    
    // 绘制选中单元格
    drawSelectedCell() {
        const x = this.getColumnPosition(this.selectedCell.col) - this.scrollX;
        const y = this.selectedCell.row * InventoryConfig.canvas.cellHeight - this.scrollY;
        const width = this.columnWidths[this.selectedCell.col] || InventoryConfig.canvas.cellWidth;
        const height = InventoryConfig.canvas.cellHeight;
        
        this.ctx.strokeStyle = InventoryConfig.styles.selected.borderColor;
        this.ctx.lineWidth = InventoryConfig.styles.selected.borderWidth;
        this.ctx.strokeRect(x, y, width, height);
    },
    
    // 计算列宽
    calculateColumnWidths() {
        const rect = this.canvas.getBoundingClientRect();
        const canvasWidth = rect.width - 20; // 减去一些边距
        const data = InventoryData.getCurrentData();
        
        if (!data || data.length === 0) return;
        
        const colCount = data[0].length;
        const tableType = InventoryData.currentTable;
        const columns = InventoryConfig.columns[tableType];
        
        // 计算原始总宽度
        let totalOriginalWidth = 0;
        const originalWidths = [];
        
        for (let i = 0; i < colCount; i++) {
            const width = columns && columns[i] ? columns[i].width : InventoryConfig.canvas.cellWidth;
            originalWidths[i] = width;
            totalOriginalWidth += width;
        }
        
        // 自适应调整列宽 - 总是按比例缩放
        this.columnWidths = [];
        const scaleFactor = canvasWidth / totalOriginalWidth;
        
        for (let i = 0; i < colCount; i++) {
            const scaledWidth = Math.floor(originalWidths[i] * scaleFactor);
            // 设置最小宽度限制
            const minWidth = 60;
            this.columnWidths[i] = Math.max(minWidth, scaledWidth);
        }
        
        // 微调确保总宽度等于画布宽度
        const actualTotal = this.columnWidths.reduce((sum, width) => sum + width, 0);
        const diff = canvasWidth - actualTotal;
        
        if (diff !== 0) {
            // 将差值分配给最后一列
            this.columnWidths[colCount - 1] += diff;
        }
    },
    
    // 获取列的X位置
    getColumnPosition(col) {
        let x = 0;
        for (let i = 0; i < col; i++) {
            x += this.columnWidths[i] || InventoryConfig.canvas.cellWidth;
        }
        return x;
    },
    
    // 获取可见区域
    getVisibleArea(canvasWidth, canvasHeight, rowCount, colCount) {
        const cellHeight = InventoryConfig.canvas.cellHeight;
        
        const startRow = Math.max(0, Math.floor(this.scrollY / cellHeight));
        const endRow = Math.min(rowCount - 1, Math.ceil((this.scrollY + canvasHeight) / cellHeight));
        
        // 计算可见列范围
        let startCol = 0;
        let endCol = colCount - 1;
        let currentX = 0;
        
        // 找到开始列
        for (let col = 0; col < colCount; col++) {
            const colWidth = this.columnWidths[col] || InventoryConfig.canvas.cellWidth;
            if (currentX + colWidth > this.scrollX) {
                startCol = col;
                break;
            }
            currentX += colWidth;
        }
        
        // 找到结束列
        currentX = this.getColumnPosition(startCol);
        for (let col = startCol; col < colCount; col++) {
            const colWidth = this.columnWidths[col] || InventoryConfig.canvas.cellWidth;
            if (currentX > this.scrollX + canvasWidth) {
                endCol = col - 1;
                break;
            }
            currentX += colWidth;
        }
        
        return { startRow, endRow, startCol, endCol };
    },
    
    // 根据鼠标位置获取单元格
    getCellFromPosition(x, y) {
        const row = Math.floor((y + this.scrollY) / InventoryConfig.canvas.cellHeight);
        
        // 计算列位置
        let col = -1;
        let currentX = 0;
        const clickX = x + this.scrollX;
        
        for (let i = 0; i < this.columnWidths.length; i++) {
            const colWidth = this.columnWidths[i] || InventoryConfig.canvas.cellWidth;
            if (clickX >= currentX && clickX < currentX + colWidth) {
                col = i;
                break;
            }
            currentX += colWidth;
        }
        
        const data = InventoryData.getCurrentData();
        if (row >= 0 && row < data.length && col >= 0 && col < data[0].length) {
            return { row, col };
        }
        
        return { row: -1, col: -1 };
    },
    
    // 设置选中单元格
    setSelectedCell(row, col) {
        this.selectedCell = { row, col };
        
        // 通知应用程序单元格选择变化
        if (window.InventoryApp && window.InventoryApp.onCellSelected) {
            window.InventoryApp.onCellSelected(row, col);
        }
    },
    
    // 获取选中单元格
    getSelectedCell() {
        return this.selectedCell;
    },
    
    // 获取列类型
    getColumnType(col) {
        const tableType = InventoryData.currentTable;
        const columns = InventoryConfig.columns[tableType];
        
        if (columns && columns[col]) {
            return columns[col].type;
        }
        
        return 'text';
    },
    
    // 判断是否为状态列
    isStatusColumn(col) {
        const data = InventoryData.getCurrentData();
        if (!data || data.length === 0) return false;
        
        const header = data[0][col];
        return header === '类型' || header === '状态';
    },
    
    // 滚动到指定位置
    scrollTo(x, y) {
        this.scrollX = Math.max(0, x);
        this.scrollY = Math.max(0, y);
        this.render();
    },
    
    // 滚动到选中单元格
    scrollToSelected() {
        if (this.selectedCell.row < 0 || this.selectedCell.col < 0) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const cellHeight = InventoryConfig.canvas.cellHeight;
        const cellWidth = this.columnWidths[this.selectedCell.col] || InventoryConfig.canvas.cellWidth;
        
        const cellX = this.getColumnPosition(this.selectedCell.col);
        const cellY = this.selectedCell.row * cellHeight;
        
        // 检查是否需要滚动
        if (cellX < this.scrollX) {
            this.scrollX = cellX;
        } else if (cellX + cellWidth > this.scrollX + rect.width) {
            this.scrollX = cellX + cellWidth - rect.width;
        }
        
        if (cellY < this.scrollY) {
            this.scrollY = cellY;
        } else if (cellY + cellHeight > this.scrollY + rect.height) {
            this.scrollY = cellY + cellHeight - rect.height;
        }
        
        this.render();
    },
    
    // 获取排序指示符
    getSortIndicator(columnName) {
        if (InventoryData.sortColumn === columnName) {
            return InventoryData.sortDirection === 'asc' ? '↑' : '↓';
        }
        return '';
    },
    
    // 处理表头点击
    handleHeaderClick(col) {
        const data = InventoryData.getRawData();
        if (!data || data.length === 0) return;
        
        const columnName = data[0][col];
        
        // 切换排序方向
        if (InventoryData.sortColumn === columnName) {
            if (InventoryData.sortDirection === 'asc') {
                InventoryData.setSort(columnName, 'desc');
            } else {
                InventoryData.setSort('', 'asc'); // 清除排序
            }
        } else {
            InventoryData.setSort(columnName, 'asc');
        }
        
        // 通知应用程序刷新
        if (window.InventoryApp && window.InventoryApp.refresh) {
            window.InventoryApp.refresh();
        }
    },
    
    // 显示Excel样式的筛选下拉框
    showFilterDropdown(col, canvasX, canvasY) {
        const data = InventoryData.getRawData();
        if (!data || data.length === 0) return;
        
        const columnName = data[0][col];
        
        // 获取该列的所有唯一值
        const uniqueValues = new Set();
        for (let i = 1; i < data.length; i++) {
            uniqueValues.add(data[i][col]);
        }
        const sortedValues = Array.from(uniqueValues).sort();
        
        // 移除现有的筛选下拉框
        const existingDropdown = document.querySelector('.filter-dropdown');
        if (existingDropdown) {
            existingDropdown.remove();
        }
        
        // 创建筛选下拉框
        const dropdown = document.createElement('div');
        dropdown.className = 'filter-dropdown';
        
        // 计算下拉框位置
        const rect = this.canvas.getBoundingClientRect();
        dropdown.style.left = (rect.left + canvasX) + 'px';
        dropdown.style.top = (rect.top + canvasY + 25) + 'px';
        
        // 下拉框标题
        const header = document.createElement('div');
        header.className = 'filter-dropdown-header';
        header.textContent = `筛选: ${columnName}`;
        dropdown.appendChild(header);
        
        // 全选/全不选选项
        const selectAllOption = document.createElement('div');
        selectAllOption.className = 'filter-option';
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.checked = true;
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = dropdown.querySelectorAll('.value-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
        selectAllOption.appendChild(selectAllCheckbox);
        selectAllOption.appendChild(document.createTextNode('全选'));
        dropdown.appendChild(selectAllOption);
        
        // 分隔线
        const separator = document.createElement('div');
        separator.style.borderTop = '1px solid #eee';
        separator.style.margin = '5px 0';
        dropdown.appendChild(separator);
        
        // 各个值的选项
        sortedValues.forEach(value => {
            const option = document.createElement('div');
            option.className = 'filter-option';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'value-checkbox';
            checkbox.checked = true;
            checkbox.dataset.value = value;
            
            option.appendChild(checkbox);
            option.appendChild(document.createTextNode(value || '(空白)'));
            dropdown.appendChild(option);
        });
        
        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'filter-actions';
        
        const okBtn = document.createElement('button');
        okBtn.className = 'filter-btn';
        okBtn.textContent = '确定';
        okBtn.addEventListener('click', () => {
            const selectedValues = [];
            const checkboxes = dropdown.querySelectorAll('.value-checkbox:checked');
            checkboxes.forEach(cb => selectedValues.push(cb.dataset.value));
            
            // 应用筛选
            InventoryData.setColumnFilter(columnName, selectedValues);
            
            dropdown.remove();
            if (window.InventoryApp && window.InventoryApp.refresh) {
                window.InventoryApp.refresh();
            }
        });
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'filter-btn';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => {
            dropdown.remove();
        });
        
        actions.appendChild(okBtn);
        actions.appendChild(cancelBtn);
        dropdown.appendChild(actions);
        
        document.body.appendChild(dropdown);
        
        // 点击其他地方关闭下拉框
        setTimeout(() => {
            document.addEventListener('click', function closeDropdown(e) {
                if (!dropdown.contains(e.target)) {
                    dropdown.remove();
                    document.removeEventListener('click', closeDropdown);
                }
            });
        }, 0);
    }
};