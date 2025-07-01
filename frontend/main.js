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

// 窗口大小改变时重新适配 Canvas
window.addEventListener('resize', function() {
    if (tableApp && tableApp.renderer) {
        setTimeout(() => {
            tableApp.renderer.setupHighDPI();
            tableApp.renderer.render();
        }, 100);
    }
});

// 全局键盘快捷键
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + S: 保存数据（这里只是示例）
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (tableApp) {
            const data = tableApp.exportData();
            console.log('导出的数据:', data);
            tableApp.updateStatusBar('数据已导出到控制台');
        }
    }
    
    // Ctrl/Cmd + Z: 撤销（待实现）
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (tableApp) {
            tableApp.updateStatusBar('撤销功能待实现');
        }
    }
});

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
    }
};