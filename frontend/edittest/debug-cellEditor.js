// 调试版本的CellEditor，增加了大量日志输出
class CellEditor {
    constructor(canvasContainer, renderer, dataStructures) {
        console.log('🔧 CellEditor constructor called');
        console.log('  canvasContainer:', canvasContainer);
        console.log('  renderer:', renderer);
        console.log('  dataStructures:', dataStructures);
        
        this.container = canvasContainer;
        this.renderer = renderer;
        this.data = dataStructures;
        
        // 编辑状态
        this.isEditing = false;
        this.editingCell = null;
        this.inputElement = null;
        
        // 编辑配置
        this.config = {
            inputClass: 'cell-editor-input',
            borderColor: '#007acc',
            borderWidth: 2,
            padding: 4,
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            backgroundColor: '#fff',
            zIndex: 1000
        };
        
        // 回调函数
        this.onEditStart = null;
        this.onEditComplete = null;
        this.onEditCancel = null;
        this.onRequestNewRow = null;
        
        // 绑定事件
        this.bindEvents();
        
        // 创建样式
        this.createStyles();
        
        console.log('✅ CellEditor initialization complete');
    }
    
    // 创建编辑器样式
    createStyles() {
        console.log('🎨 Creating editor styles');
        const styleId = 'cell-editor-styles';
        if (document.getElementById(styleId)) {
            console.log('  Styles already exist, skipping');
            return;
        }
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .${this.config.inputClass} {
                position: absolute;
                border: ${this.config.borderWidth}px solid ${this.config.borderColor};
                border-radius: 2px;
                padding: ${this.config.padding}px;
                font-size: ${this.config.fontSize};
                font-family: ${this.config.fontFamily};
                background-color: ${this.config.backgroundColor};
                outline: none;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                z-index: ${this.config.zIndex};
                box-sizing: border-box;
            }
            
            .${this.config.inputClass}:focus {
                border-color: #0066cc;
                box-shadow: 0 2px 8px rgba(0, 102, 204, 0.2);
            }
        `;
        document.head.appendChild(style);
        console.log('✅ Styles created successfully');
    }
    
    // 绑定事件
    bindEvents() {
        console.log('📡 Binding events');
        if (!this.renderer || !this.renderer.canvas) {
            console.error('❌ Renderer or canvas not available for event binding');
            return;
        }
        
        // 监听滚动事件，同步编辑器位置
        this.renderer.canvas.addEventListener('wheel', (e) => {
            if (this.isEditing) {
                console.log('🔄 Wheel event detected, updating editor position');
                // 延迟更新位置，等待滚动完成
                setTimeout(() => this.updateEditorPosition(), 16);
            }
        });
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            if (this.isEditing) {
                console.log('📏 Window resize detected, updating editor position');
                this.updateEditorPosition();
            }
        });
        
        console.log('✅ Events bound successfully');
    }
    
    // 开始编辑单元格
    startEdit(row, col, initialValue = '') {
        console.log(`🎯 startEdit called: (${row}, ${col})`);
        console.log(`  initialValue: "${initialValue}"`);
        console.log(`  isEditing: ${this.isEditing}`);
        
        // 检查是否允许编辑这个单元格
        const canEdit = this.canEditCell(row, col);
        console.log(`  canEditCell result: ${canEdit}`);
        
        if (!canEdit) {
            console.warn(`❌ Cannot edit cell (${row}, ${col}): Time series editing restrictions`);
            return false;
        }
        
        // 如果已经在编辑，先完成当前编辑
        if (this.isEditing) {
            console.log('  Already editing, finishing current edit');
            this.finishEdit();
        }
        
        this.isEditing = true;
        this.editingCell = { row, col };
        console.log(`  Set editing state: ${JSON.stringify(this.editingCell)}`);
        
        // 获取当前单元格值
        const currentValue = initialValue || this.data.getCellValue(row, col);
        console.log(`  Current cell value: "${currentValue}"`);
        
        // 创建输入元素
        console.log('  Creating input element');
        this.createInputElement(currentValue);
        
        // 计算并设置位置
        console.log('  Updating editor position');
        this.updateEditorPosition();
        
        // 添加到DOM
        console.log('  Adding input to DOM');
        document.body.appendChild(this.inputElement);
        
        // 聚焦并选中文本
        console.log('  Focusing input and selecting text');
        this.inputElement.focus();
        this.inputElement.select();
        
        // 触发回调
        if (this.onEditStart) {
            console.log('  Calling onEditStart callback');
            this.onEditStart(row, col, currentValue);
        }
        
        console.log('✅ startEdit completed successfully');
        return true;
    }
    
    // 检查是否可以编辑单元格
    canEditCell(row, col) {
        console.log(`🔍 canEditCell: (${row}, ${col})`);
        console.log(`  data.currentRowCount: ${this.data.currentRowCount}`);
        console.log(`  data.cols: ${this.data.cols}`);
        
        // 检查边界
        if (row < 0 || col < 0 || row >= this.data.currentRowCount || col >= this.data.cols) {
            console.log('  ❌ Out of bounds');
            return false;
        }
        
        // 时间序列限制：只能编辑最后一行
        const lastRow = this.data.currentRowCount - 1;
        console.log(`  Last editable row: ${lastRow}`);
        
        if (row !== lastRow) {
            console.log(`  ❌ Time series restriction: can only edit row ${lastRow}, attempted ${row}`);
            return false;
        }
        
        console.log('  ✅ Cell can be edited');
        return true;
    }
    
    // 创建输入元素
    createInputElement(value) {
        console.log(`📝 Creating input element with value: "${value}"`);
        this.inputElement = document.createElement('input');
        this.inputElement.type = 'text';
        this.inputElement.value = value;
        this.inputElement.className = this.config.inputClass;
        
        console.log('  Input element created:', this.inputElement);
        
        // 绑定键盘事件
        this.inputElement.addEventListener('keydown', (e) => {
            console.log(`⌨️ Input keydown: ${e.key}`);
            e.stopPropagation(); // 防止冒泡到表格的键盘处理
            
            switch (e.key) {
                case 'Enter':
                    console.log('  Enter pressed - finishing edit');
                    this.finishEdit();
                    break;
                case 'Escape':
                    console.log('  Escape pressed - canceling edit');
                    this.cancelEdit();
                    break;
                case 'Tab':
                    e.preventDefault();
                    if (e.shiftKey) {
                        console.log('  Shift+Tab pressed - moving left');
                        this.finishEditAndMoveLeft();
                    } else {
                        console.log('  Tab pressed - moving right');
                        this.finishEditAndMoveRight();
                    }
                    break;
                case 'ArrowDown':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        console.log('  Ctrl+ArrowDown pressed - moving down');
                        this.finishEditAndMoveDown();
                    }
                    break;
                case 'ArrowUp':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        console.log('  Ctrl+ArrowUp pressed - moving up');
                        this.finishEditAndMoveUp();
                    }
                    break;
            }
        });
        
        // 失焦时完成编辑
        this.inputElement.addEventListener('blur', () => {
            console.log('📤 Input blur event');
            // 延迟处理，避免其他事件干扰
            setTimeout(() => {
                if (this.isEditing) {
                    console.log('  Finishing edit due to blur');
                    this.finishEdit();
                }
            }, 100);
        });
        
        // 输入事件（可用于实时验证）
        this.inputElement.addEventListener('input', (e) => {
            console.log(`📊 Input change: "${e.target.value}"`);
            this.onInputChange && this.onInputChange(e.target.value);
        });
        
        console.log('✅ Input element configured');
    }
    
    // 计算编辑器位置
    calculateEditorPosition() {
        if (!this.editingCell) {
            console.log('❌ calculateEditorPosition: no editing cell');
            return null;
        }
        
        const { row, col } = this.editingCell;
        console.log(`📐 Calculating position for cell (${row}, ${col})`);
        
        const canvasRect = this.renderer.canvas.getBoundingClientRect();
        console.log('  Canvas rect:', canvasRect);
        
        // 计算单元格在Canvas中的位置
        const cellX = col * this.renderer.config.cellWidth - this.renderer.scrollX;
        const cellY = this.renderer.config.headerHeight + row * this.renderer.config.cellHeight - this.renderer.scrollY;
        console.log(`  Cell position in canvas: (${cellX}, ${cellY})`);
        
        // 转换为页面坐标
        const pageX = canvasRect.left + cellX;
        const pageY = canvasRect.top + cellY;
        console.log(`  Page coordinates: (${pageX}, ${pageY})`);
        
        const position = {
            left: pageX + this.config.borderWidth,
            top: pageY + this.config.borderWidth,
            width: this.renderer.config.cellWidth - (this.config.borderWidth * 2),
            height: this.renderer.config.cellHeight - (this.config.borderWidth * 2)
        };
        
        console.log('  Calculated position:', position);
        return position;
    }
    
    // 更新编辑器位置
    updateEditorPosition() {
        if (!this.inputElement || !this.editingCell) {
            console.log('❌ updateEditorPosition: missing input or editing cell');
            return;
        }
        
        console.log('📍 Updating editor position');
        const position = this.calculateEditorPosition();
        if (!position) {
            console.log('❌ Failed to calculate position');
            return;
        }
        
        // 检查是否在可视区域内
        const canvasRect = this.renderer.canvas.getBoundingClientRect();
        const isVisible = (
            position.left >= canvasRect.left &&
            position.top >= canvasRect.top &&
            position.left + position.width <= canvasRect.right &&
            position.top + position.height <= canvasRect.bottom
        );
        
        console.log(`  Is visible: ${isVisible}`);
        
        if (isVisible) {
            this.inputElement.style.left = `${position.left}px`;
            this.inputElement.style.top = `${position.top}px`;
            this.inputElement.style.width = `${position.width}px`;
            this.inputElement.style.height = `${position.height}px`;
            this.inputElement.style.display = 'block';
            console.log('  ✅ Editor positioned and visible');
        } else {
            // 如果不在可视区域，隐藏编辑器但不取消编辑
            this.inputElement.style.display = 'none';
            console.log('  ⚠️ Editor hidden (out of view)');
        }
    }
    
    // 完成编辑
    finishEdit() {
        console.log('🏁 finishEdit called');
        if (!this.isEditing || !this.inputElement || !this.editingCell) {
            console.log('  Not currently editing, nothing to finish');
            return;
        }
        
        const newValue = this.inputElement.value;
        const { row, col } = this.editingCell;
        console.log(`  Finishing edit for (${row}, ${col}) with value: "${newValue}"`);
        
        try {
            // 保存值到数据结构
            this.data.setCellValue(row, col, newValue);
            console.log('  ✅ Value saved to data structure');
            
            // 清理编辑状态
            this.cleanupEdit();
            
            // 触发回调
            if (this.onEditComplete) {
                console.log('  Calling onEditComplete callback');
                this.onEditComplete(row, col, newValue);
            }
            
            console.log('✅ Edit finished successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to save cell value:', error);
            // 不清理编辑状态，让用户修正
            return false;
        }
    }
    
    // 取消编辑
    cancelEdit() {
        console.log('❌ cancelEdit called');
        if (!this.isEditing) {
            console.log('  Not currently editing, nothing to cancel');
            return;
        }
        
        const { row, col } = this.editingCell || {};
        console.log(`  Canceling edit for (${row}, ${col})`);
        
        // 清理编辑状态
        this.cleanupEdit();
        
        // 触发回调
        if (this.onEditCancel) {
            console.log('  Calling onEditCancel callback');
            this.onEditCancel(row, col);
        }
        
        console.log('✅ Edit canceled');
    }
    
    // 清理编辑状态
    cleanupEdit() {
        console.log('🧹 cleanupEdit called');
        if (this.inputElement) {
            console.log('  Removing input element from DOM');
            this.inputElement.remove();
            this.inputElement = null;
        }
        
        this.isEditing = false;
        this.editingCell = null;
        console.log('  ✅ Edit state cleaned up');
    }
    
    // 其他方法简化版本...
    finishEditAndMoveRight() { this.finishEdit(); }
    finishEditAndMoveLeft() { this.finishEdit(); }
    finishEditAndMoveDown() { 
        const success = this.finishEdit();
        if (success && this.onRequestNewRow) {
            this.onRequestNewRow();
        }
    }
    finishEditAndMoveUp() { this.finishEdit(); }
    
    getEditingCell() {
        return this.isEditing ? { ...this.editingCell } : null;
    }
    
    isEditingCell(row, col) {
        return this.isEditing && 
               this.editingCell && 
               this.editingCell.row === row && 
               this.editingCell.col === col;
    }
    
    destroy() {
        this.cancelEdit();
        const styleElement = document.getElementById('cell-editor-styles');
        if (styleElement) {
            styleElement.remove();
        }
    }
}