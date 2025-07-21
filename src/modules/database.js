/**
 * 简化的数据库管理模块 - ES5版本
 * Firefox 52兼容
 * 专为TrueColumnarStorage设计
 */
(function(global) {
    'use strict';

    function DatabaseManager(config, eventManager) {
        this.config = config;
        this.eventManager = eventManager || global.globalEventManager;
        this.db = null;
        this.isReady = false;
    }

    /**
     * 初始化数据库
     * @returns {Promise} 初始化结果
     */
    DatabaseManager.prototype.initialize = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            self.openDatabase()
                .then(function(db) {
                    self.db = db;
                    self.isReady = true;
                    
                    if (self.eventManager && global.EVENTS) {
                        self.eventManager.emit(global.EVENTS.DB_INITIALIZED);
                    }
                    resolve(db);
                })
                .catch(function(error) {
                    if (self.eventManager && global.EVENTS) {
                        self.eventManager.emit(global.EVENTS.APP_ERROR, 'Database initialization failed', error);
                    }
                    reject(error);
                });
        });
    };

    /**
     * 打开数据库连接
     * @returns {Promise} 数据库连接
     */
    DatabaseManager.prototype.openDatabase = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var request = indexedDB.open(self.config.dbName, self.config.version);
            
            request.onerror = function() {
                reject(request.error);
            };
            
            request.onsuccess = function() {
                resolve(request.result);
            };
            
            request.onupgradeneeded = function(event) {
                var db = event.target.result;
                self.upgradeDatabase(db, event.oldVersion, event.newVersion);
            };
        });
    };

    /**
     * 数据库升级处理
     * @param {IDBDatabase} db - 数据库对象
     * @param {number} oldVersion - 旧版本号
     * @param {number} newVersion - 新版本号
     */
    DatabaseManager.prototype.upgradeDatabase = function(db, oldVersion, newVersion) {
        
        // 创建TrueColumnarStorage需要的存储
        if (!db.objectStoreNames.contains('columnar_tables')) {
            var tableStore = db.createObjectStore('columnar_tables', { keyPath: 'id' });
            tableStore.createIndex('name', 'name', { unique: false });
            tableStore.createIndex('created', 'created', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('columnar_columns')) {
            var columnStore = db.createObjectStore('columnar_columns', { keyPath: ['tableId', 'columnName'] });
            columnStore.createIndex('tableId', 'tableId', { unique: false });
        }
    };

    /**
     * 保存表格数据
     * @param {Object} tableData - 表格数据
     * @returns {Promise} 保存结果
     */
    DatabaseManager.prototype.saveTable = function(tableData) {
        var self = this;
        return new Promise(function(resolve, reject) {
            if (!self.isReady || !self.db) {
                // 如果数据库未准备好，先初始化
                self.initialize().then(function() {
                    return self.saveTable(tableData);
                }).then(resolve).catch(reject);
                return;
            }
            
            var transaction = self.db.transaction(['columnar_tables'], 'readwrite');
            var store = transaction.objectStore('columnar_tables');
            
            // 添加时间戳
            tableData.lastModified = new Date().toISOString();
            
            var request = store.put(tableData);
            
            request.onsuccess = function() {
                resolve(tableData);
            };
            
            request.onerror = function() {
                reject(request.error);
            };
        });
    };

    /**
     * 获取表格数据
     * @param {string} tableId - 表格ID
     * @returns {Promise} 表格数据
     */
    DatabaseManager.prototype.getTable = function(tableId) {
        var self = this;
        return new Promise(function(resolve, reject) {
            if (!self.isReady || !self.db) {
                // 如果数据库未准备好，先初始化
                self.initialize().then(function() {
                    return self.getTable(tableId);
                }).then(resolve).catch(reject);
                return;
            }
            
            var transaction = self.db.transaction(['columnar_tables'], 'readonly');
            var store = transaction.objectStore('columnar_tables');
            var request = store.get(tableId);
            
            request.onsuccess = function() {
                resolve(request.result);
            };
            
            request.onerror = function() {
                reject(request.error);
            };
        });
    };

    /**
     * 清空表格数据
     * @param {string} tableId - 表格ID
     * @returns {Promise} 清空结果
     */
    DatabaseManager.prototype.clearTable = function(tableId) {
        var self = this;
        return new Promise(function(resolve, reject) {
            if (!self.isReady || !self.db) {
                // 如果数据库未准备好，先初始化
                self.initialize().then(function() {
                    return self.clearTable(tableId);
                }).then(resolve).catch(reject);
                return;
            }
            
            var transaction = self.db.transaction(['columnar_tables'], 'readwrite');
            var store = transaction.objectStore('columnar_tables');
            var request = store.delete(tableId);
            
            request.onsuccess = function() {
                resolve();
            };
            
            request.onerror = function() {
                reject(request.error);
            };
        });
    };

    /**
     * 获取所有表格列表
     * @returns {Promise} 表格列表
     */
    DatabaseManager.prototype.getAllTables = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            if (!self.isReady || !self.db) {
                // 如果数据库未准备好，先初始化
                self.initialize().then(function() {
                    return self.getAllTables();
                }).then(resolve).catch(reject);
                return;
            }
            
            var transaction = self.db.transaction(['columnar_tables'], 'readonly');
            var store = transaction.objectStore('columnar_tables');
            var request = store.getAll();
            
            request.onsuccess = function() {
                resolve(request.result);
            };
            
            request.onerror = function() {
                reject(request.error);
            };
        });
    };

    /**
     * 导出数据 - 简化版本
     * @param {Object} options - 导出选项
     * @returns {Promise} 导出结果
     */
    DatabaseManager.prototype.exportData = function(options) {
        return Promise.resolve({
            message: 'Export functionality moved to TrueColumnarStorage',
            timestamp: new Date().toISOString()
        });
    };

    /**
     * 检查数据库是否已初始化
     * @returns {boolean} 是否已初始化
     */
    DatabaseManager.prototype.isInitialized = function() {
        return this.isReady && this.db !== null;
    };

    /**
     * 优雅关闭数据库连接
     */
    DatabaseManager.prototype.close = function() {
        if (this.db) {
            try {
                this.db.close();
                this.db = null;
                this.isReady = false;
                if (this.eventManager && global.EVENTS) {
                    this.eventManager.emit(global.EVENTS.DB_CLOSED);
                }
            } catch (error) {
            }
        }
    };

    // 暴露到全局
    global.DatabaseManager = DatabaseManager;
    
})(window);