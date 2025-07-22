/**
 * 事件管理模块 - ES5版本
 * Firefox 52兼容
 */
(function(global) {
    'use strict';

    function EventManager() {
        this.listeners = {};
        this.onceListeners = {};
    }

    /**
     * 添加事件监听器
     */
    EventManager.prototype.on = function(event, callback, context) {
        context = context || null;
        
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        
        this.listeners[event].push({ callback: callback, context: context });
    };

    /**
     * 添加一次性事件监听器
     */
    EventManager.prototype.once = function(event, callback, context) {
        context = context || null;
        
        if (!this.onceListeners[event]) {
            this.onceListeners[event] = [];
        }
        
        this.onceListeners[event].push({ callback: callback, context: context });
    };

    /**
     * 移除事件监听器
     */
    EventManager.prototype.off = function(event, callback, context) {
        callback = callback || null;
        context = context || null;
        
        if (callback === null) {
            // 移除所有监听器
            delete this.listeners[event];
            delete this.onceListeners[event];
            return;
        }

        var removeFromArray = function(array) {
            for (var i = array.length - 1; i >= 0; i--) {
                var listener = array[i];
                if (listener.callback === callback && 
                    (context === null || listener.context === context)) {
                    array.splice(i, 1);
                }
            }
        };

        if (this.listeners[event]) {
            removeFromArray(this.listeners[event]);
        }

        if (this.onceListeners[event]) {
            removeFromArray(this.onceListeners[event]);
        }
    };

    /**
     * 触发事件
     */
    EventManager.prototype.emit = function(event) {
        var args = Array.prototype.slice.call(arguments, 1);
        
        // 处理普通监听器
        if (this.listeners[event]) {
            var listeners = this.listeners[event];
            for (var i = 0; i < listeners.length; i++) {
                var listener = listeners[i];
                try {
                    if (listener.context) {
                        listener.callback.apply(listener.context, args);
                    } else {
                        listener.callback.apply(null, args);
                    }
                } catch (error) {
                    console.error('Error in event listener for \'' + event + '\':', error);
                }
            }
        }

        // 处理一次性监听器
        if (this.onceListeners[event]) {
            var listeners = this.onceListeners[event];
            delete this.onceListeners[event]; // 先删除，防止回调中再次触发
            
            for (var i = 0; i < listeners.length; i++) {
                var listener = listeners[i];
                try {
                    if (listener.context) {
                        listener.callback.apply(listener.context, args);
                    } else {
                        listener.callback.apply(null, args);
                    }
                } catch (error) {
                    console.error('Error in once event listener for \'' + event + '\':', error);
                }
            }
        }
    };

    /**
     * 检查是否有监听器
     */
    EventManager.prototype.hasListeners = function(event) {
        return (this.listeners[event] && this.listeners[event].length > 0) ||
               (this.onceListeners[event] && this.onceListeners[event].length > 0);
    };

    /**
     * 获取所有事件名称
     */
    EventManager.prototype.getEvents = function() {
        var events = [];
        var seen = {};
        
        for (var event in this.listeners) {
            if (this.listeners.hasOwnProperty(event) && !seen[event]) {
                events.push(event);
                seen[event] = true;
            }
        }
        
        for (var event in this.onceListeners) {
            if (this.onceListeners.hasOwnProperty(event) && !seen[event]) {
                events.push(event);
                seen[event] = true;
            }
        }
        
        return events;
    };

    /**
     * 清除所有监听器
     */
    EventManager.prototype.clear = function() {
        this.listeners = {};
        this.onceListeners = {};
    };

    /**
     * 清除特定事件的所有监听器
     */
    EventManager.prototype.clearEvent = function(event) {
        delete this.listeners[event];
        delete this.onceListeners[event];
    };

    /**
     * 获取监听器统计信息
     */
    EventManager.prototype.getStats = function() {
        var stats = {
            totalEvents: this.getEvents().length,
            regularListeners: 0,
            onceListeners: 0,
            events: {}
        };

        for (var event in this.listeners) {
            if (this.listeners.hasOwnProperty(event)) {
                var listeners = this.listeners[event];
                stats.regularListeners += listeners.length;
                stats.events[event] = (stats.events[event] || 0) + listeners.length;
            }
        }

        for (var event in this.onceListeners) {
            if (this.onceListeners.hasOwnProperty(event)) {
                var listeners = this.onceListeners[event];
                stats.onceListeners += listeners.length;
                stats.events[event] = (stats.events[event] || 0) + listeners.length;
            }
        }

        return stats;
    };

    /**
     * 全局事件管理器实例
     */
    var globalEventManager = new EventManager();

    /**
     * 事件常量
     */
    var EVENTS = {
        // 表格事件
        TABLE_INITIALIZED: 'table:initialized',
        TABLE_DATA_CHANGED: 'table:dataChanged',
        TABLE_CELL_SELECTED: 'table:cellSelected',
        TABLE_CELL_EDITED: 'table:cellEdited',
        TABLE_CELL_CLEARED: 'table:cellCleared',
        TABLE_ROW_ADDED: 'table:rowAdded',
        TABLE_ROW_DELETED: 'table:rowDeleted',
        TABLE_COLUMN_ADDED: 'table:columnAdded',
        TABLE_COLUMN_DELETED: 'table:columnDeleted',
        TABLE_CLEARED: 'table:cleared',
        TABLE_REDRAWN: 'table:redrawn',
        TABLE_EDIT_REQUESTED: 'table:editRequested',
        TABLE_SORTED: 'table:sorted',
        TABLE_SORT_RESET: 'table:sortReset',
        TABLE_COLUMN_HEADER_CLICKED: 'table:columnHeaderClicked',
        TABLE_RENDERED: 'table:rendered',
        TABLE_FILTERED: 'table:filtered',
        TABLE_SCROLLED: 'table:scrolled',
        
        // 筛选事件
        FILTER_APPLIED: 'filter:applied',
        FILTER_CLEARED: 'filter:cleared',
        FILTER_COLUMN_CHANGED: 'filter:columnChanged',
        FILTER_GLOBAL_SEARCH: 'filter:globalSearch',
        FILTER_PANEL_SHOWN: 'filter:panelShown',
        FILTER_PANEL_CLOSED: 'filter:panelClosed',
        FILTER_STATE_CHANGED: 'filter:stateChanged',
        
        // 数据库事件
        DB_INITIALIZED: 'db:initialized',
        DB_SAVE_SUCCESS: 'db:saveSuccess',
        DB_SAVE_ERROR: 'db:saveError',
        DB_LOAD_SUCCESS: 'db:loadSuccess',
        DB_LOAD_ERROR: 'db:loadError',
        DB_DELETE_SUCCESS: 'db:deleteSuccess',
        DB_DELETE_ERROR: 'db:deleteError',
        
        // 应用事件
        APP_INITIALIZED: 'app:initialized',
        APP_STATUS_CHANGED: 'app:statusChanged',
        APP_CONFIG_CHANGED: 'app:configChanged',
        APP_ERROR: 'app:error',
        
        // 用户交互事件
        USER_MOUSE_CLICK: 'user:mouseClick',
        USER_MOUSE_DOUBLE_CLICK: 'user:mouseDoubleClick',
        USER_KEYBOARD_INPUT: 'user:keyboardInput',
        USER_TOOLBAR_ACTION: 'user:toolbarAction',
        
        // 渲染器事件
        RENDERER_PERFORMANCE_STATS: 'renderer:performanceStats',
        
        // 模块错误事件
        MODULE_ERROR: 'module:error',
        
        // 配置变更事件
        CONFIG_CHANGED: 'config:changed'
    };

    // 暴露到全局
    global.EventManager = EventManager;
    global.globalEventManager = globalEventManager;
    global.EVENTS = EVENTS;
    
})(window);