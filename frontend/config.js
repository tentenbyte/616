// 库存管理系统配置
const InventoryConfig = {
    // Canvas 表格配置
    canvas: {
        cellWidth: 120,
        cellHeight: 35,
        minCellWidth: 80,
        maxCellWidth: 200
    },
    
    // 表格样式配置
    styles: {
        // 边框样式
        border: {
            color: '#d0d0d0',
            width: 1
        },
        
        // 表头样式
        header: {
            backgroundColor: '#f8f9fa',
            textColor: '#212529',
            fontWeight: 'bold',
            borderColor: '#adb5bd'
        },
        
        // 普通单元格样式
        cell: {
            backgroundColor: '#ffffff',
            textColor: '#212529',
            alternateBackgroundColor: '#f8f9fa'
        },
        
        // 选中单元格样式
        selected: {
            backgroundColor: '#e3f2fd',
            borderColor: '#2196f3',
            borderWidth: 2
        },
        
        // 字体配置
        font: {
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            size: 13,
            headerSize: 14
        },
        
        // 数值单元格样式
        number: {
            textAlign: 'right',
            color: '#007bff'
        },
        
        // 状态单元格样式
        status: {
            colors: {
                '入库': '#28a745',
                '出库': '#dc3545',
                '正常': '#28a745',
                '缺货': '#dc3545',
                '预警': '#ffc107'
            }
        }
    },
    
    // 交互配置
    interaction: {
        // 双击编辑
        doubleClickEdit: true,
        
        // 键盘导航
        keyboardNavigation: true,
        
        // 鼠标选择
        mouseSelection: true,
        
        // 滚动配置
        scroll: {
            speed: 30,
            smoothScroll: true
        }
    },
    
    // 表格列配置
    columns: {
        // 物品表列配置
        items: [
            { key: 'id', title: '编号', width: 100, type: 'text', editable: false },
            { key: 'name', title: '名称', width: 150, type: 'text', editable: true },
            { key: 'category', title: '分类', width: 100, type: 'text', editable: true },
            { key: 'spec', title: '规格', width: 120, type: 'text', editable: true },
            { key: 'unit', title: '单位', width: 80, type: 'text', editable: true },
            { key: 'quantity', title: '库存', width: 100, type: 'number', editable: true },
            { key: 'cost', title: '成本', width: 100, type: 'currency', editable: true },
            { key: 'price', title: '售价', width: 100, type: 'currency', editable: true },
            { key: 'supplier', title: '供应商', width: 120, type: 'text', editable: true },
            { key: 'updated', title: '更新时间', width: 120, type: 'date', editable: false }
        ],
        
        // 交易表列配置
        transactions: [
            { key: 'itemId', title: '编号', width: 100, type: 'text', editable: true },
            { key: 'itemName', title: '名称', width: 150, type: 'text', editable: true },
            { key: 'type', title: '类型', width: 100, type: 'select', editable: true, options: ['入库', '出库'] },
            { key: 'quantity', title: '数量', width: 80, type: 'number', editable: true },
            { key: 'price', title: '单价', width: 100, type: 'currency', editable: true },
            { key: 'total', title: '总额', width: 100, type: 'currency', editable: false },
            { key: 'operator', title: '操作员', width: 100, type: 'text', editable: true },
            { key: 'time', title: '时间', width: 150, type: 'datetime', editable: false },
            { key: 'note', title: '备注', width: 150, type: 'text', editable: true }
        ]
    },
    
    // 数据验证规则
    validation: {
        required: ['编号', '名称'],
        number: ['库存', '数量', '成本', '售价', '单价', '总额'],
        currency: ['成本', '售价', '单价', '总额'],
        date: ['更新时间', '时间']
    },
    
    // 系统配置
    system: {
        // 自动保存间隔(秒)
        autoSaveInterval: 30,
        
        // 最大撤销步数
        maxUndoSteps: 50,
        
        // 分页配置
        pagination: {
            pageSize: 100,
            maxVisiblePages: 10
        }
    }
};