/**
 * 数字键盘组件 - ES5兼容版本
 * 基于Canvas的高性能数字输入组件
 * Firefox 52兼容
 */
(function(global) {
    'use strict';

    /**
     * 数字键盘组件
     * @param {string} containerId 容器元素ID
     * @param {function} onNumberSelected 数字选择回调函数
     */
    function NumberPadWidget(containerId, onNumberSelected) {
        this.container = document.getElementById(containerId) || document.body;
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'numPad';
        this.canvas.tabIndex = 0;
        this.canvas.width = 160; // 宽度设置为160，避免点击冲突
        this.canvas.height = 160; // 高度设置为160
        this.left = 0;
        this.top = 0;
        this.width = 33;
        
        // Canvas样式设置
        this.canvas.style.cssText = 'transition: transform 0.00s ease;' +
                                   'visibility: visible; outline: none;' +
                                   'position: absolute; top: 0;' +
                                   'left: -300px; z-index: 2;' +
                                   'border-radius: 8px;';
        
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // 数字键盘布局：3x4网格
        this.charMap = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.'];
        
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
        
        this.onNumberSelected = onNumberSelected; // 保存传入的回调函数

        // 使用Uint16Array存储按钮信息，提高性能
        this.buttonInfo = new Uint16Array(this.charMap.length * 4); // 每个按钮4个值
        this.hoveredKeyIndex = -1; // 当前悬停的按钮索引
        
        this.initializeButtonInfo();
        this.initializeKeyCodes();
        this.drawNumberPad();
    }

    /**
     * 初始化按钮位置信息
     */
    NumberPadWidget.prototype.initializeButtonInfo = function() {
        for (var i = 0; i < this.charMap.length; i++) {
            var row = Math.floor(i / 3);
            var col = i % 3;
            var height = 29; // 每个按钮的高度
            var baseIndex = i << 2; // 等同于 i * 4，位运算优化
            
            this.buttonInfo[baseIndex] = 40 + col * this.width;     // x坐标
            this.buttonInfo[baseIndex + 1] = 25 + row * 29;         // y坐标
            this.buttonInfo[baseIndex + 2] = this.width;            // 宽度
            this.buttonInfo[baseIndex + 3] = height;                // 高度
        }
    };

    /**
     * 鼠标离开事件处理
     */
    NumberPadWidget.prototype.handleMouseLeave = function() {
        this.hoveredKeyIndex = -1;
        this.drawNumberPad();
    };

    /**
     * 初始化键码数组
     */
    NumberPadWidget.prototype.initializeKeyCodes = function() {
        this.keyCodes = new Uint8Array([
            '1'.charCodeAt(0), '2'.charCodeAt(0), '3'.charCodeAt(0),
            '4'.charCodeAt(0), '5'.charCodeAt(0), '6'.charCodeAt(0),
            '7'.charCodeAt(0), '8'.charCodeAt(0), '9'.charCodeAt(0),
            'C'.charCodeAt(0), '0'.charCodeAt(0), '.'.charCodeAt(0)
        ]);
    };
    
    /**
     * 移动数字键盘到指定位置
     * @param {number} x X坐标
     * @param {number} y Y坐标
     */
    NumberPadWidget.prototype.moveNumPad = function(x, y) {
        this.canvas.style.transform = 'translate3D(' + (x + 300) + 'px, ' + y + 'px, 0)';
        this.left = x; // 存储实际位置
        this.top = y;
    };

    /**
     * 绘制数字键盘
     */
    NumberPadWidget.prototype.drawNumberPad = function() {
        // 清空画布，绘制浅灰色背景
        this.ctx.fillStyle = '#F0F0F0';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
        // 绘制所有按钮
        for (var i = 0; i < 48; i += 4) {
            var buttonIndex = i >> 2; // 等同于 i / 4，位运算优化
            
            // 设置按钮颜色
            this.ctx.fillStyle = '#7B68DD'; // 浅蓝色按钮
            this.ctx.font = '12px Cascadia Code';
            this.ctx.beginPath();
            
            // 根据是否悬停选择圆形大小
            var radius = buttonIndex === this.hoveredKeyIndex ? 15 : 13;
            this.ctx.arc(this.buttonInfo[i] + 4, this.buttonInfo[i + 1] - 5, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制按钮文字
            this.ctx.fillStyle = '#FFF';
            this.ctx.fillText(this.charMap[buttonIndex], this.buttonInfo[i], this.buttonInfo[i + 1]);
        }
    };

    /**
     * 鼠标移动事件处理
     */
    NumberPadWidget.prototype.handleMouseMove = function(event) {
        // 使用offsetX/offsetY获取相对于Canvas元素的坐标
        var x = event.offsetX;
        var y = event.offsetY;
        var previousHoveredKeyIndex = this.hoveredKeyIndex;
        this.hoveredKeyIndex = -1; // 重置悬停状态

        // 检查鼠标是否在某个按钮上
        for (var i = 0; i < this.buttonInfo.length; i += 4) {
            var btnX = this.buttonInfo[i] - 12;
            var btnY = this.buttonInfo[i + 1] - 19;
            var btnWidth = this.buttonInfo[i + 2];
            var btnHeight = this.buttonInfo[i + 3];
            
            if (x >= btnX && x <= btnX + btnWidth && y >= btnY && y <= btnY + btnHeight) {
                this.hoveredKeyIndex = i >> 2;
                break;
            }
        }
        
        // 如果悬停状态改变，重新绘制
        if (this.hoveredKeyIndex !== previousHoveredKeyIndex) {
            this.drawNumberPad();
        }
    };

    /**
     * Canvas点击事件处理
     */
    NumberPadWidget.prototype.handleCanvasClick = function(event) {
        // 使用offsetX/offsetY获取相对于Canvas元素的坐标
        var x = event.offsetX;
        var y = event.offsetY;
        

        // 检查点击位置是否在某个按钮上
        for (var i = 0; i < this.buttonInfo.length; i += 4) {
            var btnX = this.buttonInfo[i] - 12;
            var btnY = this.buttonInfo[i + 1] - 19;
            var btnWidth = this.buttonInfo[i + 2];
            var btnHeight = this.buttonInfo[i + 3];
            
            if (x >= btnX && x <= btnX + btnWidth && y >= btnY && y <= btnY + btnHeight) {
                if (this.onNumberSelected) {
                    this.onNumberSelected(this.charMap[i >> 2]); // 调用回调函数
                }
                break;
            }
        }
    };

    /**
     * 显示数字键盘
     */
    NumberPadWidget.prototype.show = function() {
        this.canvas.style.visibility = 'visible';
    };

    /**
     * 隐藏数字键盘
     */
    NumberPadWidget.prototype.hide = function() {
        this.canvas.style.visibility = 'hidden';
    };

    /**
     * 销毁数字键盘
     */
    NumberPadWidget.prototype.destroy = function() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    };

    // 暴露到全局
    global.NumberPadWidget = NumberPadWidget;
    
})(window);