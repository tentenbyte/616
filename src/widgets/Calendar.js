/**
 * 日历组件 - ES5兼容版本
 * 基于Canvas的高性能日期选择组件
 * Firefox 52兼容
 */
(function(global) {
    'use strict';

    /**
     * 日历组件
     * @param {string} containerId 容器元素ID
     * @param {function} onDateClick 日期选择回调函数
     */
    function CalendarWidget(containerId, onDateClick) {
        this.container = document.getElementById(containerId) || document.body;
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'calendar';
        this.canvas.tabIndex = 0;
        this.canvas.width = 300;
        this.canvas.height = 235;
        this.left = 0;
        this.top = 0;
        
        // Canvas样式设置
        this.canvas.style.cssText = 'transition: transform 0.5s ease;' +
                                   'visibility: visible; outline: none;' +
                                   'position: absolute; top: 0;' +
                                   'left: -300px; z-index: 2;' +
                                   'border-radius: 8px;';
        
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        // 事件绑定
        var self = this;
        this.canvas.addEventListener('click', function(event) {
            self.handleCanvasClick(event);
        });
        this.canvas.addEventListener('mousemove', function(event) {
            self.handleMouseMove(event);
        });
        
        // 日期状态
        this.today = new Date();
        this.selectedDate = new Date(this.today); // 当前选中的日期
        this.hoveredButton = null; // 当前悬停的按钮
        
        this.onDateClick = onDateClick; // 保存传入的回调函数
        
        this.drawCalendar();
    }

    /**
     * 绘制日历
     */
    CalendarWidget.prototype.drawCalendar = function() {
        // 绘制日历背景
        this.ctx.fillStyle = '#F0F0F0';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制星期标题
        var daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        this.ctx.fillStyle = '#000';
        this.ctx.font = '12px Cascadia Code';
        
        for (var i = 0; i < daysOfWeek.length; i++) {
            this.ctx.fillText(daysOfWeek[i], 20 + i * 40, 63);
        }
        
        // 计算月份信息
        var startDay = new Date(this.today.getFullYear(), this.today.getMonth(), 1).getDay();
        var daysInMonth = new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0).getDate();
        
        // 绘制日期网格
        var date = 1;
        for (var i = 0; i < 6; i++) { // 最多6行
            for (var j = 0; j < 7; j++) { // 7列
                var day = i * 7 + j - startDay;
                if (day >= 0 && day < daysInMonth) {
                    var xOffset = date < 10 ? 4 : 0; // 单位数居中对齐
                    
                    // 检查是否为选中的日期
                    if (this.selectedDate.getDate() === date && 
                        this.selectedDate.getMonth() === this.today.getMonth() && 
                        this.selectedDate.getFullYear() === this.today.getFullYear()) {
                        
                        // 绘制选中日期的圆形背景
                        this.ctx.beginPath();
                        this.ctx.arc(31 + j * 40, 87 + i * 25, 12.5, 0, 2 * Math.PI);
                        this.ctx.fillStyle = '#60A4FF'; // 蓝色背景
                        this.ctx.fill();
                        
                        // 绘制白色日期文字
                        this.ctx.fillStyle = '#fff';
                        this.ctx.fillText(date, 24 + xOffset + j * 40, 91 + i * 25);
                        this.ctx.fillStyle = '#000'; // 恢复黑色
                    } else {
                        // 绘制普通日期
                        this.ctx.fillText(date, 24 + xOffset + j * 40, 91 + i * 25);
                    }
                    date++;
                }
            }
        }
        
        // 绘制导航按钮背景
        this.ctx.fillStyle = this.hoveredButton === 'yearDec' ? '#D0D0D0' : '#F0F0F0';
        this.ctx.fillRect(10, 15, 35, 22); 
        
        this.ctx.fillStyle = this.hoveredButton === 'monthDec' ? '#D0D0D0' : '#F0F0F0';
        this.ctx.fillRect(50, 15, 35, 22); 
        
        this.ctx.fillStyle = this.hoveredButton === 'monthInc' ? '#D0D0D0' : '#F0F0F0';
        this.ctx.fillRect(this.canvas.width - 85, 15, 35, 22); 
        
        this.ctx.fillStyle = this.hoveredButton === 'yearInc' ? '#D0D0D0' : '#F0F0F0';
        this.ctx.fillRect(this.canvas.width - 45, 15, 35, 22); 

        // 绘制年月标题和导航按钮文字
        this.ctx.fillStyle = '#000';
        this.ctx.font = '13px Cascadia Code';
        
        var monthStr = String(this.today.getMonth() + 1).padStart ? 
                      String(this.today.getMonth() + 1).padStart(2, '0') :
                      (this.today.getMonth() + 1 < 10 ? '0' + (this.today.getMonth() + 1) : String(this.today.getMonth() + 1));
        
        var dateString = this.today.getFullYear() + '-' + monthStr;
        this.ctx.fillText(dateString, 125, 30);
        this.ctx.fillText("<<", 20,  30);  // 年份减少
        this.ctx.fillText("<",  63,  30);  // 月份减少
        this.ctx.fillText(">",  230, 30);  // 月份增加
        this.ctx.fillText(">>", 266, 30);  // 年份增加
    };

    /**
     * 移动日历到指定位置
     * @param {number} x X坐标
     * @param {number} y Y坐标
     */
    CalendarWidget.prototype.moveCalendar = function(x, y) {
        // 使用与其他Widget一致的坐标系统，+300是为了抵消CSS中的left: -300px
        this.canvas.style.transform = 'translate3D(' + (x + 300) + 'px, ' + y + 'px, 0)';
        this.left = x; // 存储实际位置
        this.top = y;
    };

    /**
     * Canvas点击事件处理
     */
    CalendarWidget.prototype.handleCanvasClick = function(event) {
        // 使用offsetX/offsetY获取相对于Canvas元素的坐标
        var x = event.offsetX;
        var y = event.offsetY;
        
        console.log('日历点击坐标:', { x: x, y: y });

        // 检查导航按钮点击
        if (y >= 12 && y <= 32) {
            console.log('点击了导航区域:', { x: x, y: y });
            if (x >= 10 && x <= 45) {
                console.log('点击了年份减少按钮');
                this.changeYear(-1); // << 按钮：年份减少
            } else if (x >= 50 && x <= 85) {
                console.log('点击了月份减少按钮');
                this.changeMonth(-1); // < 按钮：月份减少
            } else if (x >= this.canvas.width - 85 && x <= this.canvas.width - 50) {
                console.log('点击了月份增加按钮');
                this.changeMonth(1); // > 按钮：月份增加
            } else if (x >= this.canvas.width - 45 && x <= this.canvas.width - 10) {
                console.log('点击了年份增加按钮');
                this.changeYear(1); // >> 按钮：年份增加
            } else {
                console.log('点击了导航区域，但不在按钮范围内');
            }
        } else if (y >= 53 && y <= this.canvas.height) {
            // 检查日期单元格点击
            var startDay = new Date(this.today.getFullYear(), this.today.getMonth(), 1).getDay();
            var col = Math.floor((x - 12) / 40);
            var row = Math.floor((y - 72) / 25);
            var date = row * 7 + col - startDay + 1;
            var daysInMonth = new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0).getDate();
            
            if (date > 0 && date <= daysInMonth) {
                this.selectedDate = new Date(this.today.getFullYear(), this.today.getMonth(), date);
                this.drawCalendar(); // 重新绘制以反映选中的日期
                
                if (this.onDateClick) {
                    this.onDateClick(this.getDays()); // 调用回调函数
                }
            }
        }  
    };

    /**
     * 鼠标移动事件处理
     */
    CalendarWidget.prototype.handleMouseMove = function(event) {
        // 使用offsetX/offsetY获取相对于Canvas元素的坐标
        var x = event.offsetX;
        var y = event.offsetY;
        var previousHoveredButton = this.hoveredButton;
        
        // 重置悬停状态
        this.hoveredButton = null;
    
        // 根据鼠标位置更新悬停状态
        if (y >= 12 && y <= 32) {
            if (x >= 10 && x <= 40) {
                this.hoveredButton = 'yearDec';
            } else if (x >= 50 && x <= 80) {
                this.hoveredButton = 'monthDec';
            } else if (x >= this.canvas.width - 80 && x <= this.canvas.width - 50) {
                this.hoveredButton = 'monthInc';
            } else if (x >= this.canvas.width - 40 && x <= this.canvas.width - 10) {
                this.hoveredButton = 'yearInc';
            }
        }
    
        // 如果悬停状态改变，则重绘日历
        if (this.hoveredButton !== previousHoveredButton) {
            this.drawCalendar();
        }
    };
    
    /**
     * 修改月份
     * @param {number} offset 月份偏移量
     */
    CalendarWidget.prototype.changeMonth = function(offset) {
        var currentMonth = this.today.getMonth();
        var currentYear = this.today.getFullYear();
        
        currentMonth += offset;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear -= 1;
        } else if (currentMonth > 11) {
            currentMonth = 0;
            currentYear += 1;
        }
        
        this.today.setMonth(currentMonth);
        this.today.setFullYear(currentYear);
        this.drawCalendar();
    };

    /**
     * 修改年份
     * @param {number} offset 年份偏移量
     */
    CalendarWidget.prototype.changeYear = function(offset) {
        var currentYear = this.today.getFullYear();
        currentYear += offset;
        this.today.setFullYear(currentYear);
        this.drawCalendar();
    };

    /**
     * 获取选中日期相对于基准日期的天数
     * @returns {number} 天数
     */
    CalendarWidget.prototype.getDays = function() {
        var baseDate = new Date(2023, 0, 1); // 2023年1月1日作为基准
        return Math.round((this.selectedDate - baseDate) / 86400000);
    };
    
    /**
     * 设置当前日期为今天
     */
    CalendarWidget.prototype.setCurrentDateToToday = function() {
        var now = new Date();
        this.today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); 
        this.selectedDate = new Date(this.today);
        this.drawCalendar();
    };

    /**
     * 根据天数设置选中日期
     * @param {number} days 相对于基准日期的天数
     */
    CalendarWidget.prototype.setDateByDays = function(days) {
        var baseDate = new Date(2023, 0, 1);
        this.selectedDate = new Date(baseDate.getTime() + days * 86400000);
        this.today = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1);
        this.drawCalendar();
    };

    /**
     * 获取选中日期的格式化字符串
     * @returns {string} YYYY-MM-DD格式的日期字符串
     */
    CalendarWidget.prototype.getFormattedDate = function() {
        var year = this.selectedDate.getFullYear();
        var month = String(this.selectedDate.getMonth() + 1);
        var day = String(this.selectedDate.getDate());
        
        // ES5兼容的字符串填充
        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;
        
        return year + '-' + month + '-' + day;
    };

    /**
     * 显示日历
     */
    CalendarWidget.prototype.show = function() {
        this.canvas.style.visibility = 'visible';
    };

    /**
     * 隐藏日历
     */
    CalendarWidget.prototype.hide = function() {
        this.canvas.style.visibility = 'hidden';
    };

    /**
     * 销毁日历
     */
    CalendarWidget.prototype.destroy = function() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    };

    // 暴露到全局
    global.CalendarWidget = CalendarWidget;
    
})(window);