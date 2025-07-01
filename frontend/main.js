// 应用入口点
let tableApp;

document.addEventListener('DOMContentLoaded', function() {
    try {
        // 初始化表格应用
        tableApp = new TableApp('tableCanvas');
        
        console.log('Canvas 表格应用初始化成功');
        
        // 定期输出内存使用情况（开发时用）
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setInterval(() => {
                const memory = tableApp.getMemoryUsage();
                console.log('内存使用情况:', memory);
            }, 10000);
        }
        
    } catch (error) {
        console.error('初始化表格应用时出错:', error);
        
        // 显示错误信息
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = `初始化失败: ${error.message}`;
            statusText.style.color = 'red';
        }
    }
});

// 窗口大小改变现在由InputManager处理

// 全局快捷键将通过InputManager注册

// 开发工具函数（在浏览器控制台中可以使用）
window.tableDebug = {
    getApp: () => tableApp,
    getMemoryUsage: () => tableApp ? tableApp.getMemoryUsage() : null,
    exportData: () => tableApp ? tableApp.exportData() : null,
    setCellValue: (row, col, value) => {
        if (tableApp) {
            tableApp.dataStructures.setCellValue(row, col, value);
            tableApp.renderer.render();
        }
    },
    getCellValue: (row, col) => {
        return tableApp ? tableApp.dataStructures.getCellValue(row, col) : null;
    },
    
    // 持久化相关调试函数
    save: (name) => tableApp ? tableApp.saveToPersistence(name) : null,
    load: (name) => tableApp ? tableApp.loadFromPersistence(name) : null,
    listTables: () => tableApp ? tableApp.listTables() : null,
    getStorageInfo: () => tableApp ? tableApp.getStorageInfo() : null,
    deleteTable: (name) => tableApp ? tableApp.deleteTable(name) : null
};