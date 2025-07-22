/**
 * 字符串选择器组件 - ES5兼容版本
 * 基于Canvas的下拉列表字符串选择组件
 * Firefox 52兼容
 */
(function(global) {
    'use strict';

    /**
     * 字符串选择器组件
     * @param {string} containerId 容器元素ID
     * @param {Array} options 字符串选项数组
     * @param {function} onStringSelected 字符串选择回调函数
     */
    function StringSelectorWidget(containerId, options, onStringSelected) {
        this.container = document.getElementById(containerId) || document.body;
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'stringSelector';
        this.canvas.tabIndex = 0;
        this.canvas.width = 200;
        this.canvas.height = 280; // 足够显示多个选项
        this.left = 0;
        this.top = 0;
        
        // Canvas样式设置
        this.canvas.style.cssText = 'transition: transform 0.2s ease;' +
                                   'visibility: visible; outline: none;' +
                                   'position: absolute; top: 0;' +
                                   'left: -300px; z-index: 2;' +
                                   'border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);';
        
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // 选项配置
        this.options = options || ['选项1', '选项2', '选项3', '选项4', '选项5'];
        this.selectedIndex = -1; // 当前选中的选项索引
        this.hoveredIndex = -1;  // 当前悬停的选项索引
        this.itemHeight = 32;    // 每个选项的高度
        this.maxVisibleItems = 8; // 最大可见选项数
        this.scrollOffset = 0;   // 滚动偏移量
        
        // 事件绑定
        var self = this;
        this.canvas.addEventListener('click', function(event) {
            self.handleCanvasClick(event);
        });
        this.canvas.addEventListener('mousemove', function(event) {
            self.handleMouseMove(event);
        });
        this.canvas.addEventListener('mouseleave', function() {
            self.handleMouseLeave();
        });
        this.canvas.addEventListener('wheel', function(event) {
            self.handleMouseWheel(event);
        });
        
        this.onStringSelected = onStringSelected; // 保存传入的回调函数
        
        // 计算实际高度
        this.updateCanvasHeight();
        this.drawStringSelector();
    }

    /**
     * 更新Canvas高度
     */
    StringSelectorWidget.prototype.updateCanvasHeight = function() {
        var visibleItems = Math.min(this.options.length, this.maxVisibleItems);
        this.canvas.height = visibleItems * this.itemHeight + 16; // 16px padding
    };

    /**
     * 设置选项列表
     */
    StringSelectorWidget.prototype.setOptions = function(options) {
        this.options = options || [];
        this.selectedIndex = -1;
        this.hoveredIndex = -1;
        this.scrollOffset = 0;
        this.updateCanvasHeight();
        this.drawStringSelector();
    };

    /**
     * 设置当前选中值
     */
    StringSelectorWidget.prototype.setSelectedValue = function(value) {
        this.selectedIndex = this.options.indexOf(value);
        this.drawStringSelector();
    };

    /**
     * 移动字符串选择器到指定位置
     * @param {number} x X坐标
     * @param {number} y Y坐标
     */
    StringSelectorWidget.prototype.moveStringSelector = function(x, y) {
        this.canvas.style.transform = 'translate3D(' + (x + 300) + 'px, ' + y + 'px, 0)';
        this.left = x;
        this.top = y;
    };

    /**
     * 绘制字符串选择器
     */
    StringSelectorWidget.prototype.drawStringSelector = function() {
        // 清空画布，绘制浅灰色背景
        this.ctx.fillStyle = '#F0F0F0';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制边框
        this.ctx.strokeStyle = '#CCC';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
    
        // 绘制选项
        this.ctx.font = '12px Cascadia Code';
        var startIndex = Math.floor(this.scrollOffset / this.itemHeight);
        var endIndex = Math.min(startIndex + this.maxVisibleItems, this.options.length);
        
        for (var i = startIndex; i < endIndex; i++) {
            var y = (i - startIndex) * this.itemHeight + 8;
            var itemRect = {
                x: 4,
                y: y,
                width: this.canvas.width - 8,
                height: this.itemHeight - 2
            };
            
            // 绘制选项背景
            if (i === this.selectedIndex) {
                // 选中状态 - 蓝色背景
                this.ctx.fillStyle = '#4A90E2';
                this.ctx.fillRect(itemRect.x, itemRect.y, itemRect.width, itemRect.height);
            } else if (i === this.hoveredIndex) {
                // 悬停状态 - 更浅的灰色背景
                this.ctx.fillStyle = '#E8E8E8';
                this.ctx.fillRect(itemRect.x, itemRect.y, itemRect.width, itemRect.height);
            }
            
            // 绘制选项文本
            this.ctx.fillStyle = i === this.selectedIndex ? '#FFF' : '#333';
            var text = this.options[i] || '';
            
            // 文本截断处理
            var maxWidth = itemRect.width - 16;
            if (this.ctx.measureText(text).width > maxWidth) {
                while (this.ctx.measureText(text + '...').width > maxWidth && text.length > 0) {
                    text = text.slice(0, -1);
                }
                text += '...';
            }
            
            this.ctx.fillText(text, itemRect.x + 8, itemRect.y + this.itemHeight / 2 + 5);
        }
        
        // 绘制滚动条（如果需要）
        if (this.options.length > this.maxVisibleItems) {
            this.drawScrollBar();
        }
    };

    /**
     * 绘制滚动条
     */
    StringSelectorWidget.prototype.drawScrollBar = function() {
        var scrollBarWidth = 8;
        var scrollBarX = this.canvas.width - scrollBarWidth - 2;
        var scrollBarHeight = this.canvas.height - 16;
        var scrollBarY = 8;
        
        // 滚动条背景
        this.ctx.fillStyle = '#E0E0E0';
        this.ctx.fillRect(scrollBarX, scrollBarY, scrollBarWidth, scrollBarHeight);
        
        // 滚动条滑块
        var thumbHeight = Math.max(20, scrollBarHeight * this.maxVisibleItems / this.options.length);
        var thumbY = scrollBarY + (this.scrollOffset / (this.options.length * this.itemHeight - this.canvas.height)) * (scrollBarHeight - thumbHeight);
        
        this.ctx.fillStyle = '#CCC';
        this.ctx.fillRect(scrollBarX, thumbY, scrollBarWidth, thumbHeight);
    };

    /**
     * 鼠标移动事件处理
     */
    StringSelectorWidget.prototype.handleMouseMove = function(event) {
        // 使用offsetX/offsetY获取相对于Canvas元素的坐标
        var x = event.offsetX;
        var y = event.offsetY;
        var previousHoveredIndex = this.hoveredIndex;
        
        // 计算悬停的选项
        this.hoveredIndex = -1;
        if (x >= 4 && x <= this.canvas.width - 8) {
            var itemIndex = Math.floor((y - 8) / this.itemHeight) + Math.floor(this.scrollOffset / this.itemHeight);
            if (itemIndex >= 0 && itemIndex < this.options.length) {
                this.hoveredIndex = itemIndex;
            }
        }
        
        // 如果悬停状态改变，重新绘制
        if (this.hoveredIndex !== previousHoveredIndex) {
            this.drawStringSelector();
        }
    };

    /**
     * 鼠标离开事件处理
     */
    StringSelectorWidget.prototype.handleMouseLeave = function() {
        this.hoveredIndex = -1;
        this.drawStringSelector();
    };

    /**
     * 鼠标滚轮事件处理
     */
    StringSelectorWidget.prototype.handleMouseWheel = function(event) {
        event.preventDefault();
        
        var delta = event.deltaY > 0 ? 1 : -1;
        var newScrollOffset = this.scrollOffset + delta * this.itemHeight;
        
        // 限制滚动范围
        var maxScroll = Math.max(0, this.options.length * this.itemHeight - this.canvas.height + 16);
        this.scrollOffset = Math.max(0, Math.min(newScrollOffset, maxScroll));
        
        this.drawStringSelector();
    };

    /**
     * Canvas点击事件处理
     */
    StringSelectorWidget.prototype.handleCanvasClick = function(event) {
        // 使用offsetX/offsetY获取相对于Canvas元素的坐标
        var x = event.offsetX;
        var y = event.offsetY;
        
        console.log('字符串选择器点击坐标:', { x: x, y: y });
        
        // 检查点击位置
        if (x >= 4 && x <= this.canvas.width - 8) {
            var itemIndex = Math.floor((y - 8) / this.itemHeight) + Math.floor(this.scrollOffset / this.itemHeight);
            
            if (itemIndex >= 0 && itemIndex < this.options.length) {
                this.selectedIndex = itemIndex;
                this.drawStringSelector();
                
                if (this.onStringSelected) {
                    this.onStringSelected(this.options[itemIndex]);
                }
            }
        }
    };

    /**
     * 获取当前选中的值
     */
    StringSelectorWidget.prototype.getSelectedValue = function() {
        return this.selectedIndex >= 0 ? this.options[this.selectedIndex] : null;
    };

    /**
     * 获取当前选中的索引
     */
    StringSelectorWidget.prototype.getSelectedIndex = function() {
        return this.selectedIndex;
    };

    /**
     * 清除选择
     */
    StringSelectorWidget.prototype.clearSelection = function() {
        this.selectedIndex = -1;
        this.drawStringSelector();
    };

    /**
     * 显示字符串选择器
     */
    StringSelectorWidget.prototype.show = function() {
        this.canvas.style.visibility = 'visible';
        this.drawStringSelector();
    };

    /**
     * 隐藏字符串选择器
     */
    StringSelectorWidget.prototype.hide = function() {
        this.canvas.style.visibility = 'hidden';
    };

    /**
     * 销毁字符串选择器
     */
    StringSelectorWidget.prototype.destroy = function() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    };

    // 暴露到全局
    global.StringSelectorWidget = StringSelectorWidget;
    
})(window);