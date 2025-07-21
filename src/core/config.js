/**
 * 应用配置管理模块 - ES5版本
 * Firefox 52兼容
 */
(function(global) {
    'use strict';

    var DEFAULT_TABLE_CONFIG = {
        cellWidth: 120,
        cellHeight: 30,
        headerHeight: 35,
        rowHeaderWidth: 50,
        fontSize: 14,
        fontFamily: 'Cascadia Code, monospace',
        cellBg: '#ffffff',              // 单元格背景色（白色）
        borderColor: '#cccccc',         // 网格线颜色（浅灰色）
        headerBg: '#f8f9fa',
        selectedBg: '#e3f2fd',
        textColor: '#000000',
        headerTextColor: '#666',
        selectedBorderColor: '#007bff',
        selectedBorderWidth: 2,
        defaultBorderWidth: 1
    };

    var DEFAULT_TABLE_SIZE = {
        rows: 100,  // 增加到100行
        cols: 26    // 增加到26列(A-Z)
    };

    var DATABASE_CONFIG = {
        dbName: 'TableApp',
        version: 2,
        tableStoreName: 'tables',
        cellStoreName: 'cells',
        columnarTableStoreName: 'columnar_tables',
        columnarColumnStoreName: 'columnar_columns'
    };

    var AUTO_SAVE_CONFIG = {
        enabled: false,
        interval: 30000 // 30秒
    };

    var KEYBOARD_SHORTCUTS = {
        save: ['ctrl+s', 'meta+s'],
        load: ['ctrl+o', 'meta+o'],
        export: ['ctrl+e', 'meta+e'],
        newTable: ['ctrl+n', 'meta+n'],
        delete: ['Delete'],
        edit: ['Enter', 'F2'],
        escape: ['Escape'],
        navigate: {
            up: ['ArrowUp'],
            down: ['ArrowDown'],
            left: ['ArrowLeft'],
            right: ['ArrowRight']
        }
    };

    function Config(userConfig) {
        userConfig = userConfig || {};
        
        this.tableConfig = global.Helpers.deepMerge({}, DEFAULT_TABLE_CONFIG, userConfig.table || {});
        this.tableSize = global.Helpers.deepMerge({}, DEFAULT_TABLE_SIZE, userConfig.size || {});
        this.databaseConfig = global.Helpers.deepMerge({}, DATABASE_CONFIG, userConfig.database || {});
        this.autoSaveConfig = global.Helpers.deepMerge({}, AUTO_SAVE_CONFIG, userConfig.autoSave || {});
        this.keyboardShortcuts = global.Helpers.deepMerge({}, KEYBOARD_SHORTCUTS, userConfig.shortcuts || {});
    }

    Config.prototype.getTableConfig = function() {
        return global.Helpers.deepClone(this.tableConfig);
    };

    Config.prototype.getTableSize = function() {
        return global.Helpers.deepClone(this.tableSize);
    };

    Config.prototype.getDatabaseConfig = function() {
        return global.Helpers.deepClone(this.databaseConfig);
    };

    Config.prototype.getAutoSaveConfig = function() {
        return global.Helpers.deepClone(this.autoSaveConfig);
    };

    Config.prototype.getKeyboardShortcuts = function() {
        return global.Helpers.deepClone(this.keyboardShortcuts);
    };

    Config.prototype.updateConfig = function(path, value) {
        var pathArray = path.split('.');
        var current = this;
        
        for (var i = 0; i < pathArray.length - 1; i++) {
            current = current[pathArray[i]];
        }
        
        current[pathArray[pathArray.length - 1]] = value;
    };

    Config.loadFromLocalStorage = function(key) {
        key = key || 'tableAppConfig';
        try {
            var stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            return {};
        }
    };

    Config.prototype.saveToLocalStorage = function(key) {
        key = key || 'tableAppConfig';
        try {
            var config = {
                table: this.tableConfig,
                size: this.tableSize,
                database: this.databaseConfig,
                autoSave: this.autoSaveConfig,
                shortcuts: this.keyboardShortcuts
            };
            localStorage.setItem(key, JSON.stringify(config));
        } catch (error) {
        }
    };

    Config.prototype.reset = function() {
        this.tableConfig = global.Helpers.deepClone(DEFAULT_TABLE_CONFIG);
        this.tableSize = global.Helpers.deepClone(DEFAULT_TABLE_SIZE);
        this.databaseConfig = global.Helpers.deepClone(DATABASE_CONFIG);
        this.autoSaveConfig = global.Helpers.deepClone(AUTO_SAVE_CONFIG);
        this.keyboardShortcuts = global.Helpers.deepClone(KEYBOARD_SHORTCUTS);
    };

    Config.prototype.validate = function() {
        var tableConfig = this.tableConfig;
        var tableSize = this.tableSize;
        var autoSaveConfig = this.autoSaveConfig;

        // 验证表格配置
        if (tableConfig.cellWidth < 50 || tableConfig.cellWidth > 300) return false;
        if (tableConfig.cellHeight < 20 || tableConfig.cellHeight > 100) return false;
        if (tableConfig.fontSize < 8 || tableConfig.fontSize > 32) return false;

        // 验证表格大小
        if (tableSize.rows < 1 || tableSize.rows > 1000) return false;
        if (tableSize.cols < 1 || tableSize.cols > 100) return false;

        // 验证自动保存配置
        if (autoSaveConfig.interval < 5000 || autoSaveConfig.interval > 300000) return false;

        return true;
    };

    Config.prototype.clone = function() {
        return new Config({
            table: this.tableConfig,
            size: this.tableSize,
            database: this.databaseConfig,
            autoSave: this.autoSaveConfig,
            shortcuts: this.keyboardShortcuts
        });
    };

    // 暴露到全局
    global.Config = Config;
    
})(window);