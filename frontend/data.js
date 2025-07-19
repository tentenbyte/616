// 库存管理数据模块
const InventoryData = {
    // 当前表格类型
    currentTable: 'items',
    
    // 筛选和排序状态
    filterText: '',
    columnFilters: {}, // 每列的筛选条件
    sortColumn: '',
    sortDirection: 'asc',
    
    // 物品表数据
    itemsData: [
        ['编号', '名称', '分类', '规格', '单位', '库存', '成本', '售价', '供应商', '更新时间'],
        ['ITM001', '办公椅', '办公家具', '人体工学', '张', '25', '280.00', '420.00', '华美家具', '2024-01-15'],
        ['ITM002', 'A4复印纸', '办公用品', '70g/㎡', '包', '150', '28.00', '35.00', '晨光文具', '2024-01-14'],
        ['ITM003', '激光打印机', '办公设备', 'HP1020', '台', '8', '1200.00', '1800.00', '惠普代理', '2024-01-13'],
        ['ITM004', '钢笔', '文具用品', '0.5mm', '支', '200', '15.00', '25.00', '晨光文具', '2024-01-12'],
        ['ITM005', '笔记本电脑', '电子设备', 'ThinkPad', '台', '12', '4500.00', '6800.00', '联想专卖', '2024-01-11'],
        ['ITM006', '文件柜', '办公家具', '四抽屉', '个', '15', '450.00', '680.00', '华美家具', '2024-01-10'],
        ['ITM007', '投影仪', '办公设备', '3000流明', '台', '6', '2800.00', '4200.00', '爱普生', '2024-01-09'],
        ['ITM008', '白板', '办公用品', '120x90cm', '块', '20', '180.00', '280.00', '得力办公', '2024-01-08'],
        ['ITM009', '键盘', '电子设备', '机械键盘', '个', '30', '120.00', '180.00', '罗技', '2024-01-07'],
        ['ITM010', '鼠标', '电子设备', '无线鼠标', '个', '45', '65.00', '98.00', '罗技', '2024-01-06'],
        ['ITM011', '订书机', '文具用品', '标准型', '个', '35', '25.00', '38.00', '得力办公', '2024-01-05'],
        ['ITM012', '橡皮擦', '文具用品', '4B橡皮', '块', '500', '0.80', '1.50', '晨光文具', '2024-01-04'],
        ['ITM013', '荧光笔', '文具用品', '多色套装', '套', '80', '12.00', '18.00', '晨光文具', '2024-01-03'],
        ['ITM014', '计算器', '办公用品', '科学计算器', '个', '20', '45.00', '68.00', '卡西欧', '2024-01-02']
    ],
    
    // 交易表数据
    transactionsData: [
        ['编号', '名称', '类型', '数量', '单价', '总额', '操作员', '时间', '备注'],
        ['ITM001', '办公椅', '入库', '30', '280.00', '8400.00', '张三', '2024-01-15 09:30', '新品入库'],
        ['ITM001', '办公椅', '出库', '5', '420.00', '2100.00', '李四', '2024-01-15 14:20', '销售出库'],
        ['ITM002', 'A4复印纸', '入库', '200', '28.00', '5600.00', '王五', '2024-01-14 10:15', '批量采购'],
        ['ITM002', 'A4复印纸', '出库', '50', '35.00', '1750.00', '赵六', '2024-01-14 16:45', '办公使用'],
        ['ITM003', '激光打印机', '入库', '10', '1200.00', '12000.00', '孙七', '2024-01-13 11:00', '设备采购'],
        ['ITM003', '激光打印机', '出库', '2', '1800.00', '3600.00', '周八', '2024-01-13 15:30', '部门配置'],
        ['ITM004', '钢笔', '入库', '500', '15.00', '7500.00', '吴九', '2024-01-12 09:00', '文具补充'],
        ['ITM004', '钢笔', '出库', '300', '25.00', '7500.00', '郑十', '2024-01-12 14:00', '员工发放'],
        ['ITM005', '笔记本电脑', '入库', '15', '4500.00', '67500.00', '张三', '2024-01-11 10:30', '设备更新'],
        ['ITM005', '笔记本电脑', '出库', '3', '6800.00', '20400.00', '李四', '2024-01-11 16:00', '新员工配发'],
        ['ITM006', '文件柜', '入库', '20', '450.00', '9000.00', '王五', '2024-01-10 11:30', '办公家具'],
        ['ITM006', '文件柜', '出库', '5', '680.00', '3400.00', '赵六', '2024-01-10 15:45', '新办公区'],
        ['ITM007', '投影仪', '入库', '8', '2800.00', '22400.00', '孙七', '2024-01-09 09:45', '会议设备'],
        ['ITM007', '投影仪', '出库', '2', '4200.00', '8400.00', '周八', '2024-01-09 14:15', '培训室配置'],
        ['ITM008', '白板', '入库', '25', '180.00', '4500.00', '吴九', '2024-01-08 10:00', '教学用品'],
        ['ITM008', '白板', '出库', '5', '280.00', '1400.00', '郑十', '2024-01-08 16:30', '会议室安装']
    ],
    
    // 获取当前表格数据
    getCurrentData() {
        let data = this.currentTable === 'items' ? this.itemsData : this.transactionsData;
        
        // 应用筛选
        if (this.filterText) {
            data = this.applyFilter(data);
        }
        
        // 应用排序
        if (this.sortColumn) {
            data = this.applySort(data);
        }
        
        return data;
    },
    
    // 获取原始数据（不应用筛选和排序）
    getRawData() {
        return this.currentTable === 'items' ? this.itemsData : this.transactionsData;
    },
    
    // 应用筛选
    applyFilter(data) {
        if (!this.filterText && Object.keys(this.columnFilters).length === 0) return data;
        
        const filtered = [data[0]]; // 保留表头
        const headers = data[0];
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            let match = true;
            
            // 全局筛选
            if (this.filterText) {
                const filterLower = this.filterText.toLowerCase();
                match = row.some(cell => 
                    String(cell).toLowerCase().includes(filterLower)
                );
            }
            
            // 列筛选 (Excel样式)
            if (match && Object.keys(this.columnFilters).length > 0) {
                for (const columnName in this.columnFilters) {
                    const selectedValues = this.columnFilters[columnName];
                    if (selectedValues && selectedValues.length > 0) {
                        const columnIndex = headers.indexOf(columnName);
                        if (columnIndex >= 0) {
                            const cellValue = String(row[columnIndex]);
                            if (!selectedValues.includes(cellValue)) {
                                match = false;
                                break;
                            }
                        }
                    }
                }
            }
            
            if (match) {
                filtered.push(row);
            }
        }
        
        return filtered;
    },
    
    // 应用排序
    applySort(data) {
        if (!this.sortColumn) return data;
        
        const header = data[0];
        const columnIndex = header.indexOf(this.sortColumn);
        if (columnIndex === -1) return data;
        
        const sorted = [header]; // 保留表头
        const dataRows = data.slice(1);
        
        dataRows.sort((a, b) => {
            let aVal = a[columnIndex];
            let bVal = b[columnIndex];
            
            // 数字排序
            const aNum = parseFloat(aVal);
            const bNum = parseFloat(bVal);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return this.sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
            }
            
            // 字符串排序
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
            
            if (this.sortDirection === 'asc') {
                return aVal.localeCompare(bVal);
            } else {
                return bVal.localeCompare(aVal);
            }
        });
        
        return sorted.concat(dataRows);
    },
    
    // 设置筛选条件
    setFilter(filterText) {
        this.filterText = filterText;
    },
    
    // 设置列筛选 (Excel样式 - 支持多值数组)
    setColumnFilter(columnName, selectedValues) {
        if (selectedValues && selectedValues.length > 0) {
            this.columnFilters[columnName] = selectedValues;
        } else {
            delete this.columnFilters[columnName];
        }
    },
    
    // 设置排序
    setSort(column, direction = 'asc') {
        this.sortColumn = column;
        this.sortDirection = direction;
    },
    
    // 清除筛选和排序
    clearFiltersAndSort() {
        this.filterText = '';
        this.columnFilters = {};
        this.sortColumn = '';
        this.sortDirection = 'asc';
    },
    
    // 获取单元格数据
    getCellData(row, col) {
        const data = this.getCurrentData();
        if (row < 0 || row >= data.length || col < 0 || col >= data[0].length) {
            return '';
        }
        return data[row][col];
    },
    
    // 设置单元格数据
    setCellData(row, col, value) {
        const data = this.getRawData(); // 直接修改原始数据
        if (row >= 0 && row < data.length && col >= 0 && col < data[0].length) {
            data[row][col] = value;
        }
    },
    
    // 获取行数
    getRowCount() {
        const data = this.getCurrentData();
        return data.length;
    },
    
    // 获取列数
    getColCount() {
        const data = this.getCurrentData();
        return data[0] ? data[0].length : 0;
    },
    
    // 切换表格类型
    setTableType(tableType) {
        this.currentTable = tableType;
    },
    
    // 获取当前表格名称
    getCurrentTableName() {
        return this.currentTable === 'items' ? '物品表' : '交易表';
    },
    
    // 添加新记录
    addNewItem(data) {
        const currentData = this.getRawData(); // 添加到原始数据
        currentData.push(data);
    },
    
    // 删除记录
    deleteItem(row) {
        const currentData = this.getCurrentData();
        if (row > 0 && row < currentData.length) { // 不能删除表头
            currentData.splice(row, 1);
        }
    },
    
    // 获取统计信息
    getStatistics() {
        const data = this.getCurrentData();
        const recordCount = Math.max(0, data.length - 1); // 减去表头
        
        let totalValue = 0;
        if (this.currentTable === 'items') {
            // 计算库存总价值
            for (let i = 1; i < data.length; i++) {
                const quantity = parseFloat(data[i][5]) || 0;
                const price = parseFloat(data[i][6]) || 0;
                totalValue += quantity * price;
            }
        } else {
            // 计算交易总金额
            for (let i = 1; i < data.length; i++) {
                const amount = parseFloat(data[i][6]) || 0;
                totalValue += amount;
            }
        }
        
        return {
            recordCount: recordCount,
            totalValue: totalValue.toFixed(2)
        };
    }
};