/**
 * 工具函数库 - ES5版本
 * Firefox 52兼容
 */
(function(global) {
    'use strict';
    
    var Helpers = {
        /**
         * 获取列标签 (A, B, C, ..., AA, AB, ...)
         */
        getColumnLabel: function(col) {
            var label = '';
            col += 1;
            while (col > 0) {
                col -= 1;
                label = String.fromCharCode(65 + (col % 26)) + label;
                col = Math.floor(col / 26);
            }
            return label;
        },

        /**
         * 解析列标签为索引
         */
        parseColumnLabel: function(label) {
            var col = 0;
            for (var i = 0; i < label.length; i++) {
                col = col * 26 + (label.charCodeAt(i) - 64);
            }
            return col - 1;
        },

        /**
         * 获取单元格引用 (如 A1, B2)
         */
        getCellReference: function(row, col) {
            return this.getColumnLabel(col) + (row + 1);
        },

        /**
         * 解析单元格引用
         */
        parseCellReference: function(reference) {
            var match = reference.match(/^([A-Z]+)(\d+)$/);
            if (!match) {
                throw new Error('Invalid cell reference');
            }
            
            var col = this.parseColumnLabel(match[1]);
            var row = parseInt(match[2], 10) - 1;
            
            return { row: row, col: col };
        },

        /**
         * 深拷贝对象
         */
        deepClone: function(obj) {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }
            
            if (obj instanceof Date) {
                return new Date(obj.getTime());
            }
            
            if (obj instanceof Array) {
                var result = [];
                for (var i = 0; i < obj.length; i++) {
                    result[i] = this.deepClone(obj[i]);
                }
                return result;
            }
            
            if (typeof obj === 'object') {
                var cloned = {};
                for (var key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        cloned[key] = this.deepClone(obj[key]);
                    }
                }
                return cloned;
            }
            
            return obj;
        },

        /**
         * 防抖函数
         */
        debounce: function(func, wait, options) {
            var timeout;
            var lastArgs;
            var lastCallTime;
            var lastInvokeTime = 0;
            var leading = false;
            var maxing = false;
            var trailing = true;

            options = options || {};
            
            if (typeof func !== 'function') {
                throw new TypeError('Expected a function');
            }

            wait = Number(wait) || 0;
            if (options && typeof options === 'object') {
                leading = !!options.leading;
                maxing = 'maxWait' in options;
                trailing = 'trailing' in options ? !!options.trailing : trailing;
            }

            function invokeFunc(time) {
                var args = lastArgs;
                lastArgs = undefined;
                lastInvokeTime = time;
                return func.apply(undefined, args);
            }

            function leadingEdge(time) {
                lastInvokeTime = time;
                timeout = setTimeout(timerExpired, wait);
                return leading ? invokeFunc(time) : undefined;
            }

            function remainingWait(time) {
                var timeSinceLastCall = time - lastCallTime;
                var timeSinceLastInvoke = time - lastInvokeTime;
                var timeWaiting = wait - timeSinceLastCall;

                return maxing
                    ? Math.min(timeWaiting, (options.maxWait || 0) - timeSinceLastInvoke)
                    : timeWaiting;
            }

            function shouldInvoke(time) {
                var timeSinceLastCall = time - lastCallTime;
                var timeSinceLastInvoke = time - lastInvokeTime;

                return (
                    lastCallTime === undefined ||
                    timeSinceLastCall >= wait ||
                    timeSinceLastCall < 0 ||
                    (maxing && timeSinceLastInvoke >= (options.maxWait || 0))
                );
            }

            function timerExpired() {
                var time = Date.now();
                if (shouldInvoke(time)) {
                    return trailingEdge(time);
                }
                timeout = setTimeout(timerExpired, remainingWait(time));
                return undefined;
            }

            function trailingEdge(time) {
                timeout = undefined;
                if (trailing && lastArgs) {
                    return invokeFunc(time);
                }
                lastArgs = undefined;
                return undefined;
            }

            function cancel() {
                if (timeout !== undefined) {
                    clearTimeout(timeout);
                }
                lastInvokeTime = 0;
                lastArgs = undefined;
                lastCallTime = undefined;
                timeout = undefined;
            }

            function flush() {
                return timeout === undefined ? undefined : trailingEdge(Date.now());
            }

            function debounced() {
                var time = Date.now();
                var isInvoking = shouldInvoke(time);
                var args = Array.prototype.slice.call(arguments);

                lastArgs = args;
                lastCallTime = time;

                if (isInvoking) {
                    if (timeout === undefined) {
                        leadingEdge(lastCallTime);
                        return;
                    }
                    if (maxing) {
                        clearTimeout(timeout);
                        timeout = setTimeout(timerExpired, wait);
                        invokeFunc(lastCallTime);
                        return;
                    }
                }
                if (timeout === undefined) {
                    timeout = setTimeout(timerExpired, wait);
                }
            }

            debounced.cancel = cancel;
            debounced.flush = flush;
            return debounced;
        },

        /**
         * 节流函数
         */
        throttle: function(func, limit) {
            var inThrottle;
            return function() {
                var args = arguments;
                var context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(function() {
                        inThrottle = false;
                    }, limit);
                }
            };
        },

        /**
         * 格式化日期
         */
        formatDate: function(date, format) {
            format = format || 'YYYY-MM-DD HH:mm:ss';
            var year = date.getFullYear();
            var month = ('0' + (date.getMonth() + 1)).slice(-2);
            var day = ('0' + date.getDate()).slice(-2);
            var hours = ('0' + date.getHours()).slice(-2);
            var minutes = ('0' + date.getMinutes()).slice(-2);
            var seconds = ('0' + date.getSeconds()).slice(-2);
            
            return format
                .replace('YYYY', year.toString())
                .replace('MM', month)
                .replace('DD', day)
                .replace('HH', hours)
                .replace('mm', minutes)
                .replace('ss', seconds);
        },

        /**
         * 生成唯一ID
         */
        generateId: function(prefix) {
            prefix = prefix || 'id';
            return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        /**
         * 安全的JSON解析
         */
        safeJsonParse: function(str, defaultValue) {
            try {
                return JSON.parse(str);
            } catch (error) {
                console.warn('JSON parse error:', error);
                return defaultValue || null;
            }
        },

        /**
         * 安全的JSON字符串化
         */
        safeJsonStringify: function(obj, defaultValue) {
            try {
                return JSON.stringify(obj);
            } catch (error) {
                console.warn('JSON stringify error:', error);
                return defaultValue || '{}';
            }
        },

        /**
         * 检查快捷键是否匹配
         */
        isShortcutMatch: function(event, shortcut) {
            var parts = shortcut.toLowerCase().split('+');
            var key = parts.pop();
            
            var modifiers = {
                ctrl: event.ctrlKey,
                meta: event.metaKey,
                alt: event.altKey,
                shift: event.shiftKey
            };
            
            // 检查修饰键
            for (var i = 0; i < parts.length; i++) {
                var modifier = parts[i];
                if (!modifiers[modifier]) {
                    return false;
                }
            }
            
            // 检查主键
            return event.key.toLowerCase() === key;
        },

        /**
         * 深度合并对象
         */
        deepMerge: function(target) {
            var sources = Array.prototype.slice.call(arguments, 1);
            
            if (!sources.length) return target;
            var source = sources.shift();
            
            if (this.isObject(target) && this.isObject(source)) {
                for (var key in source) {
                    if (source.hasOwnProperty(key)) {
                        if (this.isObject(source[key])) {
                            if (!target[key]) {
                                target[key] = {};
                            }
                            this.deepMerge(target[key], source[key]);
                        } else {
                            target[key] = source[key];
                        }
                    }
                }
            }
            
            return this.deepMerge.apply(this, [target].concat(sources));
        },

        /**
         * 检查是否为对象
         */
        isObject: function(item) {
            return item && typeof item === 'object' && !Array.isArray(item);
        },

        /**
         * 限制数值范围
         */
        clamp: function(value, min, max) {
            return Math.min(Math.max(value, min), max);
        },

        /**
         * 格式化文件大小
         */
        formatFileSize: function(bytes, decimals) {
            decimals = decimals || 2;
            if (bytes === 0) return '0 Bytes';
            
            var k = 1024;
            var dm = decimals < 0 ? 0 : decimals;
            var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            
            var i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }
    };

    // 暴露到全局
    global.Helpers = Helpers;
    
})(window);