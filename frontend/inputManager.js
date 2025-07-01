/**
 * InputManager - 统一的输入事件管理器
 * 
 * 职责：
 * 1. 统一管理所有键盘、鼠标、触摸事件
 * 2. 基于应用状态智能路由事件
 * 3. 处理事件优先级和冲突解决
 * 4. 提供坐标转换和工具方法
 */
class InputManager {
    constructor(canvas, tableApp) {
        this.canvas = canvas;
        this.tableApp = tableApp;
        
        // 应用状态
        this.state = {
            mode: 'normal', // normal, editing, selecting
            isEditing: false,
            selectedCell: { row: -1, col: -1 },
            isDragging: false,
            isResizing: false
        };
        
        // 事件处理器注册表
        this.handlers = {
            // 鼠标事件处理器
            mouse: {
                click: [],
                dblclick: [],
                mousedown: [],
                mousemove: [],
                mouseup: [],
                wheel: []
            },
            // 键盘事件处理器
            keyboard: {
                keydown: [],
                keyup: [],
                input: []
            },
            // 系统事件处理器
            system: {
                resize: [],
                focus: [],
                blur: []
            }
        };
        
        // 事件优先级配置
        this.priority = {
            editing: 100,    // 编辑状态最高优先级
            navigation: 50,  // 导航操作中等优先级
            global: 10       // 全局快捷键最低优先级
        };
        
        // 绑定所有事件监听器
        this.bindAllEvents();
        
        // 初始化坐标转换工具
        this.setupCoordinateUtils();
    }
    
    // 绑定所有事件监听器（统一入口）
    bindAllEvents() {
        // 鼠标事件
        this.canvas.addEventListener('click', (e) => this.handleMouseEvent('click', e));
        this.canvas.addEventListener('dblclick', (e) => this.handleMouseEvent('dblclick', e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseEvent('mousedown', e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseEvent('mousemove', e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseEvent('mouseup', e));
        this.canvas.addEventListener('wheel', (e) => this.handleMouseEvent('wheel', e));
        
        // 键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyboardEvent('keydown', e));
        document.addEventListener('keyup', (e) => this.handleKeyboardEvent('keyup', e));
        document.addEventListener('input', (e) => this.handleKeyboardEvent('input', e));
        
        // 系统事件
        window.addEventListener('resize', (e) => this.handleSystemEvent('resize', e));
        window.addEventListener('focus', (e) => this.handleSystemEvent('focus', e));
        window.addEventListener('blur', (e) => this.handleSystemEvent('blur', e));
        document.addEventListener('DOMContentLoaded', (e) => this.handleSystemEvent('domready', e));
    }
    
    // 注册事件处理器
    registerHandler(eventType, category, handler, priority = 50) {
        if (!this.handlers[category] || !this.handlers[category][eventType]) {
            console.warn(`Invalid event type: ${category}.${eventType}`);
            return;
        }
        
        this.handlers[category][eventType].push({
            handler,
            priority,
            id: Math.random().toString(36).substr(2, 9)
        });
        
        // 按优先级排序
        this.handlers[category][eventType].sort((a, b) => b.priority - a.priority);
    }
    
    // 鼠标事件统一处理
    handleMouseEvent(eventType, e) {
        // 获取Canvas坐标
        const coords = this.getCanvasCoordinates(e);
        
        // 创建增强的事件对象
        const enhancedEvent = {
            originalEvent: e,
            type: eventType,
            canvasX: coords.x,
            canvasY: coords.y,
            cell: this.getCellFromCoordinates(coords.x, coords.y),
            state: { ...this.state },
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation()
        };
        
        // 分发事件
        this.dispatchEvent('mouse', eventType, enhancedEvent);
    }
    
    // 键盘事件统一处理
    handleKeyboardEvent(eventType, e) {
        // 创建增强的事件对象
        const enhancedEvent = {
            originalEvent: e,
            type: eventType,
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            state: { ...this.state },
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation()
        };
        
        // 分发事件
        this.dispatchEvent('keyboard', eventType, enhancedEvent);
    }
    
    // 系统事件统一处理
    handleSystemEvent(eventType, e) {
        const enhancedEvent = {
            originalEvent: e,
            type: eventType,
            state: { ...this.state },
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation()
        };
        
        this.dispatchEvent('system', eventType, enhancedEvent);
    }
    
    // 事件分发机制
    dispatchEvent(category, eventType, enhancedEvent) {
        const handlers = this.handlers[category]?.[eventType] || [];
        
        for (const handlerInfo of handlers) {
            try {
                // 调用处理器，如果返回true表示事件已处理，停止传播
                const result = handlerInfo.handler(enhancedEvent);
                if (result === true) {
                    enhancedEvent.preventDefault();
                    break;
                }
            } catch (error) {
                console.error(`Error in ${category}.${eventType} handler:`, error);
            }
        }
    }
    
    // 坐标转换工具
    setupCoordinateUtils() {
        this.coordinateUtils = {
            // Canvas坐标转换
            getCanvasCoordinates: (e) => this.getCanvasCoordinates(e),
            // 单元格坐标转换
            getCellFromCoordinates: (x, y) => this.getCellFromCoordinates(x, y),
            // 像素坐标转Canvas坐标
            pixelToCanvas: (pixelX, pixelY) => this.pixelToCanvas(pixelX, pixelY)
        };
    }
    
    // 获取Canvas坐标
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    // 从坐标获取单元格位置
    getCellFromCoordinates(x, y) {
        // 这里需要访问renderer的配置，暂时使用固定值
        // 后续会通过依赖注入获取renderer引用
        const cellWidth = this.tableApp.renderer?.config?.cellWidth || 100;
        const cellHeight = this.tableApp.renderer?.config?.cellHeight || 30;
        const headerHeight = this.tableApp.renderer?.config?.headerHeight || 35;
        const scrollX = this.tableApp.renderer?.scrollX || 0;
        const scrollY = this.tableApp.renderer?.scrollY || 0;
        
        const col = Math.floor((x + scrollX) / cellWidth);
        const row = Math.floor((y + scrollY - headerHeight) / cellHeight);
        
        return { row, col };
    }
    
    // 更新应用状态
    updateState(newState) {
        this.state = { ...this.state, ...newState };
    }
    
    // 获取当前状态
    getState() {
        return { ...this.state };
    }
    
    // 销毁事件管理器
    destroy() {
        // 移除所有事件监听器
        // 这里可以添加清理逻辑
        this.handlers = { mouse: {}, keyboard: {}, system: {} };
    }
}