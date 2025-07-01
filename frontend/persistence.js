class TablePersistence {
    constructor(dbName = 'TimeSeriesTableDB', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.isReady = false;
    }
    
    // 初始化 IndexedDB
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => {
                reject(new Error(`Failed to open database: ${request.error}`));
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                console.log('IndexedDB initialized successfully');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 创建存储表格数据的对象存储
                if (!db.objectStoreNames.contains('tableData')) {
                    const tableStore = db.createObjectStore('tableData', { keyPath: 'id' });
                    tableStore.createIndex('name', 'name', { unique: false });
                    tableStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                console.log('Database schema created/updated');
            };
        });
    }
    
    // 序列化 ArrayBuffer 为可存储的格式
    serializeArrayBuffer(buffer) {
        return {
            type: 'ArrayBuffer',
            data: Array.from(new Uint8Array(buffer))
        };
    }
    
    // 反序列化 ArrayBuffer
    deserializeArrayBuffer(serialized) {
        if (serialized.type !== 'ArrayBuffer') {
            throw new Error('Invalid ArrayBuffer serialization format');
        }
        return new Uint8Array(serialized.data).buffer;
    }
    
    // 序列化 Map 对象
    serializeMap(map) {
        return {
            type: 'Map',
            data: Array.from(map.entries())
        };
    }
    
    // 反序列化 Map 对象
    deserializeMap(serialized) {
        if (serialized.type !== 'Map') {
            throw new Error('Invalid Map serialization format');
        }
        return new Map(serialized.data);
    }
    
    // 保存表格数据到 IndexedDB
    async saveTableData(dataStructures, tableName = 'default') {
        if (!this.isReady) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        
        // 准备序列化的数据
        const serializedData = {
            id: tableName,
            name: tableName,
            timestamp: Date.now(),
            version: '1.0',
            
            // 表格基本信息
            rows: dataStructures.rows,
            cols: dataStructures.cols,
            currentRowCount: dataStructures.currentRowCount,
            nextStringIndex: dataStructures.nextStringIndex,
            
            // 序列化主表 ArrayBuffer (列存储的 uint32 数据)
            cellDataBuffer: this.serializeArrayBuffer(dataStructures.cellDataBuffer),
            
            // 字符串数组 (实际内容)
            stringArray: [...dataStructures.stringArray],
            
            // HashMap (字符串到索引的反向映射)
            stringToIndexMap: this.serializeMap(dataStructures.stringToIndexMap)
        };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tableData'], 'readwrite');
            const store = transaction.objectStore('tableData');
            
            const request = store.put(serializedData);
            
            request.onsuccess = () => {
                console.log(`Table '${tableName}' saved successfully`);
                resolve({
                    success: true,
                    tableName,
                    timestamp: serializedData.timestamp,
                    size: this.calculateDataSize(serializedData)
                });
            };
            
            request.onerror = () => {
                reject(new Error(`Failed to save table '${tableName}': ${request.error}`));
            };
        });
    }
    
    // 从 IndexedDB 加载表格数据
    async loadTableData(tableName = 'default') {
        if (!this.isReady) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tableData'], 'readonly');
            const store = transaction.objectStore('tableData');
            
            const request = store.get(tableName);
            
            request.onsuccess = () => {
                const result = request.result;
                
                if (!result) {
                    reject(new Error(`Table '${tableName}' not found`));
                    return;
                }
                
                try {
                    // 反序列化数据
                    const restoredData = {
                        rows: result.rows,
                        cols: result.cols,
                        currentRowCount: result.currentRowCount,
                        nextStringIndex: result.nextStringIndex,
                        
                        // 恢复 ArrayBuffer
                        cellDataBuffer: this.deserializeArrayBuffer(result.cellDataBuffer),
                        
                        // 恢复字符串数组
                        stringArray: result.stringArray,
                        
                        // 恢复 HashMap
                        stringToIndexMap: this.deserializeMap(result.stringToIndexMap)
                    };
                    
                    console.log(`Table '${tableName}' loaded successfully`);
                    resolve({
                        success: true,
                        tableName,
                        timestamp: result.timestamp,
                        data: restoredData
                    });
                    
                } catch (error) {
                    reject(new Error(`Failed to deserialize table '${tableName}': ${error.message}`));
                }
            };
            
            request.onerror = () => {
                reject(new Error(`Failed to load table '${tableName}': ${request.error}`));
            };
        });
    }
    
    // 列出所有保存的表格
    async listTables() {
        if (!this.isReady) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tableData'], 'readonly');
            const store = transaction.objectStore('tableData');
            
            const request = store.getAll();
            
            request.onsuccess = () => {
                const tables = request.result.map(item => ({
                    name: item.name,
                    timestamp: item.timestamp,
                    rows: item.currentRowCount,
                    cols: item.cols,
                    size: this.calculateDataSize(item),
                    lastModified: new Date(item.timestamp).toLocaleString()
                }));
                
                resolve(tables);
            };
            
            request.onerror = () => {
                reject(new Error(`Failed to list tables: ${request.error}`));
            };
        });
    }
    
    // 删除表格
    async deleteTable(tableName) {
        if (!this.isReady) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tableData'], 'readwrite');
            const store = transaction.objectStore('tableData');
            
            const request = store.delete(tableName);
            
            request.onsuccess = () => {
                console.log(`Table '${tableName}' deleted successfully`);
                resolve({ success: true, tableName });
            };
            
            request.onerror = () => {
                reject(new Error(`Failed to delete table '${tableName}': ${request.error}`));
            };
        });
    }
    
    // 检查表格是否存在
    async tableExists(tableName) {
        if (!this.isReady) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tableData'], 'readonly');
            const store = transaction.objectStore('tableData');
            
            const request = store.get(tableName);
            
            request.onsuccess = () => {
                resolve(!!request.result);
            };
            
            request.onerror = () => {
                reject(new Error(`Failed to check table existence: ${request.error}`));
            };
        });
    }
    
    // 计算数据大小（估算）
    calculateDataSize(data) {
        const jsonString = JSON.stringify(data);
        const sizeInBytes = new Blob([jsonString]).size;
        
        if (sizeInBytes < 1024) {
            return `${sizeInBytes} B`;
        } else if (sizeInBytes < 1024 * 1024) {
            return `${(sizeInBytes / 1024).toFixed(1)} KB`;
        } else {
            return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
        }
    }
    
    // 清空所有数据（谨慎使用）
    async clearAllData() {
        if (!this.isReady) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tableData'], 'readwrite');
            const store = transaction.objectStore('tableData');
            
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log('All table data cleared');
                resolve({ success: true });
            };
            
            request.onerror = () => {
                reject(new Error(`Failed to clear data: ${request.error}`));
            };
        });
    }
    
    // 获取数据库使用情况
    async getStorageInfo() {
        if (!this.isReady) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        
        try {
            const tables = await this.listTables();
            const totalTables = tables.length;
            
            // 计算总数据量
            let totalRows = 0;
            tables.forEach(table => {
                totalRows += table.rows;
            });
            
            return {
                databaseName: this.dbName,
                version: this.version,
                totalTables,
                totalRows,
                tables: tables.sort((a, b) => b.timestamp - a.timestamp)
            };
            
        } catch (error) {
            throw new Error(`Failed to get storage info: ${error.message}`);
        }
    }
    
    // 关闭数据库连接
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isReady = false;
            console.log('Database connection closed');
        }
    }
}