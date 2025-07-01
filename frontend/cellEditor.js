class CellEditor {
    constructor(canvasContainer, renderer, dataStructures) {
        this.container = canvasContainer;
        this.renderer = renderer;
        this.data = dataStructures;
        
        // 编辑状态
        this.isEditing = false;
        this.editingCell = null;
        this.editingText = '';
        this.cursorPosition = 0;
        this.cursorVisible = true;
        
        // 编辑配置
        this.config = {
            cursorColor: '#000',
            cursorWidth: 1,
            cursorBlinkInterval: 500,
            padding: 8,
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
        };
        
        // 回调函数
        this.onEditStart = null;
        this.onEditComplete = null;
        this.onEditCancel = null;
        
        // 绑定事件
        this.bindEvents();
        
        // 光标闪烁定时器
        this.cursorTimer = null;
    }
    
    // 启动光标闪烁
    startCursorBlink() {
        this.stopCursorBlink();
        this.cursorVisible = true;
        this.cursorTimer = setInterval(() => {
            this.cursorVisible = !this.cursorVisible;
            // 性能优化：只重绘当前编辑的单元格
            if (this.editingCell) {
                this.renderer.renderSingleCell(this.editingCell.row, this.editingCell.col);
            }
        }, this.config.cursorBlinkInterval);
    }
    
    // 停止光标闪烁
    stopCursorBlink() {
        if (this.cursorTimer) {
            clearInterval(this.cursorTimer);
            this.cursorTimer = null;
        }
    }
    
    // 绑定事件
    bindEvents() {
        // CellEditor现在是纯逻辑模块，不直接监听键盘事件
        // 键盘事件统一由TableApp处理，然后调用相应的CellEditor方法
    }
    
    // 开始编辑单元格
    startEdit(row, col, initialValue = '', editType = 'normal', clickPosition = null) {
        // 检查是否允许编辑这个单元格
        if (!this.canEditCell(row, col)) {
            console.warn(`Cannot edit cell (${row}, ${col}): editing restrictions`);
            return false;
        }
        
        // 如果已经在编辑，先完成当前编辑
        if (this.isEditing) {
            this.finishEdit();
        }
        
        this.isEditing = true;
        this.editingCell = { row, col };
        
        // 获取当前单元格值
        const currentValue = initialValue || this.data.getCellValue(row, col);
        this.editingText = currentValue;
        
        // 设置光标位置和焦点
        this.setupCursorAndFocus(editType, clickPosition, currentValue);
        
        // 启动光标闪烁和重新渲染（仅重绘当前单元格）
        this.startCursorBlink();
        this.renderer.renderSingleCell(row, col);
        
        // 触发回调
        if (this.onEditStart) {
            this.onEditStart(row, col, currentValue);
        }
        
        return true;
    }
    
    // 设置光标位置和焦点
    setupCursorAndFocus(editType, clickPosition, currentValue) {
        if (editType === 'replace' || currentValue !== this.editingText) {
            // 直接输入或替换：光标在末尾（将被替换）
            this.cursorPosition = this.editingText.length;
        } else if (editType === 'append') {
            // F2或Enter：光标在文本末尾
            this.cursorPosition = this.editingText.length;
        } else if (editType === 'click' && clickPosition) {
            // 双击：Excel风格，根据点击位置计算光标位置
            this.cursorPosition = this.calculateCursorPositionFromClick(clickPosition, this.editingText);
        } else {
            // 其他情况：光标在文本末尾
            this.cursorPosition = this.editingText.length;
        }
    }
    
    // 检查是否可以编辑单元格
    canEditCell(row, col) {
        // 检查边界
        if (row < 0 || col < 0 || row >= this.data.currentRowCount || col >= this.data.cols) {
            return false;
        }
        
        // 时间序列限制：只能编辑最后一行
        // 临时放宽限制，允许编辑所有行进行测试
        // if (row !== this.data.currentRowCount - 1) {
        //     return false;
        // }
        
        return true;
    }
    
    // 处理编辑状态的键盘输入（由TableApp调用）
    handleEditingKeyDown(e) {
        if (!this.isEditing) return false;
        
        // 返回true表示事件已处理，false表示未处理
        
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                this.finishEditAndMoveDown();
                break;
            case 'Escape':
                e.preventDefault();
                this.cancelEdit();
                break;
            case 'Tab':
                e.preventDefault();
                if (e.shiftKey) {
                    this.finishEditAndMoveLeft();
                } else {
                    this.finishEditAndMoveRight();
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.moveCursor(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.moveCursor(1);
                break;
            case 'Home':
                e.preventDefault();
                this.cursorPosition = 0;
                this.resetCursorBlink();
                break;
            case 'End':
                e.preventDefault();
                this.cursorPosition = this.editingText.length;
                this.resetCursorBlink();
                break;
            case 'Backspace':
                e.preventDefault();
                this.handleBackspace();
                break;
            case 'Delete':
                e.preventDefault();
                this.handleDelete();
                break;
            case 'ArrowDown':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.finishEditAndMoveDown();
                }
                break;
            case 'ArrowUp':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.finishEditAndMoveUp();
                }
                break;
            default:
                // 处理可输入字符
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    this.insertCharacter(e.key);
                    return true;
                }
                return false;
        }
        return true; // 所有其他编辑相关按键都已处理
    }
    
    // 移动光标
    moveCursor(direction) {
        this.cursorPosition = Math.max(0, Math.min(this.editingText.length, this.cursorPosition + direction));
        this.resetCursorBlink();
    }
    
    // 重置光标闪烁（让光标立即显示）
    resetCursorBlink() {
        this.cursorVisible = true;
        this.startCursorBlink();
    }
    
    // 插入字符
    insertCharacter(char) {
        const before = this.editingText.substring(0, this.cursorPosition);
        const after = this.editingText.substring(this.cursorPosition);
        this.editingText = before + char + after;
        this.cursorPosition++;
        this.resetCursorBlink();
    }
    
    // 处理退格
    handleBackspace() {
        if (this.cursorPosition > 0) {
            const before = this.editingText.substring(0, this.cursorPosition - 1);
            const after = this.editingText.substring(this.cursorPosition);
            this.editingText = before + after;
            this.cursorPosition--;
            this.resetCursorBlink();
        }
    }
    
    // 处理删除
    handleDelete() {
        if (this.cursorPosition < this.editingText.length) {
            const before = this.editingText.substring(0, this.cursorPosition);
            const after = this.editingText.substring(this.cursorPosition + 1);
            this.editingText = before + after;
            this.resetCursorBlink();
        }
    }
    
    // 处理文本输入（IME支持）
    handleTextInput(e) {
        if (e.data) {
            this.insertCharacter(e.data);
        }
    }
    
    // 根据点击位置计算光标在文本中的位置
    calculateCursorPositionFromClick(clickPosition, text) {
        if (!this.editingCell || !text) return 0;
        
        const { row, col } = this.editingCell;
        const canvasRect = this.renderer.canvas.getBoundingClientRect();
        
        // 计算单元格在Canvas中的位置
        const cellX = col * this.renderer.config.cellWidth - this.renderer.scrollX;
        const cellY = this.renderer.config.headerHeight + row * this.renderer.config.cellHeight - this.renderer.scrollY;
        
        // 计算点击位置在单元格内的相对位置
        const relativeX = clickPosition.x - cellX;
        
        // 创建临时canvas来测量文本宽度
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.font = `${this.config.fontSize} ${this.config.fontFamily}`;
        
        // 考虑padding
        const textStartX = this.config.padding;
        const clickTextX = relativeX - textStartX;
        
        if (clickTextX <= 0) return 0;
        
        // 逐字符测量，找到最接近点击位置的字符位置
        let bestPosition = 0;
        let minDistance = Math.abs(clickTextX);
        
        for (let i = 0; i <= text.length; i++) {
            const textSlice = text.substring(0, i);
            const textWidth = tempCtx.measureText(textSlice).width;
            const distance = Math.abs(clickTextX - textWidth);
            
            if (distance < minDistance) {
                minDistance = distance;
                bestPosition = i;
            }
        }
        
        return bestPosition;
    }
    
    // 获取光标在Canvas中的位置
    getCursorCanvasPosition() {
        if (!this.editingCell) return null;
        
        const { row, col } = this.editingCell;
        
        // 计算单元格在Canvas中的位置
        const cellX = col * this.renderer.config.cellWidth - this.renderer.scrollX;
        const cellY = this.renderer.config.headerHeight + row * this.renderer.config.cellHeight - this.renderer.scrollY;
        
        // 创建临时canvas来测量文本宽度
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.font = this.renderer.config.font;
        
        // 计算光标前的文本宽度
        const textBeforeCursor = this.editingText.substring(0, this.cursorPosition);
        const textWidth = tempCtx.measureText(textBeforeCursor).width;
        
        return {
            x: cellX + this.config.padding + textWidth,
            y: cellY,
            cellX: cellX,
            cellY: cellY,
            cellWidth: this.renderer.config.cellWidth,
            cellHeight: this.renderer.config.cellHeight
        };
    }
    
    // 完成编辑
    finishEdit() {
        if (!this.isEditing || !this.editingCell) return;
        
        const newValue = this.editingText;
        const { row, col } = this.editingCell;
        
        try {
            // 保存值到数据结构
            this.data.setCellValue(row, col, newValue);
            
            // 清理编辑状态
            this.cleanupEdit();
            
            // 触发回调
            if (this.onEditComplete) {
                this.onEditComplete(row, col, newValue);
            }
            
            return true;
        } catch (error) {
            console.error('Failed to save cell value:', error);
            // 不清理编辑状态，让用户修正
            return false;
        }
    }
    
    // 取消编辑
    cancelEdit() {
        if (!this.isEditing) return;
        
        const { row, col } = this.editingCell || {};
        
        // 清理编辑状态
        this.cleanupEdit();
        
        // 触发回调
        if (this.onEditCancel) {
            this.onEditCancel(row, col);
        }
    }
    
    // 清理编辑状态
    cleanupEdit() {
        this.stopCursorBlink();
        this.isEditing = false;
        this.editingCell = null;
        this.editingText = '';
        this.cursorPosition = 0;
        this.cursorVisible = true;
    }
    
    // 完成编辑并移动到下一个单元格
    finishEditAndMoveRight() {
        if (!this.editingCell) return;
        
        const { row, col } = this.editingCell;
        const success = this.finishEdit();
        
        if (success) {
            const nextCol = Math.min(col + 1, this.data.cols - 1);
            // Excel风格：移动选择，不立即编辑
            this.renderer.setSelectedCell(row, nextCol);
            if (this.onCellMove) {
                this.onCellMove(row, nextCol);
            }
        }
    }
    
    finishEditAndMoveLeft() {
        if (!this.editingCell) return;
        
        const { row, col } = this.editingCell;
        const success = this.finishEdit();
        
        if (success) {
            const prevCol = Math.max(col - 1, 0);
            // Excel风格：移动选择，不立即编辑
            this.renderer.setSelectedCell(row, prevCol);
            if (this.onCellMove) {
                this.onCellMove(row, prevCol);
            }
        }
    }
    
    finishEditAndMoveDown() {
        if (!this.editingCell) return;
        
        const { row, col } = this.editingCell;
        const success = this.finishEdit();
        
        if (success) {
            const nextRow = Math.min(row + 1, this.data.currentRowCount - 1);
            // Excel风格：移动选择，不立即编辑
            this.renderer.setSelectedCell(nextRow, col);
            if (this.onCellMove) {
                this.onCellMove(nextRow, col);
            }
        }
    }
    
    finishEditAndMoveUp() {
        // 在时间序列表格中，不允许向上编辑历史数据
        this.finishEdit();
    }
    
    // 获取当前编辑状态
    getEditingCell() {
        return this.isEditing ? { ...this.editingCell } : null;
    }
    
    // 检查是否正在编辑
    isEditingCell(row, col) {
        return this.isEditing && 
               this.editingCell && 
               this.editingCell.row === row && 
               this.editingCell.col === col;
    }
    
    // 设置输入验证器
    setInputValidator(validator) {
        this.inputValidator = validator;
    }
    
    // 获取编辑状态数据（供渲染器使用）
    getEditingState() {
        if (!this.isEditing) return null;
        
        return {
            cell: { ...this.editingCell },
            text: this.editingText,
            cursorPosition: this.cursorPosition,
            cursorVisible: this.cursorVisible
        };
    }
    
    // 销毁编辑器
    destroy() {
        this.cancelEdit();
    }
}