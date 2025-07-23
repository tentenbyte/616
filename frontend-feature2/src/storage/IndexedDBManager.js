/**
 * IndexedDB管理器 - 列式表格持久化
 * 专门为列式内存数据库设计的高性能持久化方案
 * ES5兼容，Firefox 52支持
 */
(function(global) {
    'use strict';

    /**
     * IndexedDB管理器
     * @param {string} dbName 数据库名称
     * @param {number} version 数据库版本
     */
    function IndexedDBManager(dbName, version) {
        this.dbName = dbName || 'ColumnarTableDB';
        this.version = version || 1;
        this.db = null;
        this.isReady = false;
        
        // 存储结构定义
        this.storeNames = {
            metadata: 'table_metadata',      // 表格元数据
            columns: 'column_data',          // 列数据存储
            stringPools: 'string_pools',     // 字符串池
            displayState: 'display_state'    // 显示状态
        };
        
        // 事件回调
        this.onReady = null;
        this.onError = null;
        
        // 性能统计
        this.stats = {
            saveCount: 0,
            loadCount: 0,
            totalSaveTime: 0,
            totalLoadTime: 0
        };
    }

    /**
     * 初始化数据库连接
     * @returns {Promise} 初始化结果
     */
    IndexedDBManager.prototype.initialize = function() {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            // 检查浏览器支持
            if (!global.indexedDB) {
                reject(new Error('IndexedDB不被当前浏览器支持'));
                return;
            }

            var request = global.indexedDB.open(self.dbName, self.version);
            
            request.onerror = function(event) {
                var error = new Error('IndexedDB打开失败: ' + event.target.error);
                self._handleError(error);
                reject(error);
            };
            
            request.onsuccess = function(event) {
                self.db = event.target.result;
                self.isReady = true;
                
                // 设置错误处理
                self.db.onerror = function(err) {
                    self._handleError(new Error('IndexedDB运行时错误: ' + err));
                };
                
                console.log('✅ IndexedDB初始化成功:', self.dbName, 'v' + self.version);
                if (self.onReady) self.onReady();
                resolve(self);
            };
            
            request.onupgradeneeded = function(event) {
                console.log('🔧 IndexedDB升级中...');
                self._setupDatabase(event.target.result);
            };
        });
    };

    /**
     * 设置数据库结构
     * @param {IDBDatabase} db 数据库实例
     */
    IndexedDBManager.prototype._setupDatabase = function(db) {
        // 清理旧的存储（如果存在）
        var existingStores = Array.from(db.objectStoreNames);
        for (var i = 0; i < existingStores.length; i++) {
            if (db.objectStoreNames.contains(existingStores[i])) {
                db.deleteObjectStore(existingStores[i]);
            }
        }

        // 1. 元数据存储 - 存储表格基本信息
        var metadataStore = db.createObjectStore(this.storeNames.metadata, {
            keyPath: 'key'
        });
        metadataStore.createIndex('timestamp', 'timestamp', { unique: false });

        // 2. 列数据存储 - 存储每列的Uint32Array数据
        var columnsStore = db.createObjectStore(this.storeNames.columns, {
            keyPath: 'columnIndex'
        });
        columnsStore.createIndex('lastModified', 'lastModified', { unique: false });

        // 3. 字符串池存储 - 存储每列的字符串池和映射
        var stringPoolsStore = db.createObjectStore(this.storeNames.stringPools, {
            keyPath: 'columnIndex'
        });
        stringPoolsStore.createIndex('poolSize', 'poolSize', { unique: false });

        // 4. 显示状态存储 - 存储排序和筛选状态
        var displayStateStore = db.createObjectStore(this.storeNames.displayState, {
            keyPath: 'key'
        });
        displayStateStore.createIndex('timestamp', 'timestamp', { unique: false });

        console.log('✅ IndexedDB数据库结构创建完成');
    };

    /**
     * 保存表格元数据
     * @param {Object} metadata 元数据对象
     * @returns {Promise} 保存结果
     */
    IndexedDBManager.prototype.saveMetadata = function(metadata) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var startTime = performance.now();
            var transaction = self.db.transaction([self.storeNames.metadata], 'readwrite');
            var store = transaction.objectStore(self.storeNames.metadata);
            
            var data = {
                key: 'main',
                timestamp: Date.now(),
                maxRows: metadata.maxRows,
                maxCols: metadata.maxCols,
                totalRows: metadata.totalRows,
                visibleRows: metadata.visibleRows,
                columnNames: metadata.columnNames,
                version: '2.1.0'
            };
            
            var request = store.put(data);
            
            request.onsuccess = function() {
                var duration = performance.now() - startTime;
                self.stats.totalSaveTime += duration;
                console.log('✅ 元数据保存成功 (' + duration.toFixed(2) + 'ms)');
                resolve();
            };
            
            request.onerror = function(event) {
                reject(new Error('元数据保存失败: ' + event.target.error));
            };
        });
    };

    /**
     * 保存列数据
     * @param {number} columnIndex 列索引
     * @param {Uint32Array} columnData 列数据
     * @returns {Promise} 保存结果
     */
    IndexedDBManager.prototype.saveColumnData = function(columnIndex, columnData) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var startTime = performance.now();
            var transaction = self.db.transaction([self.storeNames.columns], 'readwrite');
            var store = transaction.objectStore(self.storeNames.columns);
            
            // 将Uint32Array转换为ArrayBuffer进行存储
            var buffer = columnData.buffer.slice(0, columnData.length * 4);
            
            var data = {
                columnIndex: columnIndex,
                lastModified: Date.now(),
                dataLength: columnData.length,
                buffer: buffer
            };
            
            var request = store.put(data);
            
            request.onsuccess = function() {
                var duration = performance.now() - startTime;
                self.stats.totalSaveTime += duration;
                self.stats.saveCount++;
                console.log('✅ 列' + columnIndex + '数据保存成功 (' + duration.toFixed(2) + 'ms, ' + 
                           (buffer.byteLength / 1024).toFixed(1) + 'KB)');
                resolve();
            };
            
            request.onerror = function(event) {
                reject(new Error('列数据保存失败: ' + event.target.error));
            };
        });
    };

    /**
     * 保存字符串池
     * @param {number} columnIndex 列索引
     * @param {Array} stringPool 字符串池数组
     * @param {Object} stringMap 字符串映射对象
     * @returns {Promise} 保存结果
     */
    IndexedDBManager.prototype.saveStringPool = function(columnIndex, stringPool, stringMap) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var startTime = performance.now();
            var transaction = self.db.transaction([self.storeNames.stringPools], 'readwrite');
            var store = transaction.objectStore(self.storeNames.stringPools);
            
            var data = {
                columnIndex: columnIndex,
                lastModified: Date.now(),
                poolSize: stringPool.length,
                stringPool: stringPool,
                stringMap: stringMap
            };
            
            var request = store.put(data);
            
            request.onsuccess = function() {
                var duration = performance.now() - startTime;
                self.stats.totalSaveTime += duration;
                console.log('✅ 列' + columnIndex + '字符串池保存成功 (' + duration.toFixed(2) + 'ms, ' + 
                           stringPool.length + '项)');
                resolve();
            };
            
            request.onerror = function(event) {
                reject(new Error('字符串池保存失败: ' + event.target.error));
            };
        });
    };

    /**
     * 保存显示状态
     * @param {Uint32Array} displayIndices 显示索引数组
     * @param {Object} sortState 排序状态
     * @returns {Promise} 保存结果
     */
    IndexedDBManager.prototype.saveDisplayState = function(displayIndices, sortState) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var startTime = performance.now();
            var transaction = self.db.transaction([self.storeNames.displayState], 'readwrite');
            var store = transaction.objectStore(self.storeNames.displayState);
            
            // 只保存有效的显示索引
            var buffer = displayIndices.buffer.slice(0, displayIndices.length * 4);
            
            var data = {
                key: 'display',
                timestamp: Date.now(),
                indicesLength: displayIndices.length,
                indicesBuffer: buffer,
                sortState: sortState
            };
            
            var request = store.put(data);
            
            request.onsuccess = function() {
                var duration = performance.now() - startTime;
                self.stats.totalSaveTime += duration;
                console.log('✅ 显示状态保存成功 (' + duration.toFixed(2) + 'ms)');
                resolve();
            };
            
            request.onerror = function(event) {
                reject(new Error('显示状态保存失败: ' + event.target.error));
            };
        });
    };

    /**
     * 加载表格元数据
     * @returns {Promise} 元数据对象
     */
    IndexedDBManager.prototype.loadMetadata = function() {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var startTime = performance.now();
            var transaction = self.db.transaction([self.storeNames.metadata], 'readonly');
            var store = transaction.objectStore(self.storeNames.metadata);
            var request = store.get('main');
            
            request.onsuccess = function(event) {
                var duration = performance.now() - startTime;
                self.stats.totalLoadTime += duration;
                self.stats.loadCount++;
                
                var result = event.target.result;
                if (result) {
                    console.log('✅ 元数据加载成功 (' + duration.toFixed(2) + 'ms)');
                    resolve({
                        maxRows: result.maxRows,
                        maxCols: result.maxCols,
                        totalRows: result.totalRows,
                        visibleRows: result.visibleRows,
                        columnNames: result.columnNames,
                        timestamp: result.timestamp,
                        version: result.version
                    });
                } else {
                    console.log('ℹ️ 无已保存的元数据');
                    resolve(null);
                }
            };
            
            request.onerror = function(event) {
                reject(new Error('元数据加载失败: ' + event.target.error));
            };
        });
    };

    /**
     * 加载列数据
     * @param {number} columnIndex 列索引
     * @returns {Promise} Uint32Array数据
     */
    IndexedDBManager.prototype.loadColumnData = function(columnIndex) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var startTime = performance.now();
            var transaction = self.db.transaction([self.storeNames.columns], 'readonly');
            var store = transaction.objectStore(self.storeNames.columns);
            var request = store.get(columnIndex);
            
            request.onsuccess = function(event) {
                var duration = performance.now() - startTime;
                self.stats.totalLoadTime += duration;
                
                var result = event.target.result;
                if (result) {
                    // 从ArrayBuffer恢复Uint32Array
                    var columnData = new Uint32Array(result.buffer);
                    console.log('✅ 列' + columnIndex + '数据加载成功 (' + duration.toFixed(2) + 'ms, ' +
                               result.dataLength + '行)');
                    resolve(columnData);
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = function(event) {
                reject(new Error('列数据加载失败: ' + event.target.error));
            };
        });
    };

    /**
     * 加载字符串池
     * @param {number} columnIndex 列索引
     * @returns {Promise} 字符串池对象
     */
    IndexedDBManager.prototype.loadStringPool = function(columnIndex) {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var startTime = performance.now();
            var transaction = self.db.transaction([self.storeNames.stringPools], 'readonly');
            var store = transaction.objectStore(self.storeNames.stringPools);
            var request = store.get(columnIndex);
            
            request.onsuccess = function(event) {
                var duration = performance.now() - startTime;
                self.stats.totalLoadTime += duration;
                
                var result = event.target.result;
                if (result) {
                    console.log('✅ 列' + columnIndex + '字符串池加载成功 (' + duration.toFixed(2) + 'ms, ' +
                               result.poolSize + '项)');
                    resolve({
                        stringPool: result.stringPool,
                        stringMap: result.stringMap
                    });
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = function(event) {
                reject(new Error('字符串池加载失败: ' + event.target.error));
            };
        });
    };

    /**
     * 加载显示状态
     * @returns {Promise} 显示状态对象
     */
    IndexedDBManager.prototype.loadDisplayState = function() {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var startTime = performance.now();
            var transaction = self.db.transaction([self.storeNames.displayState], 'readonly');
            var store = transaction.objectStore(self.storeNames.displayState);
            var request = store.get('display');
            
            request.onsuccess = function(event) {
                var duration = performance.now() - startTime;
                self.stats.totalLoadTime += duration;
                
                var result = event.target.result;
                if (result) {
                    // 从ArrayBuffer恢复Uint32Array
                    var displayIndices = new Uint32Array(result.indicesBuffer);
                    console.log('✅ 显示状态加载成功 (' + duration.toFixed(2) + 'ms)');
                    resolve({
                        displayIndices: displayIndices,
                        sortState: result.sortState,
                        timestamp: result.timestamp
                    });
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = function(event) {
                reject(new Error('显示状态加载失败: ' + event.target.error));
            };
        });
    };

    /**
     * 清空所有数据
     * @returns {Promise} 清空结果
     */
    IndexedDBManager.prototype.clearAllData = function() {
        var self = this;
        
        return new Promise(function(resolve, reject) {
            if (!self.isReady) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }

            var storeNames = Object.values(self.storeNames);
            var transaction = self.db.transaction(storeNames, 'readwrite');
            var promises = [];
            
            for (var i = 0; i < storeNames.length; i++) {
                var store = transaction.objectStore(storeNames[i]);
                promises.push(new Promise(function(res, rej) {
                    var clearRequest = store.clear();
                    clearRequest.onsuccess = function() { res(); };
                    clearRequest.onerror = function(e) { rej(e); };
                }));
            }
            
            Promise.all(promises).then(function() {
                console.log('✅ 所有数据清空完成');
                resolve();
            }).catch(reject);
        });
    };

    /**
     * 获取性能统计信息
     * @returns {Object} 统计信息
     */
    IndexedDBManager.prototype.getStats = function() {
        return {
            saveCount: this.stats.saveCount,
            loadCount: this.stats.loadCount,
            avgSaveTime: this.stats.saveCount > 0 ? 
                        (this.stats.totalSaveTime / this.stats.saveCount).toFixed(2) : 0,
            avgLoadTime: this.stats.loadCount > 0 ? 
                        (this.stats.totalLoadTime / this.stats.loadCount).toFixed(2) : 0,
            totalSaveTime: this.stats.totalSaveTime.toFixed(2),
            totalLoadTime: this.stats.totalLoadTime.toFixed(2)
        };
    };

    /**
     * 关闭数据库连接
     */
    IndexedDBManager.prototype.close = function() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isReady = false;
            console.log('✅ IndexedDB连接已关闭');
        }
    };

    /**
     * 错误处理
     * @param {Error} error 错误对象
     */
    IndexedDBManager.prototype._handleError = function(error) {
        console.error('❌ IndexedDB错误:', error);
        if (this.onError) {
            this.onError(error);
        }
    };

    // 暴露到全局
    global.IndexedDBManager = IndexedDBManager;
    
})(window);