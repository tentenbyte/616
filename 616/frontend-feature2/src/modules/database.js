/**
 * IndexedDB数据库管理模块 - ES5版本
 * 负责列式数据的持久化存储和加载
 */
(function(global) {
    'use strict';

    /**
     * IndexedDB数据库管理器
     * @param {Object} config 数据库配置
     */
    function DatabaseManager(config) {
        this.config = config || {};
        this.db = null;
        this.dbName = this.config.dbName || 'TableApp';
        this.version = this.config.version || 2;
        this.tableStoreName = this.config.columnarTableStoreName || 'columnar_tables';
        this.columnStoreName = this.config.columnarColumnStoreName || 'columnar_columns';
    }

    /**
     * 初始化数据库连接
     */
    DatabaseManager.prototype.initialize = function() {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB不支持'));
                return;
            }

            var request = window.indexedDB.open(self.dbName, self.version);
            
            request.onerror = function(event) {
                reject(new Error('数据库连接失败: ' + event.target.error));
            };
            
            request.onsuccess = function(event) {
                self.db = event.target.result;
                resolve(self.db);
            };
            
            request.onupgradeneeded = function(event) {
                self.db = event.target.result;
                self.setupObjectStores();
            };
        });
    };

    /**
     * 设置对象存储
     */
    DatabaseManager.prototype.setupObjectStores = function() {
        // 表元数据存储
        if (!this.db.objectStoreNames.contains(this.tableStoreName)) {
            var tableStore = this.db.createObjectStore(this.tableStoreName, {
                keyPath: 'id',
                autoIncrement: true
            });
            tableStore.createIndex('name', 'name', { unique: false });
            tableStore.createIndex('created', 'created', { unique: false });
        }

        // 列数据存储
        if (!this.db.objectStoreNames.contains(this.columnStoreName)) {
            var columnStore = this.db.createObjectStore(this.columnStoreName, {
                keyPath: 'id',
                autoIncrement: true
            });
            columnStore.createIndex('tableId', 'tableId', { unique: false });
            columnStore.createIndex('columnIndex', 'columnIndex', { unique: false });
        }
    };

    /**
     * 保存列式数据到IndexedDB
     * @param {String} tableName 表名
     * @param {Object} columnarDB 列式数据库实例
     */
    DatabaseManager.prototype.saveColumnarData = function(tableName, columnarDB) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.db) {
                reject(new Error('数据库未初始化'));
                return;
            }

            var transaction = self.db.transaction([self.tableStoreName, self.columnStoreName], 'readwrite');
            var tableStore = transaction.objectStore(self.tableStoreName);
            var columnStore = transaction.objectStore(self.columnStoreName);

            // 准备表元数据
            var tableData = {
                name: tableName,
                totalRows: columnarDB.totalRows,
                visibleRows: columnarDB.visibleRows,
                maxRows: columnarDB.maxRows,
                maxCols: columnarDB.maxCols,
                columnTypes: columnarDB.columnTypes,
                created: new Date(),
                updated: new Date()
            };

            // 保存表元数据
            var tableRequest = tableStore.put(tableData);
            
            tableRequest.onsuccess = function(event) {
                var tableId = event.target.result;
                
                // 先清除旧的列数据
                var clearRequest = columnStore.index('tableId').openCursor(IDBKeyRange.only(tableId));
                var deletePromises = [];
                
                clearRequest.onsuccess = function(event) {
                    var cursor = event.target.result;
                    if (cursor) {
                        deletePromises.push(new Promise(function(resolveDelete) {
                            var deleteRequest = columnStore.delete(cursor.primaryKey);
                            deleteRequest.onsuccess = function() { resolveDelete(); };
                        }));
                        cursor.continue();
                    } else {
                        // 所有删除完成后，保存新的列数据
                        Promise.all(deletePromises).then(function() {
                            self.saveColumnData(columnStore, tableId, columnarDB)
                                .then(resolve)
                                .catch(reject);
                        });
                    }
                };
            };

            tableRequest.onerror = function(event) {
                reject(new Error('保存表元数据失败: ' + event.target.error));
            };
        });
    };

    /**
     * 保存列数据
     */
    DatabaseManager.prototype.saveColumnData = function(columnStore, tableId, columnarDB) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            var savePromises = [];
            
            // 保存每列的数据
            for (var col = 0; col < columnarDB.maxCols; col++) {
                if (columnarDB.columns[col]) {
                    var columnData = {
                        tableId: tableId,
                        columnIndex: col,
                        columnType: columnarDB.columnTypes[col],
                        data: Array.from(columnarDB.columns[col]),
                        uniqueValues: columnarDB.uniqueValues[col] || [],
                        valueToIndex: columnarDB.valueToIndex[col] || {},
                        created: new Date()
                    };
                    
                    savePromises.push(new Promise(function(resolveColumn, rejectColumn) {
                        var columnRequest = columnStore.put(columnData);
                        columnRequest.onsuccess = function() { resolveColumn(); };
                        columnRequest.onerror = function(event) { 
                            rejectColumn(new Error('保存列数据失败: ' + event.target.error));
                        };
                    }));
                }
            }
            
            Promise.all(savePromises)
                .then(function() {
                    resolve();
                })
                .catch(reject);
        });
    };

    /**
     * 从IndexedDB加载列式数据
     * @param {String} tableName 表名
     */
    DatabaseManager.prototype.loadColumnarData = function(tableName) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.db) {
                reject(new Error('数据库未初始化'));
                return;
            }

            var transaction = self.db.transaction([self.tableStoreName, self.columnStoreName], 'readonly');
            var tableStore = transaction.objectStore(self.tableStoreName);
            var columnStore = transaction.objectStore(self.columnStoreName);

            // 查找表
            var tableRequest = tableStore.index('name').get(tableName);
            
            tableRequest.onsuccess = function(event) {
                var tableData = event.target.result;
                
                if (!tableData) {
                    resolve(null); // 表不存在
                    return;
                }

                // 加载列数据
                var columnRequest = columnStore.index('tableId').getAll(tableData.id);
                
                columnRequest.onsuccess = function(event) {
                    var columns = event.target.result;
                    
                    // 重构列式数据
                    var columnarData = {
                        totalRows: tableData.totalRows,
                        visibleRows: tableData.visibleRows,
                        maxRows: tableData.maxRows,
                        maxCols: tableData.maxCols,
                        columnTypes: tableData.columnTypes,
                        columns: {},
                        uniqueValues: {},
                        valueToIndex: {}
                    };
                    
                    // 重建列数据
                    columns.forEach(function(columnData) {
                        var col = columnData.columnIndex;
                        columnarData.columns[col] = new Uint32Array(columnData.data);
                        columnarData.uniqueValues[col] = columnData.uniqueValues;
                        columnarData.valueToIndex[col] = columnData.valueToIndex;
                    });
                    
                    resolve(columnarData);
                };
                
                columnRequest.onerror = function(event) {
                    reject(new Error('加载列数据失败: ' + event.target.error));
                };
            };
            
            tableRequest.onerror = function(event) {
                reject(new Error('查找表失败: ' + event.target.error));
            };
        });
    };

    /**
     * 检查表是否存在
     */
    DatabaseManager.prototype.tableExists = function(tableName) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.db) {
                reject(new Error('数据库未初始化'));
                return;
            }

            var transaction = self.db.transaction([self.tableStoreName], 'readonly');
            var store = transaction.objectStore(self.tableStoreName);
            var request = store.index('name').get(tableName);
            
            request.onsuccess = function(event) {
                resolve(!!event.target.result);
            };
            
            request.onerror = function(event) {
                reject(new Error('检查表存在失败: ' + event.target.error));
            };
        });
    };

    /**
     * 销毁数据库连接
     */
    DatabaseManager.prototype.destroy = function() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    };

    // 暴露到全局
    global.DatabaseManager = DatabaseManager;
    
})(window);