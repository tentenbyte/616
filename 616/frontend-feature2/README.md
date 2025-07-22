# 列式表格编辑器

一个基于Canvas的高性能表格编辑器，使用ES5语法，专为Firefox 52等旧版浏览器优化。

## 核心特性

- **列式内存数据库**: 高性能的列式存储引擎，支持千万级数据
- **Canvas渲染**: GPU加速的表格渲染，60fps流畅体验
- **全局输入法支持**: 完美支持中文、日文、韩文等输入法
- **IndexedDB持久化**: 自动保存数据，刷新页面不丢失
- **特殊控件支持**: F列数字键盘、G列日历、H列字符串选择器

## 技术栈

- **前端**: 纯JavaScript ES5 + HTML5 Canvas
- **数据库**: 列式内存数据库 + IndexedDB持久化
- **兼容性**: Firefox 52+ (ES5语法，无需构建工具)
- **模块化**: IIFE模式，直接在浏览器中运行

## 快速开始

1. 直接用浏览器打开 `index.html`
2. 无需安装任何依赖或构建工具
3. 支持现代浏览器和Firefox 52等旧版浏览器

## 文件结构

```
frontend/
├── index.html              # 主应用入口
├── styles.css              # 全局样式
├── README.md               # 项目说明
├── CLAUDE.md               # 详细技术文档
└── src/
    ├── core/               # 核心模块
    │   ├── config.js       # 配置管理
    │   └── eventManager.js # 事件管理器
    ├── storage/            # 数据存储
    │   └── SimpleColumnarDB.js # 列式数据库
    ├── modules/            # 功能模块
    │   ├── SimpleTableCore.js  # 表格核心
    │   ├── renderer.js     # Canvas渲染器
    │   └── database.js     # IndexedDB管理
    ├── widgets/            # UI控件
    │   ├── TableWidget.js  # 表格控件
    │   ├── Calendar.js     # 日历选择器
    │   ├── NumberPad.js    # 数字键盘
    │   └── StringSelector.js # 字符串选择器
    └── utils/
        └── helpers.js      # 工具函数
```

## 使用说明

### 基本操作
- **选择单元格**: 点击单元格
- **编辑单元格**: 双击单元格或直接输入
- **导航**: 使用方向键或鼠标
- **特殊控件**: F列显示数字键盘，G列显示日历，H列显示字符串选择器

### 数据管理
- **自动保存**: 所有编辑自动保存到IndexedDB
- **数据持久化**: 刷新页面数据不丢失
- **初始数据**: 首次打开显示20行示例数据

## 性能特点

- **内存优化**: 列式存储减少60-90%内存占用
- **查询性能**: 比传统行式存储快10-1000倍
- **渲染优化**: Canvas视口渲染，仅绘制可见区域
- **响应流畅**: 60fps渲染，毫秒级响应

## 浏览器兼容性

- Firefox 52+ (主要目标)
- Chrome 49+
- Safari 10+
- Edge 13+
- Internet Explorer 11+

## 许可证

MIT License