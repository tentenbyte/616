/**
 * 滚动条组件 - ES5版本
 * 
 * 功能职责：
 * - 独立的滚动条控制组件
 * - 支持水平和垂直滚动
 * - 处理鼠标拖拽、点击和滚轮事件
 * - 提供流畅的滚动动画
 * - 与Canvas表格集成
 * 
 * 兼容性：Firefox 52+ (ES5语法)
 */
(function(global) {
    'use strict';

    /**
     * ScrollbarWidget - 滚动条控件
     * @param {HTMLCanvasElement} canvas Canvas元素
     * @param {Object} config 配置对象
     * @param {Object} dependencies 依赖注入
     */
    function ScrollbarWidget(canvas, config, dependencies) {
        // 基本配置
        this.canvas = canvas;
        this.config = config;
        this.dependencies = dependencies || {};
        
        // 依赖注入
        this.eventManager = dependencies.eventManager || global.globalEventManager;
        this.renderer = dependencies.renderer; // 可能为null，稍后通过dependencies设置
        
        // 滚动条配置
        this.scrollbarConfig = {
            thickness: 12,           // 滚动条厚度
            trackColor: '#f0f0f0',   // 轨道颜色
            thumbColor: '#c0c0c0',   // 滑块颜色
            thumbHoverColor: '#a0a0a0', // 滑块悬停颜色
            thumbActiveColor: '#808080', // 滑块拖拽颜色
            borderRadius: 6,         // 圆角半径
            minThumbSize: 50,        // 增加最小滑块大小，提供更高拖拽精度
            padding: 2               // 滑块内边距
        };
        
        // 状态管理
        this.state = {
            // 水平滚动条
            horizontal: {
                visible: false,
                position: 0,        // 滚动位置 (0-1)
                thumbRect: null,    // 滑块矩形区域
                trackRect: null,    // 轨道矩形区域
                isDragging: false,  // 是否正在拖拽
                isHover: false,     // 是否悬停
                dragOffset: 0       // 拖拽偏移量
            },
            // 垂直滚动条
            vertical: {
                visible: false,
                position: 0,
                thumbRect: null,
                trackRect: null,
                isDragging: false,
                isHover: false,
                dragOffset: 0
            }
        };
        
        // 内容尺寸信息
        this.contentSize = {
            width: 0,
            height: 0,
            viewportWidth: 0,
            viewportHeight: 0
        };
        
        // 性能优化
        this.renderScheduled = false;
        this.scrollbarRenderScheduled = false;
        this.lastMouseMoveTime = 0;
        
        // 初始化
        this.initialize();
    }

    // ========================================
    // 初始化
    // ========================================
    
    /**
     * 初始化滚动条控件
     */
    ScrollbarWidget.prototype.initialize = function() {
        this.bindEvents();
        this.updateScrollbars();
    };
    
    /**
     * 绑定事件
     */
    ScrollbarWidget.prototype.bindEvents = function() {
        var self = this;
        
        // 鼠标事件
        this.canvas.addEventListener('mousedown', function(e) {
            self.handleMouseDown(e);
        });
        
        this.canvas.addEventListener('mousemove', function(e) {
            // 拖拽时使用更高频率，悬停时使用节流
            var isDragging = self.state.horizontal.isDragging || self.state.vertical.isDragging;
            var now = performance.now();
            var throttleTime = isDragging ? 4 : 16; // 拖拽时250fps，悬停时60fps，提供更高的精度
            
            if (now - self.lastMouseMoveTime > throttleTime) {
                self.handleMouseMove(e);
                self.lastMouseMoveTime = now;
            }
        });
        
        this.canvas.addEventListener('mouseup', function(e) {
            self.handleMouseUp(e);
        });
        
        this.canvas.addEventListener('mouseleave', function(e) {
            self.handleMouseLeave(e);
        });
        
        // 滚轮事件
        this.canvas.addEventListener('wheel', function(e) {
            self.handleWheel(e);
        });
        
        // 监听表格重绘事件，更新滚动条
        this.eventManager.on(global.EVENTS.TABLE_REDRAWN, function(data) {
            self.updateContentSize();
            self.updateScrollbars();
        });
        
        // 监听渲染器引用更新
        this.updateRenderer = function() {
            if (!self.renderer && self.dependencies.renderer) {
                self.renderer = self.dependencies.renderer;
            }
        };
    };

    // ========================================
    // 核心功能
    // ========================================
    
    /**
     * 获取有效列数（有数据的列数）
     */
    ScrollbarWidget.prototype.getEffectiveColumnCount = function(db) {
        if (!db) return 8; // 默认8列
        
        // 检查每一列是否有数据
        var maxCol = 0;
        var checkRows = Math.min(db.currentRows || 0, 20); // 只检查前20行以提高性能
        
        for (var row = 0; row < checkRows; row++) {
            for (var col = 0; col < Math.min(db.maxCols || 26, 15); col++) { // 最多检查15列
                var value = null;
                
                try {
                    if (db.getValue) {
                        value = db.getValue(row, col);
                    } else if (db.columns && db.columns[col] && db.columns[col][row] !== undefined) {
                        value = db.decode ? db.decode(db.columns[col][row], col) : db.columns[col][row];
                    }
                    
                    if (value !== null && value !== undefined && value !== '') {
                        maxCol = Math.max(maxCol, col);
                    }
                } catch (e) {
                    // 忽略错误，继续检查下一列
                }
            }
        }
        
        // 至少返回8列，最多返回实际的最大列数+1
        var effectiveCount = Math.max(8, maxCol + 1);
        // console.log('有效列数计算:', { maxCol: maxCol, effectiveCount: effectiveCount, checkRows: checkRows });
        return effectiveCount;
    };
    
    /**
     * 更新内容尺寸
     */
    ScrollbarWidget.prototype.updateContentSize = function() {
        // 确保有渲染器引用
        this.updateRenderer();
        
        if (!this.renderer || !this.renderer.tableCore) return;
        
        var tableCore = this.renderer.tableCore;
        var db = tableCore.db;
        
        if (!db) return;
        
        // 计算内容总尺寸 - 修复：使用实际有效列数而不是最大列数
        var effectiveCols = this.getEffectiveColumnCount(db);
        this.contentSize.width = effectiveCols * this.config.cellWidth;
        this.contentSize.height = db.currentRows * this.config.cellHeight;
        
        // 计算视口尺寸
        this.contentSize.viewportWidth = this.canvas.width - this.config.rowHeaderWidth;
        this.contentSize.viewportHeight = this.canvas.height - this.config.headerHeight;
        
        // 确定滚动条可见性
        this.state.horizontal.visible = this.contentSize.width > this.contentSize.viewportWidth;
        this.state.vertical.visible = this.contentSize.height > this.contentSize.viewportHeight;
        
        // 调试信息（可选开启）
        if (false) { // 关闭调试
            console.log('滚动条尺寸调试:', {
                effectiveCols: effectiveCols,
                maxCols: db.maxCols,
                contentWidth: this.contentSize.width,
                contentHeight: this.contentSize.height,
                viewportWidth: this.contentSize.viewportWidth,
                viewportHeight: this.contentSize.viewportHeight,
                horizontalVisible: this.state.horizontal.visible,
                verticalVisible: this.state.vertical.visible,
                currentRows: db.currentRows,
                cellWidth: this.config.cellWidth,
                cellHeight: this.config.cellHeight
            });
        }
    };
    
    /**
     * 更新滚动条位置和尺寸
     */
    ScrollbarWidget.prototype.updateScrollbars = function() {
        this.updateContentSize();
        this.calculateScrollbarRects();
        this.updateScrollPositions();
    };
    
    /**
     * 计算滚动条矩形区域
     */
    ScrollbarWidget.prototype.calculateScrollbarRects = function() {
        var canvasWidth = this.canvas.width;
        var canvasHeight = this.canvas.height;
        var thickness = this.scrollbarConfig.thickness;
        
        // 水平滚动条 - 修复：让滑块从Canvas左边缘开始，覆盖整个宽度包括行号头部
        if (this.state.horizontal.visible) {
            var trackWidth = canvasWidth; // 使用整个Canvas宽度，不减去行号头部宽度
            var trackX = 0; // 从Canvas左边缘开始
            var trackY = canvasHeight - thickness;
            
            this.state.horizontal.trackRect = {
                x: trackX,
                y: trackY,
                width: trackWidth,
                height: thickness
            };
            
            // 计算滑块尺寸和位置 - 修复：考虑行号头部偏移
            var contentRatio = this.contentSize.viewportWidth / this.contentSize.width;
            var thumbWidth = Math.max(
                this.scrollbarConfig.minThumbSize,
                contentRatio * trackWidth
            );
            
            // 滑块可移动区域：从行号头部右边缘开始到Canvas右边缘
            var scrollableTrackX = this.config.rowHeaderWidth;
            var scrollableTrackWidth = trackWidth - this.config.rowHeaderWidth;
            var maxThumbX = scrollableTrackWidth - thumbWidth;
            var thumbX = scrollableTrackX + this.state.horizontal.position * maxThumbX;
            
            this.state.horizontal.thumbRect = {
                x: thumbX,
                y: trackY + this.scrollbarConfig.padding,
                width: thumbWidth,
                height: thickness - 2 * this.scrollbarConfig.padding
            };
        }
        
        // 垂直滚动条
        if (this.state.vertical.visible) {
            var trackHeight = this.contentSize.viewportHeight;
            var trackX = canvasWidth - thickness;
            var trackY = this.config.headerHeight;
            
            this.state.vertical.trackRect = {
                x: trackX,
                y: trackY,
                width: thickness,
                height: trackHeight
            };
            
            // 计算滑块尺寸和位置
            var thumbHeight = Math.max(
                this.scrollbarConfig.minThumbSize,
                (this.contentSize.viewportHeight / this.contentSize.height) * trackHeight
            );
            var maxThumbY = trackHeight - thumbHeight;
            var thumbY = trackY + this.state.vertical.position * maxThumbY;
            
            this.state.vertical.thumbRect = {
                x: trackX + this.scrollbarConfig.padding,
                y: thumbY,
                width: thickness - 2 * this.scrollbarConfig.padding,
                height: thumbHeight
            };
        }
    };
    
    /**
     * 更新滚动位置（从渲染器同步）
     */
    ScrollbarWidget.prototype.updateScrollPositions = function() {
        if (!this.renderer) return;
        
        var scroll = this.renderer.getScroll();
        
        // 更新水平滚动位置
        if (this.state.horizontal.visible && this.contentSize.width > this.contentSize.viewportWidth) {
            var maxScrollX = this.contentSize.width - this.contentSize.viewportWidth;
            this.state.horizontal.position = Math.max(0, Math.min(1, scroll.x / maxScrollX));
        }
        
        // 更新垂直滚动位置
        if (this.state.vertical.visible && this.contentSize.height > this.contentSize.viewportHeight) {
            var maxScrollY = this.contentSize.height - this.contentSize.viewportHeight;
            this.state.vertical.position = Math.max(0, Math.min(1, scroll.y / maxScrollY));
        }
    };

    // ========================================
    // 事件处理
    // ========================================
    
    /**
     * 处理鼠标按下事件
     */
    ScrollbarWidget.prototype.handleMouseDown = function(e) {
        var x = e.offsetX;
        var y = e.offsetY;
        
        // 检查水平滚动条 - 修复：确保只在有效滚动区域响应
        if (this.state.horizontal.visible) {
            if (this.isPointInRect(x, y, this.state.horizontal.thumbRect)) {
                this.startDrag('horizontal', x);
                e.preventDefault();
                return;
            } else if (this.isPointInRect(x, y, this.state.horizontal.trackRect) && 
                      x >= this.config.rowHeaderWidth) { // 只在行号头部右侧响应轨道点击
                this.jumpToPosition('horizontal', x);
                e.preventDefault();
                return;
            }
        }
        
        // 检查垂直滚动条
        if (this.state.vertical.visible) {
            if (this.isPointInRect(x, y, this.state.vertical.thumbRect)) {
                this.startDrag('vertical', y);
                e.preventDefault();
                return;
            } else if (this.isPointInRect(x, y, this.state.vertical.trackRect)) {
                this.jumpToPosition('vertical', y);
                e.preventDefault();
                return;
            }
        }
    };
    
    /**
     * 处理鼠标移动事件
     */
    ScrollbarWidget.prototype.handleMouseMove = function(e) {
        var x = e.offsetX;
        var y = e.offsetY;
        
        // 处理拖拽（最高优先级，立即响应）
        if (this.state.horizontal.isDragging) {
            this.updateDrag('horizontal', x);
            return;
        }
        
        if (this.state.vertical.isDragging) {
            this.updateDrag('vertical', y);
            return;
        }
        
        // 处理悬停效果（非拖拽状态）
        this.updateHoverState(x, y);
    };
    
    /**
     * 处理鼠标释放事件
     */
    ScrollbarWidget.prototype.handleMouseUp = function(e) {
        this.endDrag();
    };
    
    /**
     * 处理鼠标离开事件
     */
    ScrollbarWidget.prototype.handleMouseLeave = function(e) {
        this.endDrag();
        this.clearHoverState();
    };
    
    /**
     * 处理滚轮事件
     */
    ScrollbarWidget.prototype.handleWheel = function(e) {
        var deltaX = e.deltaX;
        var deltaY = e.deltaY;
        
        // 滚动速度调整
        var scrollSpeed = 3;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 水平滚动
            if (this.state.horizontal.visible) {
                this.scrollBy('horizontal', deltaX * scrollSpeed);
                e.preventDefault();
            }
        } else {
            // 垂直滚动
            if (this.state.vertical.visible) {
                this.scrollBy('vertical', deltaY * scrollSpeed);
                e.preventDefault();
            }
        }
    };

    // ========================================
    // 拖拽控制
    // ========================================
    
    /**
     * 开始拖拽
     */
    ScrollbarWidget.prototype.startDrag = function(direction, coordinate) {
        var state = this.state[direction];
        var thumbRect = state.thumbRect;
        
        state.isDragging = true;
        
        if (direction === 'horizontal') {
            state.dragOffset = coordinate - thumbRect.x;
        } else {
            state.dragOffset = coordinate - thumbRect.y;
        }
        
        // 添加全局鼠标事件监听
        this.addGlobalMouseListeners();
        
        // 更新样式
        this.updateCursor(direction);
    };
    
    /**
     * 更新拖拽（跳跃式滚动 - 按行列对齐）
     */
    ScrollbarWidget.prototype.updateDrag = function(direction, coordinate) {
        var state = this.state[direction];
        var trackRect = state.trackRect;
        var thumbRect = state.thumbRect;
        
        if (!state.isDragging) return;
        
        var newPosition;
        
        if (direction === 'horizontal') {
            var thumbX = coordinate - state.dragOffset;
            // 使用可滚动区域的范围：从行号头部右侧开始
            var scrollableTrackX = this.config.rowHeaderWidth;
            var scrollableTrackWidth = trackRect.width - this.config.rowHeaderWidth;
            var maxThumbX = scrollableTrackWidth - thumbRect.width;
            var relativeX = Math.max(0, Math.min(maxThumbX, thumbX - scrollableTrackX));
            var rawPosition = maxThumbX > 0 ? relativeX / maxThumbX : 0;
            
            // 按列对齐 - 计算应该滚动到哪一列
            var maxScrollX = this.contentSize.width - this.contentSize.viewportWidth;
            var targetScrollX = rawPosition * maxScrollX;
            var targetCol = Math.round(targetScrollX / this.config.cellWidth);
            var alignedScrollX = targetCol * this.config.cellWidth;
            newPosition = maxScrollX > 0 ? alignedScrollX / maxScrollX : 0;
            
        } else {
            var thumbY = coordinate - state.dragOffset;
            var maxThumbY = trackRect.height - thumbRect.height;
            var relativeY = Math.max(0, Math.min(maxThumbY, thumbY - trackRect.y));
            var rawPosition = maxThumbY > 0 ? relativeY / maxThumbY : 0;
            
            // 按行对齐 - 计算应该滚动到哪一行
            var maxScrollY = this.contentSize.height - this.contentSize.viewportHeight;
            var targetScrollY = rawPosition * maxScrollY;
            var targetRow = Math.round(targetScrollY / this.config.cellHeight);
            var alignedScrollY = targetRow * this.config.cellHeight;
            newPosition = maxScrollY > 0 ? alignedScrollY / maxScrollY : 0;
        }
        
        // 实时更新滚动位置
        this.setScrollPositionImmediate(direction, newPosition);
    };
    
    /**
     * 结束拖拽
     */
    ScrollbarWidget.prototype.endDrag = function() {
        this.state.horizontal.isDragging = false;
        this.state.vertical.isDragging = false;
        
        // 移除全局鼠标事件监听
        this.removeGlobalMouseListeners();
        
        // 恢复默认鼠标样式
        this.canvas.style.cursor = 'default';
    };

    // ========================================
    // 滚动控制
    // ========================================
    
    /**
     * 跳转到指定位置（跳跃式 - 按行列对齐）
     */
    ScrollbarWidget.prototype.jumpToPosition = function(direction, coordinate) {
        var state = this.state[direction];
        var trackRect = state.trackRect;
        var thumbRect = state.thumbRect;
        
        var newPosition;
        
        if (direction === 'horizontal') {
            // 调整为可滚动区域的坐标系
            var scrollableTrackX = this.config.rowHeaderWidth;
            var scrollableTrackWidth = trackRect.width - this.config.rowHeaderWidth;
            var clickX = coordinate - scrollableTrackX;
            var thumbCenterX = clickX - thumbRect.width / 2;
            var maxThumbX = scrollableTrackWidth - thumbRect.width;
            var rawPosition = maxThumbX > 0 ? Math.max(0, Math.min(1, thumbCenterX / maxThumbX)) : 0;
            
            // 按列对齐
            var maxScrollX = this.contentSize.width - this.contentSize.viewportWidth;
            var targetScrollX = rawPosition * maxScrollX;
            var targetCol = Math.round(targetScrollX / this.config.cellWidth);
            var alignedScrollX = targetCol * this.config.cellWidth;
            newPosition = maxScrollX > 0 ? alignedScrollX / maxScrollX : 0;
            
        } else {
            var clickY = coordinate - trackRect.y;
            var thumbCenterY = clickY - thumbRect.height / 2;
            var maxThumbY = trackRect.height - thumbRect.height;
            var rawPosition = maxThumbY > 0 ? Math.max(0, Math.min(1, thumbCenterY / maxThumbY)) : 0;
            
            // 按行对齐
            var maxScrollY = this.contentSize.height - this.contentSize.viewportHeight;
            var targetScrollY = rawPosition * maxScrollY;
            var targetRow = Math.round(targetScrollY / this.config.cellHeight);
            var alignedScrollY = targetRow * this.config.cellHeight;
            newPosition = maxScrollY > 0 ? alignedScrollY / maxScrollY : 0;
        }
        
        this.setScrollPosition(direction, newPosition);
    };
    
    /**
     * 相对滚动（跳跃式 - 按行列对齐）
     */
    ScrollbarWidget.prototype.scrollBy = function(direction, delta) {
        var state = this.state[direction];
        
        if (!state.visible) return;
        
        // 计算当前行/列位置
        var currentScroll = this.renderer.getScroll();
        var currentPixels, cellSize, maxScroll;
        
        if (direction === 'horizontal') {
            currentPixels = currentScroll.x;
            cellSize = this.config.cellWidth;
            maxScroll = this.contentSize.width - this.contentSize.viewportWidth;
        } else {
            currentPixels = currentScroll.y;
            cellSize = this.config.cellHeight;
            maxScroll = this.contentSize.height - this.contentSize.viewportHeight;
        }
        
        // 计算当前单元格索引
        var currentIndex = Math.round(currentPixels / cellSize);
        
        // 根据滚动方向决定跳跃方向
        var indexDelta = delta > 0 ? 1 : -1;
        var newIndex = Math.max(0, currentIndex + indexDelta);
        
        // 对齐到新的单元格边界
        var newPixels = Math.min(newIndex * cellSize, maxScroll);
        var newPosition = maxScroll > 0 ? newPixels / maxScroll : 0;
        
        this.setScrollPosition(direction, newPosition);
    };
    
    /**
     * 设置滚动位置
     */
    ScrollbarWidget.prototype.setScrollPosition = function(direction, position) {
        var state = this.state[direction];
        state.position = Math.max(0, Math.min(1, position));
        
        // 计算实际滚动像素值
        var scrollPixels;
        if (direction === 'horizontal') {
            scrollPixels = state.position * (this.contentSize.width - this.contentSize.viewportWidth);
        } else {
            scrollPixels = state.position * (this.contentSize.height - this.contentSize.viewportHeight);
        }
        
        // 更新渲染器滚动位置
        if (this.renderer) {
            var currentScroll = this.renderer.getScroll();
            if (direction === 'horizontal') {
                this.renderer.setScroll(scrollPixels, currentScroll.y);
            } else {
                this.renderer.setScroll(currentScroll.x, scrollPixels);
            }
            
            // 节流渲染调用
            this.scheduleRender();
        }
        
        // 更新滚动条矩形
        this.calculateScrollbarRects();
        
        // 发出滚动事件
        this.eventManager.emit(global.EVENTS.TABLE_SCROLLED, {
            direction: direction,
            position: position,
            scrollPixels: scrollPixels
        });
    };
    
    /**
     * 立即设置滚动位置（用于实时拖拽）
     */
    ScrollbarWidget.prototype.setScrollPositionImmediate = function(direction, position) {
        var state = this.state[direction];
        var oldPosition = state.position;
        
        // 避免无意义的微小更新 - 降低阈值以提供更高精度
        if (Math.abs(position - oldPosition) < 0.00001) {
            return;
        }
        
        state.position = Math.max(0, Math.min(1, position));
        
        // 计算实际滚动像素值
        var scrollPixels;
        if (direction === 'horizontal') {
            scrollPixels = state.position * (this.contentSize.width - this.contentSize.viewportWidth);
        } else {
            scrollPixels = state.position * (this.contentSize.height - this.contentSize.viewportHeight);
        }
        
        // 立即更新渲染器滚动位置
        if (this.renderer) {
            var currentScroll = this.renderer.getScroll();
            if (direction === 'horizontal') {
                this.renderer.setScroll(scrollPixels, currentScroll.y);
            } else {
                this.renderer.setScroll(currentScroll.x, scrollPixels);
            }
            
            // 调试信息（可选开启）
            if (false) { // 关闭调试
                console.log('垂直滚动调试:', {
                    position: position.toFixed(6),
                    scrollPixels: scrollPixels.toFixed(2),
                    pixelChange: (scrollPixels - (this.renderer.getScroll().y || 0)).toFixed(2),
                    maxScrollPixels: this.contentSize.height - this.contentSize.viewportHeight,
                    contentHeight: this.contentSize.height,
                    viewportHeight: this.contentSize.viewportHeight,
                    actualScroll: this.renderer.getScroll().y,
                    cellHeight: this.config.cellHeight
                });
            }
            
            // 立即渲染，不等待节流
            this.renderImmediately();
        }
        
        // 更新滚动条矩形位置
        this.calculateScrollbarRects();
        
        // 发出滚动事件
        this.eventManager.emit(global.EVENTS.TABLE_SCROLLED, {
            direction: direction,
            position: position,
            scrollPixels: scrollPixels,
            immediate: true
        });
    };

    // ========================================
    // 状态管理
    // ========================================
    
    /**
     * 更新悬停状态
     */
    ScrollbarWidget.prototype.updateHoverState = function(x, y) {
        var horizontalHover = this.state.horizontal.visible && 
                             this.isPointInRect(x, y, this.state.horizontal.thumbRect);
        var verticalHover = this.state.vertical.visible && 
                           this.isPointInRect(x, y, this.state.vertical.thumbRect);
        
        var changed = false;
        
        if (this.state.horizontal.isHover !== horizontalHover) {
            this.state.horizontal.isHover = horizontalHover;
            changed = true;
        }
        
        if (this.state.vertical.isHover !== verticalHover) {
            this.state.vertical.isHover = verticalHover;
            changed = true;
        }
        
        if (changed) {
            this.updateCursor(horizontalHover ? 'horizontal' : verticalHover ? 'vertical' : null);
            // 仅在悬停状态变化时重绘滚动条区域，不重绘整个表格
            this.scheduleScrollbarRender();
        }
    };
    
    /**
     * 清除悬停状态
     */
    ScrollbarWidget.prototype.clearHoverState = function() {
        this.state.horizontal.isHover = false;
        this.state.vertical.isHover = false;
        this.canvas.style.cursor = 'default';
    };
    
    /**
     * 更新鼠标样式
     */
    ScrollbarWidget.prototype.updateCursor = function(direction) {
        if (direction) {
            this.canvas.style.cursor = 'pointer';
        } else {
            this.canvas.style.cursor = 'default';
        }
    };

    // ========================================
    // 渲染
    // ========================================
    
    /**
     * 绘制滚动条
     */
    ScrollbarWidget.prototype.render = function(ctx) {
        this.updateScrollbars();
        
        // 绘制水平滚动条
        if (this.state.horizontal.visible) {
            this.renderScrollbar(ctx, 'horizontal');
        }
        
        // 绘制垂直滚动条
        if (this.state.vertical.visible) {
            this.renderScrollbar(ctx, 'vertical');
        }
    };
    
    /**
     * 渲染单个滚动条
     */
    ScrollbarWidget.prototype.renderScrollbar = function(ctx, direction) {
        var state = this.state[direction];
        var trackRect = state.trackRect;
        var thumbRect = state.thumbRect;
        var config = this.scrollbarConfig;
        
        if (!trackRect || !thumbRect) return;
        
        // 保存上下文
        ctx.save();
        
        // 绘制轨道
        ctx.fillStyle = config.trackColor;
        this.fillRoundedRect(ctx, trackRect.x, trackRect.y, trackRect.width, trackRect.height, config.borderRadius);
        
        // 确定滑块颜色
        var thumbColor = config.thumbColor;
        if (state.isDragging) {
            thumbColor = config.thumbActiveColor;
        } else if (state.isHover) {
            thumbColor = config.thumbHoverColor;
        }
        
        // 绘制滑块
        ctx.fillStyle = thumbColor;
        this.fillRoundedRect(ctx, thumbRect.x, thumbRect.y, thumbRect.width, thumbRect.height, config.borderRadius);
        
        // 恢复上下文
        ctx.restore();
    };
    
    /**
     * 绘制圆角矩形（Firefox 52兼容版本）
     */
    ScrollbarWidget.prototype.fillRoundedRect = function(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
    };

    // ========================================
    // 工具方法
    // ========================================
    
    /**
     * 检查点是否在矩形内
     */
    ScrollbarWidget.prototype.isPointInRect = function(x, y, rect) {
        if (!rect) return false;
        return x >= rect.x && x <= rect.x + rect.width &&
               y >= rect.y && y <= rect.y + rect.height;
    };
    
    /**
     * 添加全局鼠标事件监听
     */
    ScrollbarWidget.prototype.addGlobalMouseListeners = function() {
        var self = this;
        
        this.globalMouseMove = function(e) {
            var rect = self.canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            
            // 拖拽时立即响应，不使用节流
            self.handleMouseMove({ offsetX: x, offsetY: y });
        };
        
        this.globalMouseUp = function(e) {
            self.handleMouseUp(e);
        };
        
        document.addEventListener('mousemove', this.globalMouseMove);
        document.addEventListener('mouseup', this.globalMouseUp);
    };
    
    /**
     * 移除全局鼠标事件监听
     */
    ScrollbarWidget.prototype.removeGlobalMouseListeners = function() {
        if (this.globalMouseMove) {
            document.removeEventListener('mousemove', this.globalMouseMove);
            this.globalMouseMove = null;
        }
        
        if (this.globalMouseUp) {
            document.removeEventListener('mouseup', this.globalMouseUp);
            this.globalMouseUp = null;
        }
    };

    // ========================================
    // 性能优化
    // ========================================
    
    /**
     * 节流渲染调用
     */
    ScrollbarWidget.prototype.scheduleRender = function() {
        var self = this;
        
        if (this.renderScheduled) return;
        
        this.renderScheduled = true;
        requestAnimationFrame(function() {
            if (self.renderer && self.renderer.render) {
                self.renderer.render();
            }
            self.renderScheduled = false;
        });
    };
    
    /**
     * 仅重绘滚动条（性能优化）
     */
    ScrollbarWidget.prototype.scheduleScrollbarRender = function() {
        var self = this;
        
        if (this.scrollbarRenderScheduled) return;
        
        this.scrollbarRenderScheduled = true;
        requestAnimationFrame(function() {
            if (self.renderer && self.renderer.ctx) {
                // 仅重绘滚动条区域
                self.render(self.renderer.ctx);
            }
            self.scrollbarRenderScheduled = false;
        });
    };
    
    /**
     * 立即渲染（用于实时拖拽响应）
     */
    ScrollbarWidget.prototype.renderImmediately = function() {
        if (this.renderer) {
            // 取消之前调度的渲染
            this.renderScheduled = false;
            this.scrollbarRenderScheduled = false;
            
            // 使用非节流的立即渲染
            if (this.renderer.renderImmediate && this.renderer.tableCore) {
                var tableData = this.renderer.tableCore.db;
                var selectedCell = this.renderer.tableCore.state ? this.renderer.tableCore.state.selectedCell : null;
                this.renderer.renderImmediate(tableData, selectedCell);
            } else if (this.renderer.render) {
                // 回退到普通渲染
                this.renderer.render();
            }
        }
    };

    // ========================================
    // 公共API
    // ========================================
    
    /**
     * 获取滚动位置
     */
    ScrollbarWidget.prototype.getScrollPosition = function() {
        return {
            horizontal: this.state.horizontal.position,
            vertical: this.state.vertical.position
        };
    };
    
    /**
     * 获取滚动条可见性
     */
    ScrollbarWidget.prototype.getScrollbarVisibility = function() {
        return {
            horizontal: this.state.horizontal.visible,
            vertical: this.state.vertical.visible
        };
    };
    
    /**
     * 强制更新滚动条
     */
    ScrollbarWidget.prototype.forceUpdate = function() {
        this.updateScrollbars();
    };
    
    /**
     * 直接设置滚动位置（非跳跃式，用于智能滚动）
     */
    ScrollbarWidget.prototype.setScrollPositionDirect = function(scrollX, scrollY) {
        if (!this.renderer) return;
        
        // 直接设置渲染器滚动位置
        this.renderer.setScroll(scrollX, scrollY);
        
        // 更新滚动条内部状态
        if (this.state.horizontal.visible && this.contentSize.width > this.contentSize.viewportWidth) {
            var maxScrollX = this.contentSize.width - this.contentSize.viewportWidth;
            this.state.horizontal.position = Math.max(0, Math.min(1, scrollX / maxScrollX));
        }
        
        if (this.state.vertical.visible && this.contentSize.height > this.contentSize.viewportHeight) {
            var maxScrollY = this.contentSize.height - this.contentSize.viewportHeight;
            this.state.vertical.position = Math.max(0, Math.min(1, scrollY / maxScrollY));
        }
        
        // 更新滚动条矩形
        this.calculateScrollbarRects();
        
        // 发出滚动事件
        this.eventManager.emit(global.EVENTS.TABLE_SCROLLED, {
            direction: 'both',
            scrollPixels: { x: scrollX, y: scrollY },
            direct: true
        });
    };
    
    /**
     * 销毁控件
     */
    ScrollbarWidget.prototype.destroy = function() {
        this.removeGlobalMouseListeners();
        this.clearHoverState();
    };

    // 暴露到全局
    global.ScrollbarWidget = ScrollbarWidget;
    
})(window);