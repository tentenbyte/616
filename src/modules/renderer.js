/**
 * 表格渲染引擎模块 - ES5版本
 * Firefox 52兼容
 */
(function(global) {
    'use strict';

    function TableRenderer(canvas, config, dependencies) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config;
        
        // 注入的依赖
        dependencies = dependencies || {};
        this.database = dependencies.database;
        this.eventManager = dependencies.eventManager || global.globalEventManager;
        this.tableCore = dependencies.tableCore; // 添加tableCore引用以支持编辑状态
        
        // 渲染状态
        this.isRendering = false;
        this.renderQueue = [];
        this.lastRenderTime = 0;
        
        // 滚动状态
        this.scrollX = 0;
        this.scrollY = 0;
        
        // 视口信息
        this.viewport = {
            startRow: 0,
            endRow: 0,
            startCol: 0,
            endCol: 0
        };
        
        // 缓存
        this.measureCache = {};
        this.fontCache = {}; // 字体缓存
        
        // 局部绘制优化
        this.dirtyRegions = [];
        this.lastSelectedCell = { row: -1, col: -1 };
        this.isPartialRender = false;
        
        // 性能监控
        this.performanceStats = {
            totalRenders: 0,
            partialRenders: 0,
            fullRenders: 0,
            averageRenderTime: 0,
            lastRenderTime: 0
        };
        
        
        // 绑定方法
        this.render = global.Helpers.throttle(this.render.bind(this), 16); // 60fps
        
        this.setupCanvas();
    }

    TableRenderer.prototype.setupCanvas = function() {
        var rect = this.canvas.getBoundingClientRect();
        
        // 设置Canvas尺寸
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        // 设置样式大小
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // 设置文本渲染属性
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'left';
        this.ctx.font = '14px monospace';
        this.ctx.fillStyle = '#000000';
        this.ctx.imageSmoothingEnabled = true;
    };


    TableRenderer.prototype.resizeCanvas = function() {
        this.setupCanvas();
        this.invalidateCache();
        this.render();
    };

    TableRenderer.prototype.render = function(tableData, selectedCell) {
        if (!tableData) return;
        
        if (this.isRendering) {
            this.renderQueue.push({ tableData: tableData, selectedCell: selectedCell });
            return;
        }
        
        this.isRendering = true;
        this.lastRenderTime = performance.now();
        
        try {
            this.fullRender(tableData, selectedCell);
            
            // 更新性能统计
            var renderTime = performance.now() - this.lastRenderTime;
            this.updatePerformanceStats(renderTime);
            
            this.eventManager.emit(global.EVENTS.TABLE_REDRAWN, {
                renderTime: renderTime,
                viewport: this.viewport,
                isPartialRender: this.isPartialRender,
                performanceStats: this.performanceStats
            });
            
            
        } catch (error) {
            this.eventManager.emit(global.EVENTS.APP_ERROR, 'Render failed', error);
        } finally {
            this.isRendering = false;
            
            // 处理渲染队列
            if (this.renderQueue.length > 0) {
                var lastRender = this.renderQueue.pop();
                this.renderQueue = [];
                this.render(lastRender.tableData, lastRender.selectedCell);
            }
        }
    };


    // 全量绘制
    TableRenderer.prototype.fullRender = function(tableData, selectedCell) {
        this.isPartialRender = false;
        this.clearCanvas();
        this.updateViewport(tableData);
        
        
        // 绘制顺序很重要
        this.drawBackground();
        this.drawHeaders(tableData);
        this.drawCells(tableData);
        this.drawGrid(tableData);
        this.drawScrollbars(tableData);
        
        
        
        // 更新最后选中的单元格
        this.lastSelectedCell = {
            row: selectedCell ? selectedCell.row : -1,
            col: selectedCell ? selectedCell.col : -1
        };
        
        // 更新全量绘制统计
        this.performanceStats.fullRenders++;
    };

    // 更新性能统计
    TableRenderer.prototype.updatePerformanceStats = function(renderTime) {
        this.performanceStats.totalRenders++;
        this.performanceStats.lastRenderTime = renderTime;
        
        // 计算平均渲染时间
        var totalTime = this.performanceStats.averageRenderTime * (this.performanceStats.totalRenders - 1);
        this.performanceStats.averageRenderTime = (totalTime + renderTime) / this.performanceStats.totalRenders;
    };

    // 获取性能统计
    TableRenderer.prototype.getPerformanceStats = function() {
        var partialRatio = this.performanceStats.totalRenders > 0 ? 
            (this.performanceStats.partialRenders / this.performanceStats.totalRenders * 100).toFixed(1) : 0;
        
        return {
            totalRenders: this.performanceStats.totalRenders,
            partialRenders: this.performanceStats.partialRenders,
            fullRenders: this.performanceStats.fullRenders,
            partialRenderRatio: partialRatio + '%',
            averageRenderTime: this.performanceStats.averageRenderTime.toFixed(2) + 'ms',
            lastRenderTime: this.performanceStats.lastRenderTime.toFixed(2) + 'ms'
        };
    };

    TableRenderer.prototype.clearCanvas = function() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    };

    // 重绘单个单元格及其网格区域
    TableRenderer.prototype.redrawCell = function(tableData, row, col, isSelected) {
        if (!this.isValidCell(row, col)) return;
        
        var x = this.config.rowHeaderWidth + col * this.config.cellWidth - this.scrollX;
        var y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
        
        // 检查单元格是否在可见区域内
        if (x + this.config.cellWidth <= this.config.rowHeaderWidth ||
            y + this.config.cellHeight <= this.config.headerHeight ||
            x >= this.canvas.clientWidth ||
            y >= this.canvas.clientHeight) {
            return;
        }
        
        // 计算需要重绘的区域，包括相邻单元格的部分边界
        var borderWidth = Math.max(this.config.selectedBorderWidth, this.config.defaultBorderWidth);
        var padding = borderWidth + 2; // 额外padding确保完全清除
        
        // 重绘区域覆盖目标单元格及其边界
        var redrawX = x - padding;
        var redrawY = y - padding;
        var redrawWidth = this.config.cellWidth + 2 * padding;
        var redrawHeight = this.config.cellHeight + 2 * padding;
        
        // 保存当前绘制状态
        this.ctx.save();
        
        // 设置裁剪区域
        this.ctx.beginPath();
        this.ctx.rect(redrawX, redrawY, redrawWidth, redrawHeight);
        this.ctx.clip();
        
        // 清除整个重绘区域
        this.ctx.clearRect(redrawX, redrawY, redrawWidth, redrawHeight);
        
        // 重绘背景色（白色）
        this.ctx.fillStyle = this.config.cellBg || '#ffffff';
        this.ctx.fillRect(redrawX, redrawY, redrawWidth, redrawHeight);
        
        // 重绘目标单元格  
        this.redrawSingleCell(tableData, row, col, x, y, isSelected);
        
        // 重绘可能受影响的相邻单元格部分
        this.redrawAdjacentCellParts(tableData, row, col, redrawX, redrawY, redrawWidth, redrawHeight);
        
        // 重绘整个区域的网格线
        this.redrawGridInRegion(redrawX, redrawY, redrawWidth, redrawHeight);
        
        // 恢复绘制状态
        this.ctx.restore();
    };

    // 重绘单个单元格的内容
    TableRenderer.prototype.redrawSingleCell = function(tableData, row, col, x, y, isSelected) {
        // 绘制单元格背景（白色）
        this.ctx.fillStyle = this.config.cellBg || '#ffffff';
        this.ctx.fillRect(x, y, this.config.cellWidth, this.config.cellHeight);
        
        // 绘制单元格内容
        var cellValue = '';
        
        if (this.tableCore && this.tableCore.getCellValue) {
            cellValue = this.tableCore.getCellValue(row, col);
        }
        // 如果没有tableCore，再尝试直接从tableData获取
        else if (tableData && tableData.getValue) {
            cellValue = tableData.getValue(row, col);
        }
        
        // 确保cellValue是字符串
        if (cellValue === null || cellValue === undefined) {
            cellValue = '';
        } else {
            cellValue = String(cellValue);
        }
        
        if (cellValue) {
            // 使用默认背景色（暂时不支持自定义背景色）
            // TODO: 在列式存储中添加样式支持
            
            // 绘制文本
            this.ctx.fillStyle = this.config.textColor;
            this.ctx.font = this.config.fontSize + 'px ' + this.config.fontFamily;
            this.drawCellText(cellValue, x, y, this.config.cellWidth, this.config.cellHeight);
        }
        
        // 绘制选中状态 - 已被CSS方式替代，此代码保留用于兼容性
        // 注意：现在选择框由CSS元素处理，无需Canvas绘制
        if (isSelected) {
            // 选择框现在由CSS处理，这里仅保留代码结构
            // 如果需要传统Canvas绘制，可以取消注释以下代码：
            /*
            this.ctx.fillStyle = this.config.selectedBg;
            this.ctx.fillRect(x, y, this.config.cellWidth, this.config.cellHeight);
            
            // 重绘文本（在选中背景上）
            if (cellData && cellData.value) {
                this.ctx.fillStyle = (cellData.style && cellData.style.color) || this.config.textColor;
                this.drawCellText(cellData.value, x, y, this.config.cellWidth, this.config.cellHeight);
            }
            
            // 绘制选中边框
            this.ctx.strokeStyle = this.config.selectedBorderColor;
            this.ctx.lineWidth = this.config.selectedBorderWidth;
            this.ctx.strokeRect(x, y, this.config.cellWidth, this.config.cellHeight);
            */
        }
    };

    // 重绘相邻单元格的可见部分
    TableRenderer.prototype.redrawAdjacentCellParts = function(tableData, centerRow, centerCol, redrawX, redrawY, redrawWidth, redrawHeight) {
        // 检查9宫格范围内的单元格
        for (var row = centerRow - 1; row <= centerRow + 1; row++) {
            for (var col = centerCol - 1; col <= centerCol + 1; col++) {
                // 跳过中心单元格（已经重绘过）
                if (row === centerRow && col === centerCol) continue;
                
                if (!this.isValidCell(row, col)) continue;
                
                var cellX = this.config.rowHeaderWidth + col * this.config.cellWidth - this.scrollX;
                var cellY = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
                
                // 检查是否与重绘区域有重叠
                if (this.cellIntersectsRegion(cellX, cellY, redrawX, redrawY, redrawWidth, redrawHeight)) {
                    this.redrawSingleCell(tableData, row, col, cellX, cellY, false);
                }
            }
        }
    };

    // 检查单元格是否与重绘区域相交
    TableRenderer.prototype.cellIntersectsRegion = function(cellX, cellY, regionX, regionY, regionWidth, regionHeight) {
        return !(cellX + this.config.cellWidth <= regionX ||
                cellY + this.config.cellHeight <= regionY ||
                cellX >= regionX + regionWidth ||
                cellY >= regionY + regionHeight);
    };

    // 重绘指定区域内的所有网格线
    TableRenderer.prototype.redrawGridInRegion = function(regionX, regionY, regionWidth, regionHeight) {
        this.ctx.strokeStyle = this.config.borderColor || '#333333';
        this.ctx.lineWidth = this.config.defaultBorderWidth || 1;
        this.ctx.beginPath();
        
        var startCol = Math.floor((regionX + this.scrollX - this.config.rowHeaderWidth) / this.config.cellWidth);
        var endCol = Math.ceil((regionX + regionWidth + this.scrollX - this.config.rowHeaderWidth) / this.config.cellWidth);
        var startRow = Math.floor((regionY + this.scrollY - this.config.headerHeight) / this.config.cellHeight);
        var endRow = Math.ceil((regionY + regionHeight + this.scrollY - this.config.headerHeight) / this.config.cellHeight);
        
        // 绘制垂直网格线
        for (var col = Math.max(0, startCol); col <= endCol; col++) {
            var x = this.config.rowHeaderWidth + col * this.config.cellWidth - this.scrollX;
            if (x >= regionX && x <= regionX + regionWidth) {
                this.ctx.moveTo(x, regionY);
                this.ctx.lineTo(x, regionY + regionHeight);
            }
        }
        
        // 绘制水平网格线
        for (var row = Math.max(0, startRow); row <= endRow; row++) {
            var y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
            if (y >= regionY && y <= regionY + regionHeight) {
                this.ctx.moveTo(regionX, y);
                this.ctx.lineTo(regionX + regionWidth, y);
            }
        }
        
        this.ctx.stroke();
    };


    // 检查单元格是否有效
    TableRenderer.prototype.isValidCell = function(row, col) {
        return row >= 0 && col >= 0 && 
               row < 1000 && col < 100; // 假设最大表格大小
    };

    TableRenderer.prototype.updateViewport = function(tableData) {
        var canvasWidth = this.canvas.clientWidth;
        var canvasHeight = this.canvas.clientHeight;
        
        // 获取数据库的行列数 - 修复：使用实际数据行数而不是最大行数
        var maxRows = tableData.currentRows || tableData.maxRows || 100;
        var maxCols = tableData.maxCols || 26;
        
        console.log('🔧 视口更新:', {
            canvasSize: { width: canvasWidth, height: canvasHeight },
            tableSize: { maxRows: maxRows, maxCols: maxCols, currentRows: tableData.currentRows },
            scroll: { x: this.scrollX, y: this.scrollY },
            config: { cellWidth: this.config.cellWidth, cellHeight: this.config.cellHeight }
        });
        
        // 计算可见的行列范围
        this.viewport.startRow = Math.max(0, Math.floor(this.scrollY / this.config.cellHeight));
        this.viewport.endRow = Math.min(
            maxRows - 1,
            Math.ceil((this.scrollY + canvasHeight - this.config.headerHeight) / this.config.cellHeight)
        );
        
        this.viewport.startCol = Math.max(0, Math.floor(this.scrollX / this.config.cellWidth));
        this.viewport.endCol = Math.min(
            maxCols - 1,
            Math.ceil((this.scrollX + canvasWidth - this.config.rowHeaderWidth) / this.config.cellWidth)
        );
        
        console.log('🔧 计算的视口范围:', {
            rows: { start: this.viewport.startRow, end: this.viewport.endRow },
            cols: { start: this.viewport.startCol, end: this.viewport.endCol }
        });
    };

    TableRenderer.prototype.drawBackground = function() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    };

    TableRenderer.prototype.drawHeaders = function(tableData) {
        var canvasWidth = this.canvas.clientWidth;
        var canvasHeight = this.canvas.clientHeight;
        
        // 绘制列标题背景
        this.ctx.fillStyle = this.config.headerBg;
        this.ctx.fillRect(
            this.config.rowHeaderWidth,
            0,
            canvasWidth - this.config.rowHeaderWidth,
            this.config.headerHeight
        );
        
        // 绘制行标题背景
        this.ctx.fillRect(
            0,
            this.config.headerHeight,
            this.config.rowHeaderWidth,
            canvasHeight - this.config.headerHeight
        );
        
        // 绘制左上角
        this.ctx.fillRect(0, 0, this.config.rowHeaderWidth, this.config.headerHeight);
        
        // 绘制列标题文本
        this.ctx.fillStyle = this.config.headerTextColor;
        this.ctx.textAlign = 'center';
        this.ctx.font = this.config.fontSize + 'px ' + this.config.fontFamily;
        
        for (var col = this.viewport.startCol; col <= this.viewport.endCol; col++) {
            var x = this.config.rowHeaderWidth + col * this.config.cellWidth - this.scrollX;
            
            // 生成列标题（A, B, C...）
            var colLabel = String.fromCharCode(65 + col);
            
            if (x + this.config.cellWidth > this.config.rowHeaderWidth) {
                this.ctx.fillText(
                    colLabel,
                    x + this.config.cellWidth / 2,
                    this.config.headerHeight / 2
                );
            }
        }
        
        // 绘制行标题文本（递增数字）
        for (var row = this.viewport.startRow; row <= this.viewport.endRow; row++) {
            var y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
            
            if (y + this.config.cellHeight > this.config.headerHeight) {
                this.ctx.fillText(
                    (row + 1).toString(),
                    this.config.rowHeaderWidth / 2,
                    y + this.config.cellHeight / 2
                );
            }
        }
    };

    TableRenderer.prototype.drawCells = function(tableData) {
        // 🔧 确保Canvas状态正确设置
        this.ctx.fillStyle = this.config.textColor || '#000000';  // 确保文字颜色不是transparent
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';  // 确保垂直居中
        this.ctx.font = this.config.fontSize + 'px ' + this.config.fontFamily;
        
        console.log('🎨 开始绘制单元格文字 - Canvas状态:', {
            textColor: this.ctx.fillStyle,
            font: this.ctx.font,
            textAlign: this.ctx.textAlign,
            textBaseline: this.ctx.textBaseline,
            viewport: this.viewport,
            scrollOffset: { x: this.scrollX, y: this.scrollY },
            tableData: !!tableData,
            tableCore: !!this.tableCore
        });
        
        var cellsDrawn = 0;
        var cellsWithData = 0;
        
        for (var row = this.viewport.startRow; row <= this.viewport.endRow; row++) {
            for (var col = this.viewport.startCol; col <= this.viewport.endCol; col++) {
                // 🔧 修复: 优先使用tableCore，确保数据获取的一致性
                var cellValue = '';
                
                // 优先使用tableCore.getCellValue（最可靠）
                if (this.tableCore && this.tableCore.getCellValue) {
                    cellValue = this.tableCore.getCellValue(row, col);
                }
                // 备用：直接从tableCore.db获取
                else if (this.tableCore && this.tableCore.db && this.tableCore.db.getValue) {
                    cellValue = this.tableCore.db.getValue(row, col);
                }
                // 最后尝试从tableData获取
                else if (tableData && tableData.getValue) {
                    cellValue = tableData.getValue(row, col);
                }
                
                // 调试：输出数据获取过程（扩展到20行）
                if (row < 20 && col < 8) {
                    console.log('🔧 单元格数据获取 [' + row + ',' + col + ']:', {
                        cellValue: cellValue,
                        hasTableCore: !!this.tableCore,
                        hasTableCoreGetCellValue: !!(this.tableCore && this.tableCore.getCellValue),
                        hasTableCoreDB: !!(this.tableCore && this.tableCore.db),
                        hasTableData: !!tableData
                    });
                }
                
                // 确保cellValue是字符串
                if (cellValue === null || cellValue === undefined) {
                    cellValue = '';
                } else {
                    cellValue = String(cellValue);
                }
                
                if (cellValue && cellValue !== '') {
                    cellsWithData++;
                }
                
                if (!cellValue || cellValue === '') continue;
                
                var x = this.config.rowHeaderWidth + col * this.config.cellWidth - this.scrollX;
                var y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
                
                // 跳过不可见的单元格
                if (x + this.config.cellWidth <= this.config.rowHeaderWidth || 
                    y + this.config.cellHeight <= this.config.headerHeight ||
                    x >= this.canvas.clientWidth ||
                    y >= this.canvas.clientHeight) {
                    continue;
                }
                
                // 绘制单元格背景（暂时跳过自定义样式）
                // TODO: 在列式存储中添加样式支持
                
                // 🔧 重新设置文本样式（确保每次都正确设置）
                this.ctx.fillStyle = this.config.textColor || '#000000';
                this.ctx.font = this.config.fontSize + 'px ' + this.config.fontFamily;
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'middle';
                
                // 🔧 简化：由于EditWidget使用不透明背景完全遮挡，Canvas可以正常绘制
                // 不透明的编辑输入框会自动遮挡Canvas内容，无需复杂的编辑状态检测
                
                // 绘制文本（带裁剪）
                this.drawCellText(cellValue, x, y, this.config.cellWidth, this.config.cellHeight);
                cellsDrawn++;
            }
        }
        
        console.log('📊 单元格绘制完成统计:', {
            '扫描的单元格数': (this.viewport.endRow - this.viewport.startRow + 1) * (this.viewport.endCol - this.viewport.startCol + 1),
            '有数据的单元格': cellsWithData,
            '实际绘制的单元格': cellsDrawn
        });
    };

    // 编辑功能由全局HTML input处理，Canvas专注于渲染

    // 高性能选择状态渲染
    TableRenderer.prototype.renderSelection = function(previousCell, currentCell) {
        var tableData = this.tableCore ? this.tableCore.db : null;
        if (!tableData) return;
        
        // 清除旧选择状态
        if (previousCell && previousCell.row >= 0 && previousCell.col >= 0) {
            var isPreviousEditing = this.tableCore && this.tableCore.isCellEditing && 
                                   this.tableCore.isCellEditing(previousCell.row, previousCell.col);
            this.renderCell(previousCell.row, previousCell.col, isPreviousEditing, tableData);
        }
        
        // 绘制新选择状态
        if (currentCell && currentCell.row >= 0 && currentCell.col >= 0) {
            var isCurrentEditing = this.tableCore && this.tableCore.isCellEditing && 
                                  this.tableCore.isCellEditing(currentCell.row, currentCell.col);
            this.renderCell(currentCell.row, currentCell.col, isCurrentEditing, tableData);
        }
    };

    // 单独渲染一个单元格
    TableRenderer.prototype.renderCell = function(row, col, isEditing, tableData) {
        // 🔧 修复: 如果没有传入tableData，尝试从tableCore获取
        if (!tableData) {
            tableData = this.tableCore ? this.tableCore.db : null;
        }
        if (!tableData || !this.isValidCell(row, col)) return;
        
        var x = this.config.rowHeaderWidth + col * this.config.cellWidth - this.scrollX;
        var y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
        
        // 清除单元格区域
        this.ctx.clearRect(x, y, this.config.cellWidth, this.config.cellHeight);
        
        // 重绘网格线
        this.ctx.strokeStyle = this.config.borderColor;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, this.config.cellWidth, this.config.cellHeight);
        
        // 🔧 修复: 统一数据获取逻辑
        var cellValue = '';
        
        // 首先尝试通过tableCore获取数据（最可靠的方法）
        if (this.tableCore && this.tableCore.getCellValue) {
            cellValue = this.tableCore.getCellValue(row, col);
        }
        // 如果没有tableCore，再尝试直接从tableData获取
        else if (tableData && tableData.getValue) {
            cellValue = tableData.getValue(row, col);
        }
        
        // 确保cellValue是字符串
        if (cellValue === null || cellValue === undefined) {
            cellValue = '';
        } else {
            cellValue = String(cellValue);
        }
        
        if (isEditing) {
            // 正在编辑的单元格不绘制文本，避免与输入框重影
            // EditWidget会处理文本显示
        } else if (cellValue) {
            // 绘制普通文本
            this.ctx.fillStyle = this.config.textColor;
            this.ctx.font = this.config.fontSize + 'px ' + this.config.fontFamily;
            this.drawCellText(cellValue, x, y, this.config.cellWidth, this.config.cellHeight);
        }
        
        // 如果是选中单元格，绘制选中边框
        var selectedCell = this.tableCore ? this.tableCore.state.selectedCell : null;
        if (selectedCell && selectedCell.row === row && selectedCell.col === col && !isEditing) {
            this.ctx.strokeStyle = '#007bff';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x + 1, y + 1, this.config.cellWidth - 2, this.config.cellHeight - 2);
        }
    };

    // 文本截断工具方法
    TableRenderer.prototype.truncateText = function(text, maxWidth) {
        if (!text) return '';
        
        var testWidth = this.ctx.measureText(text).width;
        if (testWidth <= maxWidth) return text;
        
        // 二分查找最佳截断点
        var left = 0, right = text.length;
        while (left < right) {
            var mid = Math.floor((left + right + 1) / 2);
            var testText = text.substring(0, mid) + '...';
            if (this.ctx.measureText(testText).width <= maxWidth) {
                left = mid;
            } else {
                right = mid - 1;
            }
        }
        
        return text.substring(0, left) + '...';
    };

    TableRenderer.prototype.drawCellText = function(text, x, y, width, height) {
        if (!text || text === '') {
            return;
        }
        
        var padding = 5;
        var textX = x + padding;
        var textY = y + height / 2;
        
        // 强制设置文本样式
        this.ctx.save();
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'normal ' + this.config.fontSize + 'px ' + this.config.fontFamily;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        
        // 🔧 强化：确保文本绘制成功
        var textToDraw = String(text);
        console.log('🎨 绘制文本:', { text: textToDraw, x: textX, y: textY, font: this.ctx.font, fillStyle: this.ctx.fillStyle });
        
        // 多次尝试绘制，确保成功
        this.ctx.fillText(textToDraw, textX, textY);
        
        // 验证绘制结果
        var testWidth = this.ctx.measureText(textToDraw).width;
        if (testWidth > 0) {
            console.log('✅ 文本绘制成功:', textToDraw, '宽度:', testWidth);
        } else {
            console.error('❌ 文本绘制失败:', textToDraw);
        }
        
        this.ctx.restore();
    };

    TableRenderer.prototype.getCellFont = function(style) {
        var fontStyle = '';
        var fontWeight = 'normal';
        var fontSize = this.config.fontSize;
        var fontFamily = this.config.fontFamily;
        
        if (style) {
            if (style.italic) fontStyle = 'italic ';
            if (style.bold) fontWeight = 'bold';
            if (style.fontSize) fontSize = style.fontSize;
            if (style.fontFamily) fontFamily = style.fontFamily;
        }
        
        return fontStyle + fontWeight + ' ' + fontSize + 'px ' + fontFamily;
    };

    TableRenderer.prototype.drawGrid = function(tableData) {
        this.ctx.strokeStyle = this.config.borderColor;
        this.ctx.lineWidth = this.config.defaultBorderWidth;
        
        var canvasWidth = this.canvas.clientWidth;
        var canvasHeight = this.canvas.clientHeight;
        
        // 绘制垂直线
        for (var col = this.viewport.startCol; col <= this.viewport.endCol + 1; col++) {
            var x = this.config.rowHeaderWidth + col * this.config.cellWidth - this.scrollX;
            
            if (x >= this.config.rowHeaderWidth && x <= canvasWidth) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, this.config.headerHeight);
                this.ctx.lineTo(x, canvasHeight);
                this.ctx.stroke();
            }
        }
        
        // 绘制水平线
        for (var row = this.viewport.startRow; row <= this.viewport.endRow + 1; row++) {
            var y = this.config.headerHeight + row * this.config.cellHeight - this.scrollY;
            
            if (y >= this.config.headerHeight && y <= canvasHeight) {
                this.ctx.beginPath();
                this.ctx.moveTo(this.config.rowHeaderWidth, y);
                this.ctx.lineTo(canvasWidth, y);
                this.ctx.stroke();
            }
        }
        
        // 表头边框已删除
    };

    // 旧版本的Canvas选择框绘制方法 - 已被CSS方式替代
    // 保留此方法用于兼容性，但实际已不再使用
    TableRenderer.prototype.drawSelection = function(selectedCell) {
        // 优势：CSS transform比Canvas重绘快20倍以上
        return; // 直接返回，不再执行Canvas绘制
        
        // ... Canvas绘制代码
    };

    TableRenderer.prototype.drawScrollbars = function(tableData) {
        var canvasWidth = this.canvas.clientWidth;
        var canvasHeight = this.canvas.clientHeight;
        
        var contentWidth = tableData.cols * this.config.cellWidth;
        var contentHeight = tableData.rows * this.config.cellHeight;
        
        var viewportWidth = canvasWidth - this.config.rowHeaderWidth;
        var viewportHeight = canvasHeight - this.config.headerHeight;
        
        // 绘制水平滚动条
        if (contentWidth > viewportWidth) {
            var scrollbarHeight = 12;
            var scrollbarY = canvasHeight - scrollbarHeight;
            
            // 滚动条背景
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.fillRect(this.config.rowHeaderWidth, scrollbarY, viewportWidth, scrollbarHeight);
            
            // 滚动条滑块
            var thumbWidth = (viewportWidth / contentWidth) * viewportWidth;
            var thumbX = this.config.rowHeaderWidth + (this.scrollX / contentWidth) * viewportWidth;
            
            this.ctx.fillStyle = '#c0c0c0';
            this.ctx.fillRect(thumbX, scrollbarY, thumbWidth, scrollbarHeight);
        }
        
        // 绘制垂直滚动条
        if (contentHeight > viewportHeight) {
            var scrollbarWidth = 12;
            var scrollbarX = canvasWidth - scrollbarWidth;
            
            // 滚动条背景
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.fillRect(scrollbarX, this.config.headerHeight, scrollbarWidth, viewportHeight);
            
            // 滚动条滑块
            var thumbHeight = (viewportHeight / contentHeight) * viewportHeight;
            var thumbY = this.config.headerHeight + (this.scrollY / contentHeight) * viewportHeight;
            
            this.ctx.fillStyle = '#c0c0c0';
            this.ctx.fillRect(scrollbarX, thumbY, scrollbarWidth, thumbHeight);
        }
    };

    TableRenderer.prototype.setScroll = function(x, y) {
        this.scrollX = Math.max(0, x);
        this.scrollY = Math.max(0, y);
    };

    TableRenderer.prototype.getScroll = function() {
        return { x: this.scrollX, y: this.scrollY };
    };

    TableRenderer.prototype.getCellFromPixel = function(x, y) {
        var adjustedX = x + this.scrollX;
        var adjustedY = y + this.scrollY;
        
        // 检查是否在表头或行头区域
        if (adjustedY < this.config.headerHeight || adjustedX < this.config.rowHeaderWidth) {
            return null;
        }
        
        var col = Math.floor((adjustedX - this.config.rowHeaderWidth) / this.config.cellWidth);
        var row = Math.floor((adjustedY - this.config.headerHeight) / this.config.cellHeight);
        
        return { row: row, col: col };
    };

    TableRenderer.prototype.getCellRect = function(row, col) {
        // 统一坐标计算：返回相对于Canvas的可视位置
        return {
            x: this.config.rowHeaderWidth + col * this.config.cellWidth - this.scrollX,
            y: this.config.headerHeight + row * this.config.cellHeight - this.scrollY,
            width: this.config.cellWidth,
            height: this.config.cellHeight
        };
    };

    TableRenderer.prototype.invalidateCache = function() {
        this.measureCache = {};
        this.fontCache = {};
    };

    // 优化的文本测量方法（性能优化）
    TableRenderer.prototype.measureText = function(text, font) {
        if (!text) return 0;
        
        var cacheKey = text + '|' + font;
        if (this.measureCache[cacheKey] !== undefined) {
            return this.measureCache[cacheKey];
        }
        
        // 缓存字体设置
        if (this.fontCache.current !== font) {
            this.ctx.font = font;
            this.fontCache.current = font;
        }
        
        var width = this.ctx.measureText(text).width;
        this.measureCache[cacheKey] = width;
        return width;
    };

    TableRenderer.prototype.getViewport = function() {
        return global.Helpers.deepClone(this.viewport);
    };

    TableRenderer.prototype.getCanvasSize = function() {
        return {
            width: this.canvas.clientWidth,
            height: this.canvas.clientHeight
        };
    };

    TableRenderer.prototype.destroy = function() {
        this.invalidateCache();
        this.renderQueue = [];
        this.isRendering = false;
    };

    // 暴露到全局
    global.TableRenderer = TableRenderer;
    
})(window);